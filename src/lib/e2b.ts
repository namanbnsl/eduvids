import { CommandExitError, Sandbox } from "@e2b/code-interpreter";
import { Buffer } from "node:buffer";
import {
  detectUsedPlugins,
  validateAllPlugins,
  getPluginInstallCommands,
  MANIM_PLUGINS,
} from "./manim-plugins";
import {
  getLayoutConfig,
  getCompleteLayoutCode,
  detectContentType,
} from "./manim-layout-engine";

const MAX_COMMAND_OUTPUT_CHARS = 4000;
let latexEnvironmentVerified = false;

// Track which plugins have been installed per sandbox session
const installedPluginsCache = new Map<string, Set<string>>();

export type ValidationStage =
  | "input"
  | "heuristic"
  | "syntax"
  | "ast-guard"
  | "scene-validation"
  | "plugin-detection"
  | "plugin-installation"
  | "plugin-validation"
  | "layout-injection"
  | "latex"
  | "render"
  | "video-validation"
  | "watermark"
  | "watermark-validation"
  | "download";

export interface RenderLogEntry {
  timestamp: string;
  level: "info" | "warn" | "error" | "stdout" | "stderr";
  message: string;
  context?: string;
}

class ManimValidationError extends Error {
  constructor(
    message: string,
    readonly stage: ValidationStage,
    readonly options: {
      hint?: string;
      stdout?: string;
      stderr?: string;
      exitCode?: number;
      logs?: RenderLogEntry[];
    } = {}
  ) {
    super(message);
    this.name = "ManimValidationError";
    Object.assign(this, options);
  }

  stdout?: string;
  stderr?: string;
  exitCode?: number;
  hint?: string;
  logs?: RenderLogEntry[];
}

interface ValidationWarning {
  stage: ValidationStage;
  message: string;
}

export interface RenderResult {
  videoPath: string;
  warnings: ValidationWarning[];
  logs: RenderLogEntry[];
}

export interface RenderOptions {
  resolution?: { width: number; height: number };
  orientation?: "landscape" | "portrait";
}

const PROHIBITED_MODULES = [
  "os",
  "sys",
  "subprocess",
  "pathlib",
  "shutil",
  "socket",
  "requests",
  "http",
  "urllib",
  "multiprocessing",
  "psutil",
  "asyncio",
];

const PROHIBITED_BUILTINS = ["open", "exec", "eval", "compile", "__import__"];

const hasExpectedSceneClass = (source: string) =>
  /\bclass\s+MyScene\b/.test(source);

const movingCameraSceneDeclared = (source: string) =>
  /class\s+MyScene\s*\(\s*MovingCameraScene/.test(source);

const runHeuristicChecks = (
  source: string
): {
  errors: ValidationWarning[];
  warnings: ValidationWarning[];
} => {
  const errors: ValidationWarning[] = [];
  const warnings: ValidationWarning[] = [];

  if (
    /self\.camera\.frame/.test(source) &&
    !movingCameraSceneDeclared(source)
  ) {
    errors.push({
      stage: "heuristic",
      message:
        "Detected self.camera.frame usage outside MovingCameraScene. Update MyScene to inherit from MovingCameraScene or remove camera frame operations.",
    });
  }

  if (!/\bplay\s*\(/.test(source)) {
    warnings.push({
      stage: "heuristic",
      message:
        "Scene contains no animations (play calls); output may be empty.",
    });
  }

  return { errors, warnings };
};

const truncateOutput = (value: string | undefined | null) => {
  const normalized = (value ?? "").trim();
  if (!normalized.length) return "";
  if (normalized.length <= MAX_COMMAND_OUTPUT_CHARS) return normalized;
  return `${normalized.slice(
    0,
    MAX_COMMAND_OUTPUT_CHARS
  )}\n... output truncated (${
    normalized.length - MAX_COMMAND_OUTPUT_CHARS
  } more chars)`;
};

const buildSceneValidationCommand = (scriptPath: string) =>
  [
    "python - <<'PY'",
    "import importlib.util",
    "import inspect",
    "import sys",
    "from manim import Scene",
    `script_path = r"${scriptPath}"`,
    "spec = importlib.util.spec_from_file_location('manim_scene', script_path)",
    "module = importlib.util.module_from_spec(spec)",
    "try:",
    "    spec.loader.exec_module(module)",
    "except Exception as exc:",
    "    import traceback",
    "    traceback.print_exc()",
    "    raise SystemExit(f'Failed to import script: {exc}')",
    "scene_cls = getattr(module, 'MyScene', None)",
    "if scene_cls is None:",
    "    raise SystemExit(\"No class named 'MyScene' was found in the script.\")",
    "if not isinstance(scene_cls, type):",
    "    raise SystemExit(\"Attribute 'MyScene' exists but is not a class.\")",
    "if not issubclass(scene_cls, Scene):",
    '    raise SystemExit("MyScene must inherit from manim.Scene.")',
    "construct = getattr(scene_cls, 'construct', None)",
    "if construct is None or not callable(construct):",
    '    raise SystemExit("MyScene must define a callable construct() method.")',
    "params = list(inspect.signature(construct).parameters.values())",
    "if not params or params[0].kind not in (inspect.Parameter.POSITIONAL_ONLY, inspect.Parameter.POSITIONAL_OR_KEYWORD):",
    "    raise SystemExit(\"construct() must accept 'self' as its first positional argument.\")",
    "print('Scene validation passed.')",
    "PY",
  ].join("\n");

const buildAstValidationCommand = (scriptPath: string) =>
  [
    "python - <<'PY'",
    "import ast",
    "import sys",
    `script_path = r"${scriptPath}"`,
    "with open(script_path, 'r', encoding='utf-8') as fh:",
    "    source = fh.read()",
    "try:",
    "    tree = ast.parse(source, filename=script_path)",
    "except SyntaxError as exc:",
    "    import traceback",
    "    traceback.print_exc()",
    "    raise SystemExit(f'Syntax error: {exc}')",
    `prohibited_modules = ${JSON.stringify(PROHIBITED_MODULES)}`,
    `prohibited_builtins = ${JSON.stringify(PROHIBITED_BUILTINS)}`,
    "issues = []",
    "class GuardVisitor(ast.NodeVisitor):",
    "    def visit_Import(self, node):",
    "        for alias in node.names:",
    "            name = alias.name.split('.')[0]",
    "            if name in prohibited_modules:",
    "                issues.append(f\"Import of module '{name}' is not allowed in Manim scripts.\")",
    "        self.generic_visit(node)",
    "    def visit_ImportFrom(self, node):",
    "        if node.module:",
    "            base = node.module.split('.')[0]",
    "            if base in prohibited_modules:",
    "                issues.append(f\"Import from module '{node.module}' is not allowed in Manim scripts.\")",
    "        self.generic_visit(node)",
    "    def visit_Call(self, node):",
    "        func = node.func",
    "        if isinstance(func, ast.Name) and func.id in prohibited_builtins:",
    "            issues.append(f\"Use of builtin '{func.id}' is not allowed in Manim scripts.\")",
    "        self.generic_visit(node)",
    "GuardVisitor().visit(tree)",
    "if issues:",
    "    for issue in issues:",
    "        print(issue, file=sys.stderr)",
    "    raise SystemExit('AST validation failed due to disallowed operations.')",
    "print('AST validation passed.')",
    "PY",
  ].join("\n");

export interface RenderRequest {
  script: string;
  prompt: string;
  applyWatermark?: boolean;
  renderOptions?: RenderOptions;
}

export interface ThumbnailResult {
  imagePath: string;
}

export interface ThumbnailRequest {
  script: string;
  prompt: string;
  renderOptions?: RenderOptions;
}

export async function renderManimVideo({
  script,
  prompt: _prompt,
  applyWatermark = true,
  renderOptions,
}: RenderRequest): Promise<RenderResult> {
  void _prompt;
  const normalizedScript = script.trim();
  const renderLogs: RenderLogEntry[] = [];

  const pushLog = (
    entry: Omit<RenderLogEntry, "timestamp"> & { timestamp?: string }
  ) => {
    const timestamp = entry.timestamp ?? new Date().toISOString();
    renderLogs.push({ ...entry, timestamp });
  };

  pushLog({
    level: "info",
    message: "Beginning render pipeline",
    context: "render",
  });
  if (!normalizedScript.length) {
    pushLog({
      level: "error",
      message: "Aborting render: script is empty",
      context: "input",
    });
    throw new ManimValidationError(
      "Manim script is empty. Please provide a scene before rendering.",
      "input",
      { logs: [...renderLogs] }
    );
  }
  if (!hasExpectedSceneClass(normalizedScript)) {
    pushLog({
      level: "error",
      message: "Aborting render: class MyScene missing",
      context: "input",
    });
    throw new ManimValidationError(
      "Manim script must declare `class MyScene` before rendering. Rename your scene or adjust the renderer to match.",
      "input",
      { logs: [...renderLogs] }
    );
  }
  const heuristicResult = runHeuristicChecks(normalizedScript);
  if (heuristicResult.errors.length) {
    const summary = heuristicResult.errors
      .map((issue) => `- ${issue.message}`)
      .join("\n");
    pushLog({
      level: "error",
      message: `Heuristic validation failed: ${summary}`,
      context: "heuristic",
    });
    throw new ManimValidationError(
      `Heuristic validation failed:\n${summary}`,
      "heuristic",
      { logs: [...renderLogs] }
    );
  }
  const warnings: ValidationWarning[] = [...heuristicResult.warnings];
  let sandbox: Sandbox | null = null;
  let cleanupAttempted = false;

  const ensureCleanup = async () => {
    if (sandbox && !cleanupAttempted) {
      cleanupAttempted = true;
      try {
        await sandbox.kill();
        console.log("E2B sandbox cleaned up successfully");
        pushLog({
          level: "info",
          message: "Sandbox cleaned up",
          context: "cleanup",
        });
      } catch (cleanupError) {
        console.warn("Sandbox cleanup error (non-fatal):", cleanupError);
        pushLog({
          level: "warn",
          message: `Sandbox cleanup error: ${String(cleanupError)}`,
          context: "cleanup",
        });
      }
    }
  };

  const runCommandOrThrow = async (
    command: string,
    options: {
      description?: string;
      stage?: ValidationStage;
      timeoutMs?: number;
      hint?: string;
      onStdout?: (chunk: string) => void;
      onStderr?: (chunk: string) => void;
      streamOutput?:
        | boolean
        | {
            stdout?: boolean;
            stderr?: boolean;
          };
    } = {}
  ) => {
    if (!sandbox) {
      throw new Error("Sandbox not initialised before running command");
    }
    const {
      description,
      stage = "render",
      timeoutMs,
      hint,
      onStdout,
      onStderr,
      streamOutput,
    } = options;
    const startedAt = Date.now();
    const contextLabel = description ?? command;
    let streamStdout = false;
    let streamStderr = false;
    if (typeof streamOutput === "boolean") {
      streamStdout = streamOutput;
      streamStderr = streamOutput;
    } else if (streamOutput) {
      streamStdout = Boolean(streamOutput.stdout);
      streamStderr =
        streamOutput.stderr !== undefined
          ? Boolean(streamOutput.stderr)
          : streamStdout;
    }

    pushLog({
      level: "info",
      message: `Running command: ${contextLabel}`,
      context: contextLabel,
    });

    const recordChunk = (chunk: string, level: "stdout" | "stderr") => {
      if (!chunk) return;
      const trimmed = chunk.replace(/\u001b\[[0-9;]*m/g, "");
      const pieces = trimmed
        .split(/\r?\n/)
        .filter((line) => line.trim().length > 0);
      for (const piece of pieces) {
        const text =
          piece.length > MAX_COMMAND_OUTPUT_CHARS
            ? `${piece.slice(0, MAX_COMMAND_OUTPUT_CHARS)}…`
            : piece;
        pushLog({ level, message: text, context: contextLabel });
      }
    };

    const userStdout = onStdout;
    const userStderr = onStderr;

    const defaultStdout = streamStdout
      ? (chunk: string) => {
          if (!chunk) return;
          console.log(`[${contextLabel}][stdout] ${chunk}`);
        }
      : undefined;
    const defaultStderr = streamStderr
      ? (chunk: string) => {
          if (!chunk) return;
          console.error(`[${contextLabel}][stderr] ${chunk}`);
        }
      : undefined;

    const combinedStdout = (chunk: string) => {
      recordChunk(chunk, "stdout");
      if (userStdout) {
        userStdout(chunk);
      } else if (defaultStdout) {
        defaultStdout(chunk);
      }
    };

    const combinedStderr = (chunk: string) => {
      recordChunk(chunk, "stderr");
      if (userStderr) {
        userStderr(chunk);
      } else if (defaultStderr) {
        defaultStderr(chunk);
      }
    };

    const result = await sandbox.commands.run(command, {
      timeoutMs,
      onStdout: streamStdout || onStdout ? combinedStdout : undefined,
      onStderr: streamStderr || onStderr ? combinedStderr : undefined,
    });
    if (result.exitCode !== 0) {
      const label = description ?? command;
      const messageParts = [
        `${label} failed with exit code ${result.exitCode}`,
      ];
      if (hint) {
        messageParts.push(hint);
      }
      const stderr = truncateOutput(result.stderr);
      const stdout = truncateOutput(result.stdout);
      if (stderr) {
        messageParts.push(`STDERR:\n${stderr}`);
        recordChunk(stderr, "stderr");
      }
      if (stdout) {
        messageParts.push(`STDOUT:\n${stdout}`);
        recordChunk(stdout, "stdout");
      }
      pushLog({
        level: "error",
        message: `${label} failed with exit code ${result.exitCode}`,
        context: contextLabel,
      });
      const error = new ManimValidationError(messageParts.join("\n\n"), stage, {
        exitCode: result.exitCode,
        stderr: result.stderr,
        stdout: result.stdout,
        hint,
        logs: [...renderLogs],
      });
      Object.assign(error, {
        command,
        description: label,
      });
      throw error;
    }
    const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);
    console.log(`${description ?? command} succeeded in ${elapsedSeconds}s`);
    pushLog({
      level: "info",
      message: `${contextLabel} succeeded in ${elapsedSeconds}s`,
      context: contextLabel,
    });

    if (!streamStdout && !onStdout && (result.stdout ?? "").trim().length) {
      recordChunk(result.stdout ?? "", "stdout");
    }
    if (!streamStderr && !onStderr && (result.stderr ?? "").trim().length) {
      recordChunk(result.stderr ?? "", "stderr");
    }
    return result;
  };

  try {
    sandbox = await Sandbox.create("manim-ffmpeg-latex-voiceover-watermark", {
      timeoutMs: 2_400_000,
      envs: {
        ELEVEN_API_KEY: process.env.ELEVENLABS_API_KEY ?? "",
      },
    });
    console.log("E2B sandbox created successfully", {
      sandboxId: sandbox.sandboxId,
    });
    pushLog({
      level: "info",
      message: `Sandbox created (${sandbox.sandboxId})`,
      context: "sandbox",
    });

    const scriptPath = `/home/user/script.py`;
    const mediaDir = `/home/user/media`;
    const baseVideosDir = `${mediaDir}/videos`;

    // Write Manim script
    // Detect and validate plugins
    pushLog({
      level: "info",
      message: "Detecting manim plugins",
      context: "plugin-detection",
    });

    const usedPlugins = detectUsedPlugins(normalizedScript);
    if (usedPlugins.length > 0) {
      console.log("Detected plugins:", usedPlugins);
      pushLog({
        level: "info",
        message: `Detected plugins: ${usedPlugins.join(", ")}`,
        context: "plugin-detection",
      });

      // Validate plugin usage
      const pluginValidation = validateAllPlugins(normalizedScript);
      if (!pluginValidation.valid) {
        pushLog({
          level: "error",
          message: `Plugin validation failed: ${pluginValidation.errors.join("; ")}`,
          context: "plugin-validation",
        });
        throw new ManimValidationError(
          `Plugin validation failed:\n${pluginValidation.errors.join("\n")}`,
          "plugin-validation",
          { logs: [...renderLogs] }
        );
      }

      if (pluginValidation.warnings.length > 0) {
        for (const warning of pluginValidation.warnings) {
          pushLog({
            level: "warn",
            message: warning,
            context: "plugin-validation",
          });
          warnings.push({ stage: "plugin-validation", message: warning });
        }
      }

      // Install plugins
      const sandboxId = sandbox.sandboxId;
      let installedPlugins = installedPluginsCache.get(sandboxId);
      if (!installedPlugins) {
        installedPlugins = new Set<string>();
        installedPluginsCache.set(sandboxId, installedPlugins);
      }

      for (const pluginId of usedPlugins) {
        if (!installedPlugins.has(pluginId)) {
          const plugin = MANIM_PLUGINS[pluginId];
          if (!plugin) {
            console.warn(`Unknown plugin ID: ${pluginId}`);
            continue;
          }

          pushLog({
            level: "info",
            message: `Installing plugin: ${plugin.name}`,
            context: "plugin-installation",
          });

          const installCommands = getPluginInstallCommands(normalizedScript);
          for (const installCmd of installCommands) {
            if (installCmd) {
              try {
                await runCommandOrThrow(installCmd, {
                  description: `Install ${plugin.name}`,
                  stage: "plugin-installation",
                  timeoutMs: 300_000, // 5 minutes for plugin installation
                  hint: `Failed to install ${plugin.name}. The plugin may not be compatible with this manim version.`,
                  streamOutput: true,
                });
                installedPlugins.add(pluginId);
              } catch (installError) {
                console.error(`Failed to install plugin ${plugin.name}:`, installError);
                pushLog({
                  level: "error",
                  message: `Failed to install ${plugin.name}: ${String(installError)}`,
                  context: "plugin-installation",
                });
                // Continue without this plugin - the script may still work
                warnings.push({
                  stage: "plugin-installation",
                  message: `Plugin ${plugin.name} could not be installed but continuing`,
                });
              }
            }
          }
        } else {
          pushLog({
            level: "info",
            message: `Plugin ${MANIM_PLUGINS[pluginId]?.name || pluginId} already installed in this sandbox`,
            context: "plugin-installation",
          });
        }
      }
    }

    // Inject layout helpers based on render options
    let enhancedScript = normalizedScript;
    const contentType = detectContentType(normalizedScript);
    const layoutConfig = getLayoutConfig({
      orientation: renderOptions?.orientation,
      resolution: renderOptions?.resolution,
      contentType,
    });

    pushLog({
      level: "info",
      message: `Injecting layout helpers (${layoutConfig.orientation}, ${contentType})`,
      context: "layout-injection",
    });

    const layoutCode = getCompleteLayoutCode(layoutConfig);

    // Insert layout code after imports but before class definition
    const classMatch = enhancedScript.match(/^((?:.*\n)*?)(class\s+MyScene)/m);
    if (classMatch) {
      const beforeClass = classMatch[1];
      const fromClass = classMatch[2];
      const afterClass = enhancedScript.slice(classMatch.index! + classMatch[0].length);
      enhancedScript = `${beforeClass}\n${layoutCode}\n\n${fromClass}${afterClass}`;
    } else {
      // Fallback: append at the beginning after imports
      const lines = enhancedScript.split("\n");
      const lastImportIdx = lines.findLastIndex((line) =>
        line.trim().startsWith("import ") || line.trim().startsWith("from ")
      );
      if (lastImportIdx >= 0) {
        lines.splice(lastImportIdx + 1, 0, "", layoutCode, "");
        enhancedScript = lines.join("\n");
      }
    }

    await sandbox.files.write(scriptPath, enhancedScript);
    console.log("Manim script (with plugins and layout helpers) written to sandbox");
    pushLog({
      level: "info",
      message: "Script written to sandbox with enhancements",
      context: "prepare",
    });

    await runCommandOrThrow(`python -m py_compile ${scriptPath}`, {
      description: "Python syntax check",
      stage: "syntax",
      timeoutMs: 120_000,
      hint: "Fix Python syntax errors reported above before rendering with Manim.",
    });

    await runCommandOrThrow(buildAstValidationCommand(scriptPath), {
      description: "AST safety validation",
      stage: "ast-guard",
      timeoutMs: 120_000,
      hint: "Remove disallowed imports or builtins from the Manim script before rendering.",
    });

    await runCommandOrThrow(buildSceneValidationCommand(scriptPath), {
      description: "Scene validation",
      stage: "scene-validation",
      timeoutMs: 120_000,
      hint: "Ensure MyScene imports correctly, inherits from manim.Scene, and defines construct(self).",
    });

    if (!latexEnvironmentVerified) {
      await runCommandOrThrow(`latex --version`, {
        description: "LaTeX availability check",
        stage: "latex",
        timeoutMs: 120_000,
        hint: "The Manim template requires LaTeX. Ensure it is installed in the sandbox template.",
      });
      latexEnvironmentVerified = true;
    }

    const resolution = renderOptions?.resolution;
    const orientation = renderOptions?.orientation;
    let safeWidth: number | undefined;
    let safeHeight: number | undefined;
    if (resolution) {
      pushLog({
        level: "info",
        message: `Using custom resolution ${resolution.width}x${resolution.height}`,
        context: "render-config",
      });
    }
    if (orientation) {
      pushLog({
        level: "info",
        message: `Orientation set to ${orientation}`,
        context: "render-config",
      });
    }

    const manimArgs = [
      scriptPath,
      "MyScene",
      "--media_dir",
      mediaDir,
      "--disable_caching",
      "--format=mp4",
      "-ql",
    ];
    if (resolution) {
      safeWidth = Math.max(1, Math.round(resolution.width));
      safeHeight = Math.max(1, Math.round(resolution.height));
      manimArgs.push("-r", `${safeWidth},${safeHeight}`);
    }

    const manimCmd = `manim ${manimArgs.join(" ")}`;

    console.log("Starting manim render with command:", manimCmd);
    await runCommandOrThrow(manimCmd, {
      description: "Manim render",
      stage: "render",
      timeoutMs: 2_700_000,
      hint: "Review the traceback to resolve errors inside your Manim scene.",
      streamOutput: true,
    });

    const scriptFilename = scriptPath.split("/").pop() ?? "script.py";
    const moduleName = scriptFilename.replace(/\.py$/i, "");
    const sceneName = "MyScene";
    const qualityCandidates: string[] = [];

    if (safeWidth && safeHeight) {
      qualityCandidates.push(`custom_quality_${safeWidth}x${safeHeight}`);
    }
    qualityCandidates.push("480p15", "low_quality");

    const candidatePaths = Array.from(
      new Set([
        ...qualityCandidates.map(
          (quality) =>
            `${baseVideosDir}/${moduleName}/${quality}/${sceneName}.mp4`
        ),
        `${baseVideosDir}/${moduleName}/${sceneName}.mp4`,
      ])
    );

    if (!sandbox) {
      await ensureCleanup();
      throw new ManimValidationError(
        "Sandbox is unavailable while locating the rendered video.",
        "render",
        { logs: [...renderLogs] }
      );
    }

    let videoPath: string | undefined;
    for (const candidate of candidatePaths) {
      const existsCheck = await sandbox.commands.run(
        [
          "python - <<'PY'",
          "import os",
          `path = r"${candidate}"`,
          "print('1' if os.path.isfile(path) else '', end='')",
          "PY",
        ].join("\n")
      );
      if ((existsCheck.stdout ?? "").trim() === "1") {
        videoPath = candidate;
        break;
      }
    }

    if (!videoPath) {
      const searchResult = await sandbox.commands.run(
        [
          "python - <<'PY'",
          "import os",
          `base = r"${baseVideosDir}/${moduleName}"`,
          "target = 'MyScene.mp4'",
          "if os.path.isdir(base):",
          "    for root, _, files in os.walk(base):",
          "        if target in files:",
          "            print(os.path.join(root, target))",
          "            break",
          "PY",
        ].join("\n")
      );
      const locatedPath = (searchResult.stdout ?? "").trim();
      if (locatedPath) {
        videoPath = locatedPath;
        pushLog({
          level: "info",
          message: `Video file located via fallback search: ${locatedPath}`,
          context: "files",
        });
      }
    }

    if (!videoPath) {
      await ensureCleanup();
      throw new ManimValidationError(
        `Unable to locate MyScene.mp4 under ${baseVideosDir}/${moduleName}.`,
        "render",
        { logs: [...renderLogs] }
      );
    }

    const outputDirIndex = videoPath.lastIndexOf("/");
    const outputDir =
      outputDirIndex > 0 ? videoPath.slice(0, outputDirIndex) : baseVideosDir;

    console.log("Video file candidate:", videoPath);
    pushLog({
      level: "info",
      message: `Video file located: ${videoPath}`,
      context: "files",
    });

    // Validate with ffprobe
    const probe = await runCommandOrThrow(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 ${videoPath}`,
      {
        description: "Video validation",
        stage: "video-validation",
        timeoutMs: 180_000,
        hint: "The rendered video appears to be corrupted.",
      }
    );
    const duration = parseFloat((probe.stdout || "").trim());
    console.log("ffprobe duration:", duration);
    pushLog({
      level: "info",
      message: `Render duration: ${duration}`,
      context: "video-validation",
    });

    if (!duration || duration <= 0) {
      await ensureCleanup();
      throw new ManimValidationError(
        `Rendered video has invalid duration: ${duration}s — aborting upload`,
        "video-validation",
        { logs: [...renderLogs] }
      );
    }

    const probeDimensions = await runCommandOrThrow(
      `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 ${videoPath}`,
      {
        description: "Video dimension probe",
        stage: "video-validation",
        timeoutMs: 180_000,
        hint: "Unable to read rendered video dimensions.",
      }
    );
    const dimensionOutput = (probeDimensions.stdout || "").trim();
    let videoWidth: number | undefined;
    let videoHeight: number | undefined;
    if (dimensionOutput.length) {
      const [widthToken, heightToken] = dimensionOutput.split("x");
      const parsedWidth = Number.parseInt(widthToken ?? "", 10);
      const parsedHeight = Number.parseInt(heightToken ?? "", 10);
      if (Number.isFinite(parsedWidth) && parsedWidth > 0) {
        videoWidth = parsedWidth;
      }
      if (Number.isFinite(parsedHeight) && parsedHeight > 0) {
        videoHeight = parsedHeight;
      }
    }
    if (videoWidth && videoHeight) {
      pushLog({
        level: "info",
        message: `Detected video dimensions: ${videoWidth}x${videoHeight}`,
        context: "video-validation",
      });
    } else {
      pushLog({
        level: "warn",
        message: `Could not determine video dimensions from ffprobe output: "${dimensionOutput}"`,
        context: "video-validation",
      });
    }

    let processedVideoPath = videoPath;

    if (applyWatermark) {
      const watermarkedPath = `${outputDir}/watermarked.mp4`;
      const watermarkText = "eduvids";
      const fontFile = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
      const drawText = `drawtext=fontfile=${fontFile}:text='${watermarkText}':fontcolor=white@0.85:fontsize=24:box=1:boxcolor=black@0.4:boxborderw=10:x=w-tw-20:y=h-th-20`;
      const ffmpegCmd = `ffmpeg -y -i ${processedVideoPath} -vf "${drawText}" -c:v libx264 -profile:v main -pix_fmt yuv420p -movflags +faststart -c:a copy ${watermarkedPath}`;
      await runCommandOrThrow(ffmpegCmd, {
        description: "Watermark application",
        stage: "watermark",
        timeoutMs: 360_000,
        hint: "ffmpeg failed while applying the watermark.",
        streamOutput: { stdout: true, stderr: true },
      });

      const probeWm = await runCommandOrThrow(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 ${watermarkedPath}`,
        {
          description: "Watermarked video validation",
          stage: "watermark-validation",
          timeoutMs: 180_000,
          hint: "The watermarked video appears to be corrupted.",
        }
      );
      const wmDuration = parseFloat((probeWm.stdout || "").trim());
      if (!wmDuration || wmDuration <= 0) {
        await ensureCleanup();
        throw new ManimValidationError(
          `Watermarked video has invalid duration: ${wmDuration}s — aborting upload`,
          "watermark-validation",
          { logs: [...renderLogs] }
        );
      }

      processedVideoPath = watermarkedPath;
    }

    const finalVideoPath = processedVideoPath;

    const fileBytesArray = (await sandbox.files.read(finalVideoPath, {
      format: "bytes",
    })) as Uint8Array;
    if (!fileBytesArray || !fileBytesArray.length) {
      await ensureCleanup();
      throw new ManimValidationError(
        "Downloaded watermarked video is empty; aborting upload",
        "download",
        { logs: [...renderLogs] }
      );
    }
    const fileBytes = Buffer.from(fileBytesArray);
    const base64 = fileBytes.toString("base64");
    const dataUrl = `data:video/mp4;base64,${base64}`;
    console.log(
      `Prepared base64 data URL for upload (length: ${base64.length} chars)`
    );
    pushLog({
      level: "info",
      message: "Prepared base64 data URL for upload",
      context: "download",
    });

    // Cleanup before returning
    await ensureCleanup();
    return {
      videoPath: dataUrl,
      warnings,
      logs: [...renderLogs],
    };
  } catch (err: unknown) {
    console.error("E2B render error:", err);
    pushLog({
      level: "error",
      message: `Render pipeline error: ${
        err instanceof Error ? err.message : String(err)
      }`,
      context: "render",
    });
    await ensureCleanup();

    if (err instanceof ManimValidationError) {
      err.logs = err.logs ?? [...renderLogs];
      throw err;
    }
    if (err instanceof CommandExitError) {
      const exitCode = err.exitCode;
      const stderr = err.stderr ?? "";
      const stdout = err.stdout ?? "";
      const commandError = err.error ?? err.message ?? "";
      const summary =
        typeof exitCode === "number"
          ? `Manim command exited with code ${exitCode}`
          : "Manim command failed";
      const messageParts = [summary];
      const normalizedCommandError = commandError.trim();
      if (
        normalizedCommandError &&
        normalizedCommandError.toLowerCase() !==
          `exit status ${(exitCode ?? "").toString()}`
      ) {
        messageParts.push(`Error: ${normalizedCommandError}`);
      }
      if (stderr.trim().length) {
        messageParts.push(`STDERR:\n${stderr}`);
      }
      if (stdout.trim().length) {
        messageParts.push(`STDOUT:\n${stdout}`);
      }

      const detailedError = new ManimValidationError(
        messageParts.join("\n\n"),
        "render",
        {
          exitCode,
          stderr,
          stdout,
        }
      );
      detailedError.name = err.name;
      detailedError.stack = err.stack;
      detailedError.logs = [...renderLogs];
      Object.assign(detailedError, {
        exitCode,
        stderr,
        stdout,
        originalMessage: err.message,
        cause: err,
      });
      throw detailedError;
    }
    if (err instanceof Error) {
      (err as ManimValidationError).logs = [...renderLogs];
      throw err;
    }
    throw new ManimValidationError(String(err), "render", {
      logs: [...renderLogs],
    });
  } finally {
    // Ensure cleanup happens even if not already done
    await ensureCleanup();
  }
}

export async function renderManimThumbnail({
  script,
  prompt: _prompt,
  renderOptions,
}: ThumbnailRequest): Promise<ThumbnailResult> {
  void _prompt;
  const normalizedScript = script.trim();

  if (!normalizedScript.length) {
    throw new Error("Thumbnail script is empty");
  }
  if (!hasExpectedSceneClass(normalizedScript)) {
    throw new Error("Thumbnail script must declare `class MyScene`");
  }

  let sandbox: Sandbox | null = null;
  let cleanupAttempted = false;

  const ensureCleanup = async () => {
    if (sandbox && !cleanupAttempted) {
      cleanupAttempted = true;
      try {
        await sandbox.kill();
        console.log("Thumbnail E2B sandbox cleaned up successfully");
      } catch (cleanupError) {
        console.warn("Thumbnail sandbox cleanup error (non-fatal):", cleanupError);
      }
    }
  };

  try {
    sandbox = await Sandbox.create("manim-ffmpeg-latex-voiceover-watermark", {
      timeoutMs: 600_000, // 10 minutes should be plenty for a single frame
    });
    console.log("Thumbnail E2B sandbox created", {
      sandboxId: sandbox.sandboxId,
    });

    const scriptPath = `/home/user/thumbnail_script.py`;
    const mediaDir = `/home/user/media`;
    const baseImagesDir = `${mediaDir}/images`;

    // Inject layout helpers
    const contentType = detectContentType(normalizedScript);
    const layoutConfig = getLayoutConfig({
      orientation: renderOptions?.orientation,
      resolution: renderOptions?.resolution || { width: 1280, height: 720 },
      contentType,
    });

    const layoutCode = getCompleteLayoutCode(layoutConfig);
    const classMatch = normalizedScript.match(/^((?:.*\n)*?)(class\s+MyScene)/m);
    let enhancedScript = normalizedScript;
    if (classMatch) {
      const beforeClass = classMatch[1];
      const fromClass = classMatch[2];
      const afterClass = normalizedScript.slice(classMatch.index! + classMatch[0].length);
      enhancedScript = `${beforeClass}\n${layoutCode}\n\n${fromClass}${afterClass}`;
    }

    await sandbox.files.write(scriptPath, enhancedScript);
    console.log("Thumbnail script written to sandbox");

    // Syntax check
    const syntaxCheck = await sandbox.commands.run(`python -m py_compile ${scriptPath}`);
    if (syntaxCheck.exitCode !== 0) {
      throw new Error(`Thumbnail script syntax error: ${syntaxCheck.stderr}`);
    }

    // Render as single frame (PNG)
    const resolution = renderOptions?.resolution || { width: 1280, height: 720 };
    const safeWidth = Math.max(1, Math.round(resolution.width));
    const safeHeight = Math.max(1, Math.round(resolution.height));

    const manimArgs = [
      scriptPath,
      "MyScene",
      "--media_dir",
      mediaDir,
      "--disable_caching",
      "-s",  // Single frame
      "-r", `${safeWidth},${safeHeight}`,
      "--format=png",
    ];

    const manimCmd = `manim ${manimArgs.join(" ")}`;
    console.log("Starting thumbnail render with command:", manimCmd);

    const renderResult = await sandbox.commands.run(manimCmd, {
      timeoutMs: 300_000, // 5 minutes
    });

    if (renderResult.exitCode !== 0) {
      throw new Error(`Thumbnail render failed: ${renderResult.stderr || renderResult.stdout}`);
    }

    // Find the generated PNG
    const scriptFilename = scriptPath.split("/").pop() ?? "thumbnail_script.py";
    const moduleName = scriptFilename.replace(/\.py$/i, "");
    const sceneName = "MyScene";

    const candidatePaths = [
      `${baseImagesDir}/${moduleName}/${sceneName}.png`,
      `${baseImagesDir}/${moduleName}/MyScene_ManimCE_v*.png`,
    ];

    let imagePath: string | undefined;
    for (const candidate of candidatePaths) {
      const existsCheck = await sandbox.commands.run(
        [
          "python - <<'PY'",
          "import os",
          "import glob",
          `pattern = r"${candidate}"`,
          "matches = glob.glob(pattern)",
          "if matches:",
          "    print(matches[0], end='')",
          "PY",
        ].join("\n")
      );
      const found = (existsCheck.stdout ?? "").trim();
      if (found) {
        imagePath = found;
        break;
      }
    }

    if (!imagePath) {
      // Fallback search
      const searchResult = await sandbox.commands.run(
        [
          "python - <<'PY'",
          "import os",
          `base = r"${baseImagesDir}/${moduleName}"`,
          "if os.path.isdir(base):",
          "    for root, _, files in os.walk(base):",
          "        for f in files:",
          "            if f.endswith('.png'):",
          "                print(os.path.join(root, f), end='')",
          "                break",
          "PY",
        ].join("\n")
      );
      const found = (searchResult.stdout ?? "").trim();
      if (found) {
        imagePath = found;
      }
    }

    if (!imagePath) {
      throw new Error(`Unable to locate thumbnail PNG under ${baseImagesDir}/${moduleName}`);
    }

    console.log("Thumbnail file located:", imagePath);

    // Read the image as bytes
    const imageBytesArray = (await sandbox.files.read(imagePath, {
      format: "bytes",
    })) as Uint8Array;
    if (!imageBytesArray || !imageBytesArray.length) {
      throw new Error("Downloaded thumbnail image is empty");
    }

    const imageBytes = Buffer.from(imageBytesArray);
    const base64 = imageBytes.toString("base64");
    const dataUrl = `data:image/png;base64,${base64}`;
    console.log(`Prepared base64 data URL for thumbnail (length: ${base64.length} chars)`);

    await ensureCleanup();
    return {
      imagePath: dataUrl,
    };
  } catch (err: unknown) {
    console.error("Thumbnail render error:", err);
    await ensureCleanup();
    throw err;
  } finally {
    await ensureCleanup();
  }
}

export interface SimpleThumbnailRequest {
  videoDataUrl: string;
  title: string;
  orientation?: "landscape" | "portrait";
}

export async function generateSimpleThumbnail({
  videoDataUrl,
  title,
  orientation = "landscape",
}: SimpleThumbnailRequest): Promise<ThumbnailResult> {
  let sandbox: Sandbox | null = null;
  let cleanupAttempted = false;

  const ensureCleanup = async () => {
    if (sandbox && !cleanupAttempted) {
      cleanupAttempted = true;
      try {
        await sandbox.kill();
        console.log("Simple thumbnail sandbox cleaned up successfully");
      } catch (cleanupError) {
        console.warn("Simple thumbnail cleanup error (non-fatal):", cleanupError);
      }
    }
  };

  try {
    sandbox = await Sandbox.create("manim-ffmpeg-latex-voiceover-watermark", {
      timeoutMs: 300_000, // 5 minutes for thumbnail
    });
    console.log("Simple thumbnail sandbox created", {
      sandboxId: sandbox.sandboxId,
    });

    const videoPath = "/home/user/input_video.mp4";
    const framePath = "/home/user/frame.png";
    const thumbnailPath = "/home/user/thumbnail.png";

    // Extract base64 data from data URL
    const base64Data = videoDataUrl.replace(/^data:video\/mp4;base64,/, "");
    const videoBuffer = Buffer.from(base64Data, "base64");
    
    // Write video to sandbox (use ArrayBuffer from Buffer)
    await sandbox.files.write(videoPath, videoBuffer.buffer.slice(videoBuffer.byteOffset, videoBuffer.byteOffset + videoBuffer.byteLength));
    console.log("Video written to sandbox for thumbnail extraction");

    // Extract frame at 3 seconds (or middle of video)
    const extractCmd = `ffmpeg -i ${videoPath} -ss 3 -vframes 1 -y ${framePath}`;
    const extractResult = await sandbox.commands.run(extractCmd, {
      timeoutMs: 60_000,
    });

    if (extractResult.exitCode !== 0) {
      throw new Error(`Frame extraction failed: ${extractResult.stderr || extractResult.stdout}`);
    }

    console.log("Frame extracted successfully");

    // Determine dimensions based on orientation
    const width = orientation === "portrait" ? 720 : 1280;
    const height = orientation === "portrait" ? 1280 : 720;
    const fontSize = orientation === "portrait" ? 64 : 72;

    // Escape single quotes in title for shell command
    const escapedTitle = title.replace(/'/g, "'\\''");
    
    // Add text overlay with ffmpeg
    const fontFile = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
    const textOverlayCmd = `ffmpeg -i ${framePath} -vf "scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},drawtext=fontfile=${fontFile}:text='${escapedTitle}':fontcolor=white:fontsize=${fontSize}:box=1:boxcolor=black@0.7:boxborderw=20:x=(w-text_w)/2:y=(h-text_h)/2" -y ${thumbnailPath}`;
    
    const overlayResult = await sandbox.commands.run(textOverlayCmd, {
      timeoutMs: 60_000,
    });

    if (overlayResult.exitCode !== 0) {
      throw new Error(`Text overlay failed: ${overlayResult.stderr || overlayResult.stdout}`);
    }

    console.log("Text overlay applied successfully");

    // Read the thumbnail as bytes
    const thumbnailBytesArray = (await sandbox.files.read(thumbnailPath, {
      format: "bytes",
    })) as Uint8Array;
    
    if (!thumbnailBytesArray || !thumbnailBytesArray.length) {
      throw new Error("Generated thumbnail is empty");
    }

    const thumbnailBytes = Buffer.from(thumbnailBytesArray);
    const base64 = thumbnailBytes.toString("base64");
    const dataUrl = `data:image/png;base64,${base64}`;
    console.log(`Simple thumbnail generated (length: ${base64.length} chars)`);

    await ensureCleanup();
    return {
      imagePath: dataUrl,
    };
  } catch (err: unknown) {
    console.error("Simple thumbnail generation error:", err);
    await ensureCleanup();
    throw err;
  } finally {
    await ensureCleanup();
  }
}
