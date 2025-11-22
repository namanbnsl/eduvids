import { CommandExitError, Sandbox } from "@e2b/code-interpreter";
import { Buffer } from "node:buffer";
import {
  getLayoutConfig,
  getCompleteLayoutCode,
  detectContentType,
} from "./manim-layout-engine";
import { RenderLogEntry, ValidationStage } from "@/lib/types";

const MAX_COMMAND_OUTPUT_CHARS = 4000;
let latexEnvironmentVerified = false;

const EDUVIDS_CALLOUT_TEXT = "Generate your free educational videos at";
const LAYOUT_SENTINEL = "# ADVANCED LAYOUT SYSTEM";
const FONT_BODY_PATTERN = /\bFONT_BODY\s*=/;

function injectEduvidsCallout(script: string): string {
  if (script.includes(EDUVIDS_CALLOUT_TEXT)) {
    return script;
  }

  const lines = script.split("\n");
  const constructPattern = /^\s*def\s+construct\s*\(\s*self\s*\)\s*:/;
  let constructIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    if (constructPattern.test(lines[i])) {
      constructIndex = i;
      break;
    }
  }

  if (constructIndex === -1) {
    return script;
  }

  let bodyIndent = "        ";
  for (let j = constructIndex + 1; j < lines.length; j++) {
    const trimmed = lines[j]?.trim() ?? "";
    if (!trimmed.length) {
      continue;
    }
    const indentMatch = lines[j]?.match(/^\s+/);
    if (indentMatch && indentMatch[0]) {
      bodyIndent = indentMatch[0];
    } else {
      const defIndent = lines[constructIndex]?.match(/^\s*/)?.[0] ?? "";
      bodyIndent = `${defIndent}    `;
    }
    break;
  }

  let insertionIndex = lines.length;
  for (let k = constructIndex + 1; k < lines.length; k++) {
    const trimmed = lines[k]?.trim() ?? "";
    if (!trimmed.length) {
      continue;
    }
    const indent = lines[k]?.match(/^\s*/)?.[0] ?? "";
    if (indent.length < bodyIndent.length) {
      insertionIndex = k;
      break;
    }
  }

  //   ``,
  //   `${bodyIndent}    self.play(FadeIn(cta_title, shift=UP), FadeIn(cta_link, shift=UP), run_time=1.2)`,
  //   `${bodyIndent}    self.wait(0.5)`,
  //   ``,
  //   `${bodyIndent}    # Subtle pulse animation on the link`,
  //   `${bodyIndent}    self.play(cta_link.animate.scale(1.05), run_time=0.4)`,
  //   `${bodyIndent}    self.play(cta_link.animate.scale(1.0), run_time=0.4)`,
  //   `${bodyIndent}    self.wait(0.6)`,
  // ];
  // Check if this is a 3D scene to add camera reset
  const is3D = is3DScene(script);

  const snippet = [
    `${bodyIndent}# Clear scene and prepare for CTA (Call-to-Action)`,
    `${bodyIndent}existing_mobjects = list(self.mobjects)`,
    `${bodyIndent}if existing_mobjects:`,
    `${bodyIndent}    self.play(*[FadeOut(mob) for mob in existing_mobjects])`,
    ...(is3D
      ? [
          ``,
          `${bodyIndent}# Set camera to 2D view for clear CTA visibility`,
          `${bodyIndent}set_camera_for_2d_view(self)`,
          ``,
        ]
      : []),
    `${bodyIndent}with self.voiceover(text="Generate your own educational videos for free at eduvids dot vercel dot app"):`,
    `${bodyIndent}    # Create CTA with high-contrast background panel for visibility`,
    ``,
    `${bodyIndent}    cta_title = create_tex_label("Generate your own educational videos for free!", font_size=FONT_CAPTION + 6, bold=True)`,
    `${bodyIndent}    cta_title.set_color(WHITE)`,
    `${bodyIndent}    cta_link = create_tex_label("https://eduvids.vercel.app", font_size=FONT_CAPTION + 2)`,
    `${bodyIndent}    cta_link.set_color(TEAL)`,
    `${bodyIndent}    cta_link.next_to(cta_title, DOWN, buff=0.4)`,
    `${bodyIndent}    cta_content = VGroup(cta_title, cta_link)`,
    `${bodyIndent}    cta_content.move_to(ORIGIN)`,
    ``,
    `${bodyIndent}    # Set z-indices to ensure visibility`,
    `${bodyIndent}    cta_title.set_z_index(101)`,
    `${bodyIndent}    cta_link.set_z_index(101)`,
    ``,
    `${bodyIndent}    ensure_fits_screen(cta_content)`,
    `${bodyIndent}    validate_position(cta_content, "eduvids message")`,
    ``,
    `${bodyIndent}    # Animate CTA entrance`,
    `${bodyIndent}    self.play(FadeIn(cta_title, shift=UP*0.3), FadeIn(cta_link, shift=UP*0.3), run_time=1.0)`,
    `${bodyIndent}    self.wait(0.5)`,
    ``,
    `${bodyIndent}    # Subtle pulse animation on the link`,
    `${bodyIndent}    self.play(cta_link.animate.scale(1.08), run_time=0.4)`,
    `${bodyIndent}    self.play(cta_link.animate.scale(1.0), run_time=0.4)`,
    `${bodyIndent}    self.wait(0.8)`,
  ];

  // const snippet = [
  //   `${bodyIndent}# Clear scene and prepare for CTA (Call-to-Action)`,
  //   `${bodyIndent}existing_mobjects = list(self.mobjects)`,
  //   `${bodyIndent}if existing_mobjects:`,
  //   `${bodyIndent}    self.play(*[FadeOut(mob) for mob in existing_mobjects])`,
  //   ...(is3D
  //     ? [
  //         ``,
  //         `${bodyIndent}# Set camera to 2D view for clear CTA visibility`,
  //         `${bodyIndent}set_camera_for_2d_view(self)`,
  //         ``,
  //       ]
  //     : []),
  //   `${bodyIndent}with self.voiceover(text="Generate your own educational videos for free at eduvids dot vercel dot app"):`,
  //   `${bodyIndent}    # Create CTA with high-contrast background panel for visibility`,
  //   ``,
  //   `${bodyIndent}    cta_title = Text("Generate your free educational videos at", font_size=FONT_CAPTION + 6)`,
  //   `${bodyIndent}    cta_title.set_color(WHITE)`,
  //   `${bodyIndent}    cta_link = Text("https://eduvids.vercel.app", font_size=FONT_CAPTION + 2)`,
  //   `${bodyIndent}    cta_link.set_color(TEAL)`,
  //   `${bodyIndent}    cta_link.next_to(cta_title, DOWN, buff=0.4)`,
  //   `${bodyIndent}    cta_content = VGroup(cta_title, cta_link)`,
  //   `${bodyIndent}    cta_content.move_to(ORIGIN)`,
  //   ``,
  //   `${bodyIndent}    # Set z-indices to ensure visibility`,
  //   `${bodyIndent}    cta_title.set_z_index(101)`,
  //   `${bodyIndent}    cta_link.set_z_index(101)`,
  //   ``,
  //   `${bodyIndent}    ensure_fits_screen(cta_content)`,
  //   `${bodyIndent}    validate_position(cta_content, "eduvids message")`,
  //   ``,
  //   `${bodyIndent}    # Animate CTA entrance`,
  //   `${bodyIndent}    self.play(FadeIn(cta_title, shift=UP*0.3), FadeIn(cta_link, shift=UP*0.3), run_time=1.0)`,
  //   `${bodyIndent}    self.wait(0.5)`,
  //   ``,
  //   `${bodyIndent}    # Subtle pulse animation on the link`,
  //   `${bodyIndent}    self.play(cta_link.animate.scale(1.08), run_time=0.4)`,
  //   `${bodyIndent}    self.play(cta_link.animate.scale(1.0), run_time=0.4)`,
  //   `${bodyIndent}    self.wait(0.8)`,
  // ];

  const insertionNeedsBlankLine =
    insertionIndex > constructIndex + 1 &&
    (lines[insertionIndex - 1]?.trim()?.length ?? 0) > 0;

  const insertionLines = insertionNeedsBlankLine ? ["", ...snippet] : snippet;

  lines.splice(insertionIndex, 0, ...insertionLines);

  return lines.join("\n");
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

export type RenderLifecycleStage =
  | ValidationStage
  | "sandbox"
  | "prepare"
  | "render-output"
  | "video-processing"
  | "files";

export type RenderProgressUpdate = {
  stage: RenderLifecycleStage;
  message: string;
};

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

const is3DScene = (source: string) =>
  /class\s+MyScene\s*\(\s*ThreeDScene\s*\)/.test(source);

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
  plugins?: string[];
  onProgress?: (update: RenderProgressUpdate) => Promise<void> | void;
}

export interface ThumbnailResult {
  imagePath: string;
}

export interface ThumbnailRequest {
  script: string;
  prompt: string;
  renderOptions?: RenderOptions;
}

export interface RenderState {
  sandboxId: string;
  processId: string;
  scriptPath: string;
  mediaDir: string;
  baseVideosDir: string;
  renderOptions?: RenderOptions;
  warnings: ValidationWarning[];
  logs: RenderLogEntry[];
  applyWatermark: boolean;
}

export interface RenderPollResult {
  complete: boolean;
  success?: boolean;
  videoPath?: string;
  error?: ManimValidationError;
  logs: RenderLogEntry[];
}

export interface StartRenderResult {
  state: RenderState;
  processId: string;
}

export async function renderManimVideo({
  script,
  prompt: _prompt,
  applyWatermark = true,
  renderOptions,
  plugins = [],
  onProgress,
}: RenderRequest): Promise<RenderResult> {
  void _prompt;
  const normalizedScript = script.trim();
  const renderLogs: RenderLogEntry[] = [];

  const reportProgress = async (
    stage: RenderLifecycleStage,
    message: string
  ) => {
    if (!onProgress) return;
    try {
      await onProgress({ stage, message });
    } catch (error) {
      console.warn("Failed to deliver render progress update", {
        stage,
        message,
        error,
      });
    }
  };

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
    await reportProgress("sandbox", "Provisioning secure rendering sandbox");
    sandbox = await Sandbox.create(
      "manim-ffmpeg-latex-voiceover-watermark-languages",
      {
        timeoutMs: 2_400_000,
        envs: {
          ELEVEN_API_KEY: process.env.ELEVENLABS_API_KEY ?? "",
        },
      }
    );
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

    // Inject layout helpers based on render options
    let enhancedScript = normalizedScript;
    const contentType = detectContentType(normalizedScript);
    const layoutConfig = getLayoutConfig({
      orientation: renderOptions?.orientation,
      resolution: renderOptions?.resolution,
      contentType,
      is3D: is3DScene(normalizedScript),
    });

    pushLog({
      level: "info",
      message: `Injecting layout helpers (${layoutConfig.orientation}, ${contentType})`,
      context: "layout-injection",
    });

    const layoutCode = getCompleteLayoutCode(layoutConfig);
    await reportProgress("layout-injection", `Injecting layout helpers`);

    if (!enhancedScript.includes(LAYOUT_SENTINEL)) {
      const lines = enhancedScript.split("\n");
      const lastImportIdx = lines.findLastIndex(
        (line) =>
          line.trim().startsWith("import ") || line.trim().startsWith("from ")
      );

      if (lastImportIdx >= 0) {
        lines.splice(lastImportIdx + 1, 0, "", layoutCode, "");
        enhancedScript = lines.join("\n");
      } else {
        enhancedScript = `${layoutCode}\n\n${enhancedScript}`;
      }
    }

    if (!FONT_BODY_PATTERN.test(enhancedScript)) {
      enhancedScript = `${layoutCode}\n\n${enhancedScript}`;
    }

    enhancedScript = injectEduvidsCallout(enhancedScript);

    await reportProgress("prepare", "Uploading enhanced script to sandbox");
    await sandbox.files.write(scriptPath, enhancedScript);
    console.log("Manim script written to sandbox");
    pushLog({
      level: "info",
      message: "Script written to sandbox with enhancements",
      context: "prepare",
    });

    await reportProgress("syntax", "Running Python syntax check");
    await runCommandOrThrow(`python -m py_compile ${scriptPath}`, {
      description: "Python syntax check",
      stage: "syntax",
      timeoutMs: 120_000,
      hint: "Fix Python syntax errors reported above before rendering with Manim.",
    });

    await reportProgress("ast-guard", "Enforcing AST safety rules");
    await runCommandOrThrow(buildAstValidationCommand(scriptPath), {
      description: "AST safety validation",
      stage: "ast-guard",
      timeoutMs: 120_000,
      hint: "Remove disallowed imports or builtins from the Manim script before rendering.",
    });

    await reportProgress("scene-validation", "Validating definitions");
    await runCommandOrThrow(buildSceneValidationCommand(scriptPath), {
      description: "Scene validation",
      stage: "scene-validation",
      timeoutMs: 120_000,
      hint: "Ensure MyScene imports correctly, inherits from manim.Scene, and defines construct(self).",
    });

    if (plugins.includes("manim_ml")) {
      await reportProgress(
        "plugin-installation",
        "Installing optional manim-ml plugin"
      );
      await runCommandOrThrow("pip install manim-ml", {
        description: "Plugin installation (manim-ml)",
        stage: "plugin-installation",
        timeoutMs: 240_000,
        hint: "The manim-ml plugin failed to install. The script may fail if it depends on this plugin.",
      });
    }

    if (!latexEnvironmentVerified) {
      await reportProgress("latex", "Verifying LaTeX toolchain availability");
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
      // "-qm",
      // "--fps",
      // 15,
    ];
    if (resolution) {
      safeWidth = Math.max(1, Math.round(resolution.width));
      safeHeight = Math.max(1, Math.round(resolution.height));
      manimArgs.push("-r", `${safeWidth},${safeHeight}`);
    }

    const manimCmd = `manim ${manimArgs.join(" ")}`;

    console.log("Starting manim render with command:", manimCmd);
    await reportProgress("render", "Rendering frames");
    await runCommandOrThrow(manimCmd, {
      description: "Manim render",
      stage: "render",
      timeoutMs: 2_700_000,
      hint: "Review the traceback to resolve errors inside your Manim scene.",
      streamOutput: true,
    });

    await reportProgress("render-output", "Render complete, locating output");

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

    await reportProgress("files", "Locating rendered video file");
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
    await reportProgress("video-validation", "Validating rendered video");
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

    // Speed up video to 1.3x
    const speedUpPath = `${outputDir}/speedup.mp4`;
    await reportProgress("video-processing", "Speeding up rendered video");
    const speedUpCmd = `ffmpeg -y -i ${processedVideoPath} -filter:v "setpts=PTS/1.3" -filter:a "atempo=1.3" -c:v libx264 -profile:v main -pix_fmt yuv420p -movflags +faststart ${speedUpPath}`;
    await runCommandOrThrow(speedUpCmd, {
      description: "Speed up video to 1.3x",
      stage: "render",
      timeoutMs: 360_000,
      hint: "ffmpeg failed while speeding up the video.",
      streamOutput: { stdout: true, stderr: true },
    });

    const probeSpeedUp = await runCommandOrThrow(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 ${speedUpPath}`,
      {
        description: "Speed up video validation",
        stage: "video-validation",
        timeoutMs: 180_000,
        hint: "The sped-up video appears to be corrupted.",
      }
    );
    const speedUpDuration = parseFloat((probeSpeedUp.stdout || "").trim());
    if (!speedUpDuration || speedUpDuration <= 0) {
      await ensureCleanup();
      throw new ManimValidationError(
        `Sped-up video has invalid duration: ${speedUpDuration}s — aborting upload`,
        "video-validation",
        { logs: [...renderLogs] }
      );
    }

    processedVideoPath = speedUpPath;
    pushLog({
      level: "info",
      message: `Video sped up to 1.15x (new duration: ${speedUpDuration}s)`,
      context: "video-processing",
    });

    if (applyWatermark) {
      const watermarkedPath = `${outputDir}/watermarked.mp4`;
      const watermarkText = "eduvids";
      const fontFile = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
      // const drawText = `drawtext=fontfile=${fontFile}:text='${watermarkText}':fontcolor=white@1.0:fontsize=24:box=1:boxcolor=black@0.4:boxborderw=10:x=w-tw-20:y=h-th-20`;
      const drawText = `drawtext=fontfile=${fontFile}:text='${watermarkText}':fontcolor=white@1.0:fontsize=28:box=0:x=w-tw-20:y=h-th-20`;
      await reportProgress("watermark", "Applying watermark overlay");
      const ffmpegCmd = `ffmpeg -y -i ${processedVideoPath} -vf "${drawText}" -c:v libx264 -profile:v main -pix_fmt yuv420p -movflags +faststart -c:a copy ${watermarkedPath}`;
      await runCommandOrThrow(ffmpegCmd, {
        description: "Watermark application",
        stage: "watermark",
        timeoutMs: 360_000,
        hint: "ffmpeg failed while applying the watermark.",
        streamOutput: { stdout: true, stderr: true },
      });

      await reportProgress(
        "watermark-validation",
        "Validating watermarked video"
      );
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
