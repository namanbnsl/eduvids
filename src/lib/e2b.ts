import { CommandExitError, Sandbox } from "@e2b/code-interpreter";
import { Buffer } from "node:buffer";

const MAX_COMMAND_OUTPUT_CHARS = 4000;
let latexEnvironmentVerified = false;

export type ValidationStage =
  | "input"
  | "heuristic"
  | "syntax"
  | "ast-guard"
  | "scene-validation"
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
}

export async function renderManimVideo({
  script,
  prompt: _prompt,
  applyWatermark = true,
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

  pushLog({ level: "info", message: "Beginning render pipeline", context: "render" });
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
      const pieces = trimmed.split(/\r?\n/).filter((line) => line.trim().length > 0);
      for (const piece of pieces) {
        const text = piece.length > MAX_COMMAND_OUTPUT_CHARS
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
    const outputDir = `${mediaDir}/videos/script/480p15`;

    // Write Manim script
    await sandbox.files.write(scriptPath, normalizedScript);
    console.log("Manim script written to sandbox");
    pushLog({
      level: "info",
      message: "Script written to sandbox",
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

    console.log("Starting manim render...");
    await runCommandOrThrow(
      `manim ${scriptPath} MyScene --media_dir ${mediaDir} -ql --disable_caching --format=mp4`,
      {
        description: "Manim render",
        stage: "render",
        timeoutMs: 2_700_000,
        hint: "Review the traceback to resolve errors inside your Manim scene.",
        streamOutput: true,
      }
    );

    // Find output file
    console.log("Looking for rendered video in:", outputDir);
    let videoPath = `${outputDir}/MyScene.mp4`;
    let videoExists = false;
    try {
      videoExists = await sandbox.files.exists(videoPath);
    } catch (fsErr) {
      console.warn(
        "Unable to verify video existence directly, falling back to directory listing",
        fsErr
      );
      pushLog({
        level: "warn",
        message: `Unable to verify video existence directly: ${String(fsErr)}`,
        context: "files",
      });
    }

    if (!videoExists) {
      const files = (await sandbox.files.list(outputDir)) as Array<{
        name: string;
      }>;
      const videoFile = files.find((f) => f.name.endsWith(".mp4"));
      if (!videoFile) {
        await ensureCleanup();
        throw new ManimValidationError(
          `No .mp4 file produced in ${outputDir}. Files found: ${files
            .map((f) => f.name)
            .join(", ")}`,
          "render",
          { logs: [...renderLogs] }
        );
      }
      videoPath = `${outputDir}/${videoFile.name}`;
    }
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

    let finalVideoPath = videoPath;

    if (applyWatermark) {
      const watermarkedPath = `${outputDir}/watermarked.mp4`;
      const watermarkText = "eduvids";
      const fontFile = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
      const drawText = `drawtext=fontfile=${fontFile}:text='${watermarkText}':fontcolor=white@0.85:fontsize=24:box=1:boxcolor=black@0.4:boxborderw=10:x=w-tw-20:y=h-th-20`;

      const ffmpegCmd = `ffmpeg -y -i ${videoPath} -vf "${drawText}" -c:v libx264 -profile:v main -pix_fmt yuv420p -movflags +faststart -c:a copy ${watermarkedPath}`;
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

      finalVideoPath = watermarkedPath;
    }

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
      message: `Render pipeline error: ${err instanceof Error ? err.message : String(err)}`,
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

export interface SegmentVideoInput {
  id: string;
  dataUrl: string;
}

export interface ConcatWatermarkRequest {
  segments: SegmentVideoInput[];
  watermarkText?: string;
}

export async function concatSegmentVideos({
  segments,
  watermarkText = "eduvids",
}: ConcatWatermarkRequest): Promise<RenderResult> {
  if (!segments.length) {
    throw new ManimValidationError(
      "No segment videos provided for concatenation.",
      "input"
    );
  }

  let sandbox: Sandbox | null = null;
  let cleanupAttempted = false;

  const ensureCleanup = async () => {
    if (sandbox && !cleanupAttempted) {
      cleanupAttempted = true;
      try {
        await sandbox.kill();
        console.log("E2B concat sandbox cleaned up successfully");
      } catch (cleanupError) {
        console.warn("Concat sandbox cleanup error (non-fatal):", cleanupError);
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
      streamOutput?: boolean | { stdout?: boolean; stderr?: boolean };
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
      streamOutput,
    } = options;

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

    const result = await sandbox.commands.run(command, {
      timeoutMs,
      onStdout: streamStdout
        ? (chunk: string) => {
            if (!chunk) return;
            console.log(`[${description ?? command}][stdout] ${chunk}`);
          }
        : undefined,
      onStderr: streamStderr
        ? (chunk: string) => {
            if (!chunk) return;
            console.error(`[${description ?? command}][stderr] ${chunk}`);
          }
        : undefined,
    });

    if (result.exitCode !== 0) {
      const label = description ?? command;
      const stderr = truncateOutput(result.stderr);
      const stdout = truncateOutput(result.stdout);
      const messageParts = [
        `${label} failed with exit code ${result.exitCode}`,
      ];
      if (hint) {
        messageParts.push(hint);
      }
      if (stderr) {
        messageParts.push(`STDERR:\n${stderr}`);
      }
      if (stdout) {
        messageParts.push(`STDOUT:\n${stdout}`);
      }
      throw new ManimValidationError(messageParts.join("\n\n"), stage, {
        exitCode: result.exitCode,
        stderr: result.stderr,
        stdout: result.stdout,
        hint,
      });
    }

    return result;
  };

  try {
    sandbox = await Sandbox.create("manim-ffmpeg-latex-voiceover-watermark", {
      timeoutMs: 900_000,
    });
    console.log("Concat sandbox created", { sandboxId: sandbox.sandboxId });

    const segmentPaths: string[] = [];
    let totalDuration = 0;

    for (let index = 0; index < segments.length; index++) {
      const segment = segments[index]!;
      const match = segment.dataUrl.match(/^data:video\/mp4;base64,(.+)$/);
      if (!match) {
        await ensureCleanup();
        throw new ManimValidationError(
          `Segment ${segment.id} is not a base64 MP4 data URL`,
          "input"
        );
      }
      const base64 = match[1]!;
      const bytes = Buffer.from(base64, "base64");
      if (!bytes.length) {
        await ensureCleanup();
        throw new ManimValidationError(
          `Segment ${segment.id} is empty after decoding`,
          "input"
        );
      }
      const filePath = `/home/user/segment-${index}.mp4`;
      const arrayBuffer = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength
      );
      await sandbox.files.write(filePath, arrayBuffer);
      segmentPaths.push(filePath);

      const probe = await runCommandOrThrow(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 ${filePath}`,
        {
          description: `Validate segment ${segment.id}`,
          stage: "video-validation",
          timeoutMs: 120_000,
        }
      );
      const duration = parseFloat((probe.stdout || "").trim());
      if (!duration || duration <= 0) {
        await ensureCleanup();
        throw new ManimValidationError(
          `Segment ${segment.id} has invalid duration: ${duration}`,
          "video-validation"
        );
      }
      totalDuration += duration;
    }

    const listFilePath = `/home/user/segments.txt`;
    const listContent = segmentPaths
      .map((segmentPath) => `file '${segmentPath}'`)
      .join("\n");
    await sandbox.files.write(listFilePath, listContent);

    const concatPath = `/home/user/combined.mp4`;
    await runCommandOrThrow(
      `ffmpeg -y -f concat -safe 0 -i ${listFilePath} -c copy ${concatPath}`,
      {
        description: "Segment concatenation",
        stage: "render",
        timeoutMs: Math.max(360_000, segments.length * 120_000),
        hint: "ffmpeg failed while concatenating segment videos.",
        streamOutput: { stderr: true },
      }
    );

    const concatProbe = await runCommandOrThrow(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 ${concatPath}`,
      {
        description: "Concatenated duration check",
        stage: "video-validation",
        timeoutMs: 120_000,
      }
    );
    const concatenatedDuration = parseFloat((concatProbe.stdout || "").trim());
    if (!concatenatedDuration || concatenatedDuration <= 0) {
      await ensureCleanup();
      throw new ManimValidationError(
        "Concatenated video duration is invalid.",
        "video-validation"
      );
    }

    const expectedMinDuration = totalDuration * 0.9;
    if (concatenatedDuration < expectedMinDuration) {
      console.warn(
        `Concatenated duration ${concatenatedDuration}s is less than expected ${expectedMinDuration}s`
      );
    }

    const fontFile = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
    const drawText = `drawtext=fontfile=${fontFile}:text='${watermarkText}':fontcolor=white@0.85:fontsize=24:box=1:boxcolor=black@0.4:boxborderw=10:x=w-tw-20:y=h-th-20`;
    const watermarkedPath = `/home/user/combined-watermarked.mp4`;

    await runCommandOrThrow(
      `ffmpeg -y -i ${concatPath} -vf "${drawText}" -c:v libx264 -profile:v main -pix_fmt yuv420p -movflags +faststart -c:a copy ${watermarkedPath}`,
      {
        description: "Watermark concatenated video",
        stage: "watermark",
        timeoutMs: 360_000,
        hint: "ffmpeg failed while watermarking the final video.",
        streamOutput: { stderr: true },
      }
    );

    const finalProbe = await runCommandOrThrow(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 ${watermarkedPath}`,
      {
        description: "Final video validation",
        stage: "watermark-validation",
        timeoutMs: 120_000,
      }
    );
    const finalDuration = parseFloat((finalProbe.stdout || "").trim());
    if (!finalDuration || finalDuration <= 0) {
      await ensureCleanup();
      throw new ManimValidationError(
        "Final watermarked video has invalid duration.",
        "watermark-validation"
      );
    }

    const fileBytesArray = (await sandbox.files.read(watermarkedPath, {
      format: "bytes",
    })) as Uint8Array;
    if (!fileBytesArray || !fileBytesArray.length) {
      await ensureCleanup();
      throw new ManimValidationError(
        "Downloaded concatenated video is empty.",
        "download"
      );
    }
    const fileBytes = Buffer.from(fileBytesArray);
    const base64 = fileBytes.toString("base64");
    const dataUrl = `data:video/mp4;base64,${base64}`;
    console.log(
      `Prepared concatenated base64 data URL (length: ${base64.length} chars)`
    );

    await ensureCleanup();
    return {
      videoPath: dataUrl,
      warnings: [],
      logs: [],
    };
  } catch (error) {
    await ensureCleanup();
    if (error instanceof ManimValidationError) {
      throw error;
    }
    if (error instanceof CommandExitError) {
      const stderr = error.stderr ?? "";
      const stdout = error.stdout ?? "";
      const message =
        error.error ?? error.message ?? "Segment concatenation failed";
      throw new ManimValidationError(
        [
          message,
          stderr ? `STDERR:\n${stderr}` : undefined,
          stdout ? `STDOUT:\n${stdout}` : undefined,
        ]
          .filter(Boolean)
          .join("\n\n"),
        "render",
        {
          stderr,
          stdout,
          exitCode: error.exitCode,
        }
      );
    }
    if (error instanceof Error) {
      throw error;
    }
    throw new ManimValidationError(String(error), "render");
  }
}
