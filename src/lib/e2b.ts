import { CommandExitError, Sandbox } from "@e2b/code-interpreter";
import { Buffer } from "node:buffer";
import { RenderLogEntry, ValidationStage } from "@/lib/types";

const MAX_COMMAND_OUTPUT_CHARS = 4000;
const MAX_COMMAND_BUFFER_CHARS = 20000;
let latexEnvironmentVerified = false;

const CTA_MARKER = "# __EDUVIDS_CTA_INJECTED__";
const SCENE_FADE_MARKER = "# __EDUVIDS_SCENE_FADE_OUT__";

const SCALED_TEXT_MARKER = "# __EDUVIDS_SCALED_TEXT__";

const SCALED_TEXT_HELPER = `${SCALED_TEXT_MARKER}
_TEXT_SCALE_FACTOR = 0.3
_TEXT_SCALE_THRESHOLD = 32

_OrigText = Text

def Text(*args, **kwargs):
    scale_font = False
    if "font_size" in kwargs and kwargs["font_size"] < _TEXT_SCALE_THRESHOLD:
        scale_font = True
        kwargs["font_size"] = kwargs["font_size"] / _TEXT_SCALE_FACTOR
    obj = _OrigText(*args, **kwargs)
    if scale_font:
        obj.scale(_TEXT_SCALE_FACTOR)
    return obj
`;

function injectScaledTextHelper(script: string): string {
  if (script.includes(SCALED_TEXT_MARKER)) return script;

  // Insert after the last top-level import line
  const lines = script.split("\n");
  let lastImportIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]?.trim() ?? "";
    if (
      trimmed.startsWith("import ") ||
      trimmed.startsWith("from ") ||
      trimmed.startsWith("#")
    ) {
      lastImportIndex = i;
    } else if (trimmed.length > 0) {
      break;
    }
  }

  const insertAt = lastImportIndex + 1;
  lines.splice(insertAt, 0, "", SCALED_TEXT_HELPER);
  return lines.join("\n");
}

function injectEduvidsCallout(script: string): string {
  if (script.includes(CTA_MARKER)) {
    return script;
  }

  const lines = script.split("\n");
  const constructPattern = /^\s*def\s+construct\s*\(\s*self\s*\)\s*:/;
  let constructIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    if (constructPattern.test(lines[i])) {
      constructIndex = i;
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

  const snippet = [
    `${bodyIndent}${CTA_MARKER}`,
    `${bodyIndent}# Clear scene and prepare for CTA (Call-to-Action)`,
    `${bodyIndent}existing_mobjects = list(self.mobjects)`,
    `${bodyIndent}if existing_mobjects:`,
    `${bodyIndent}    self.play(*[FadeOut(mob) for mob in existing_mobjects])`,
    `${bodyIndent}with self.voiceover(text="Generate your own educational videos for free at eduvids dot app"):`,
    `${bodyIndent}    cta_title = Text("Generate your own educational videos for free!", font="EB Garamond", disable_ligatures=True, font_size=32)`,
    `${bodyIndent}    cta_title.set_color(WHITE)`,
    `${bodyIndent}    cta_link = Text("https://eduvids.app", font="EB Garamond", disable_ligatures=True, font_size=28)`,
    `${bodyIndent}    cta_link.set_color(TEAL)`,
    `${bodyIndent}    cta_link.next_to(cta_title, DOWN, buff=0.4)`,
    `${bodyIndent}    cta_content = VGroup(cta_title, cta_link)`,
    `${bodyIndent}    cta_content.move_to(ORIGIN)`,
    ``,
    `${bodyIndent}    cta_title.set_z_index(101)`,
    `${bodyIndent}    cta_link.set_z_index(101)`,
    ``,
    `${bodyIndent}    self.play(FadeIn(cta_title, shift=UP*0.3), FadeIn(cta_link, shift=UP*0.3), run_time=1.0)`,
    `${bodyIndent}    self.wait(0.5)`,
    ``,
    `${bodyIndent}    self.play(cta_link.animate.scale(1.08), run_time=0.4)`,
    `${bodyIndent}    self.play(cta_link.animate.scale(1.0), run_time=0.4)`,
    `${bodyIndent}    self.wait(0.8)`,
  ];

  const insertionNeedsBlankLine =
    insertionIndex > constructIndex + 1 &&
    (lines[insertionIndex - 1]?.trim()?.length ?? 0) > 0;

  const insertionLines = insertionNeedsBlankLine ? ["", ...snippet] : snippet;

  lines.splice(insertionIndex, 0, ...insertionLines);

  return lines.join("\n");
}

function injectSceneFadeOut(script: string): string {
  const lines = script.split("\n");
  const constructPattern = /^\s*def\s+construct\s*\(\s*self\s*\)\s*:/;

  type ConstructBlock = {
    constructIndex: number;
    bodyIndent: string;
    endIndex: number;
  };

  const constructs: ConstructBlock[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (!constructPattern.test(lines[i])) continue;

    let bodyIndent = "        ";
    for (let j = i + 1; j < lines.length; j++) {
      const trimmed = lines[j]?.trim() ?? "";
      if (!trimmed.length) continue;
      const indentMatch = lines[j]?.match(/^\s+/);
      if (indentMatch && indentMatch[0]) {
        bodyIndent = indentMatch[0];
      } else {
        const defIndent = lines[i]?.match(/^\s*/)?.[0] ?? "";
        bodyIndent = `${defIndent}    `;
      }
      break;
    }

    let endIndex = lines.length;
    for (let k = i + 1; k < lines.length; k++) {
      const trimmed = lines[k]?.trim() ?? "";
      if (!trimmed.length) continue;
      const indent = lines[k]?.match(/^\s*/)?.[0] ?? "";
      if (indent.length < bodyIndent.length) {
        endIndex = k;
        break;
      }
    }

    constructs.push({ constructIndex: i, bodyIndent, endIndex });
  }

  if (!constructs.length) {
    return script;
  }

  const snippetForIndent = (indent: string) => [
    `${indent}${SCENE_FADE_MARKER}`,
    `${indent}existing_mobjects = list(self.mobjects)`,
    `${indent}if existing_mobjects:`,
    `${indent}    self.play(*[FadeOut(mob) for mob in existing_mobjects])`,
    `${indent}self.wait(0.25)`,
  ];

  const inserts: { index: number; lines: string[] }[] = [];

  for (const block of constructs) {
    const alreadyInjected = lines
      .slice(block.constructIndex + 1, block.endIndex)
      .some((line) => line.includes(SCENE_FADE_MARKER));
    if (alreadyInjected) continue;

    const insertionNeedsBlankLine =
      block.endIndex > block.constructIndex + 1 &&
      (lines[block.endIndex - 1]?.trim()?.length ?? 0) > 0;
    const snippet = snippetForIndent(block.bodyIndent);
    const insertionLines = insertionNeedsBlankLine ? ["", ...snippet] : snippet;
    inserts.push({ index: block.endIndex, lines: insertionLines });
  }

  if (!inserts.length) {
    return script;
  }

  inserts
    .sort((a, b) => b.index - a.index)
    .forEach((insert) => {
      lines.splice(insert.index, 0, ...insert.lines);
    });

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
    } = {},
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
  sandboxId: string;
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
  | "script-fix"
  | "files";

export type RenderProgressUpdate = {
  stage: RenderLifecycleStage;
  message: string;
  sandboxId?: string;
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
const extractSceneClassNames = (source: string) => {
  const names: string[] = [];
  const scenePattern =
    /class\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*(?:Scene|VoiceoverScene)[^)]*)\)\s*:/g;
  let match: RegExpExecArray | null;

  while ((match = scenePattern.exec(source)) !== null) {
    const name = match[1];
    if (name) {
      names.push(name);
    }
  }

  return names;
};

const hasExpectedSceneClass = (source: string) =>
  extractSceneClassNames(source).length > 0;

const movingCameraSceneDeclared = (source: string) =>
  /class\s+[A-Za-z_][A-Za-z0-9_]*\s*\([^)]*MovingCameraScene/.test(source);

const runHeuristicChecks = (
  source: string,
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
        "Detected self.camera.frame usage outside MovingCameraScene. Update the relevant scene class to inherit from MovingCameraScene or remove camera frame operations.",
    });
  }

  if (!/\bplay\s*\(/.test(source)) {
    warnings.push({
      stage: "heuristic",
      message:
        "Scene file contains no animations (play calls); output may be empty.",
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
    MAX_COMMAND_OUTPUT_CHARS,
  )}\n... output truncated (${
    normalized.length - MAX_COMMAND_OUTPUT_CHARS
  } more chars)`;
};

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

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
    "scene_classes = []",
    "for name, value in vars(module).items():",
    "    if not isinstance(value, type):",
    "        continue",
    "    if not issubclass(value, Scene) or value is Scene:",
    "        continue",
    "    if getattr(value, '__module__', None) != module.__name__:",
    "        continue",
    "    scene_classes.append((name, value))",
    "if not scene_classes:",
    '    raise SystemExit("No renderable scene classes were found in the script.")',
    "for name, scene_cls in scene_classes:",
    "    construct = getattr(scene_cls, 'construct', None)",
    "    if construct is None or not callable(construct):",
    '        raise SystemExit(f"{name} must define a callable construct() method.")',
    "    params = list(inspect.signature(construct).parameters.values())",
    "    if not params or params[0].kind not in (inspect.Parameter.POSITIONAL_ONLY, inspect.Parameter.POSITIONAL_OR_KEYWORD):",
    "        raise SystemExit(f\"{name}.construct() must accept 'self' as its first positional argument.\")",
    "print('Scene validation passed for:', ', '.join(name for name, _ in scene_classes))",
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
  onProgress?: (update: RenderProgressUpdate) => Promise<void> | void;
  existingSandboxId?: string;
  /** Called when dry-run fails — receives the current script and error output,
   *  returns the fixed script. Omit to skip the fix loop. */
  scriptFixer?: (script: string, errors: string) => Promise<string>;
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
  processId: number;
  scriptPath: string;
  mediaDir: string;
  baseVideosDir: string;
  sceneNames: string[];
  renderOptions?: RenderOptions;
  warnings: ValidationWarning[];
  logs: RenderLogEntry[];
  applyWatermark: boolean;
  existingSandboxId?: string;
}

export interface RenderPollResult {
  complete: boolean;
  success?: boolean;
  videoPath?: string;
  errorMessage?: string;
  logs: RenderLogEntry[];
  state: RenderState;
}

export interface StartRenderResult {
  state: RenderState;
  processId: number;
}

export async function startManimRender({
  script,
  prompt: _prompt,
  applyWatermark = true,
  renderOptions,
  onProgress,
  existingSandboxId,
  scriptFixer,
}: RenderRequest): Promise<StartRenderResult> {
  const normalizedScript = script.trim();
  let sceneNames = extractSceneClassNames(normalizedScript);
  const renderLogs: RenderLogEntry[] = [];

  const reportProgress = async (
    stage: RenderLifecycleStage,
    message: string,
    sandboxId?: string,
  ) => {
    if (!onProgress) return;
    try {
      await onProgress({ stage, message, sandboxId });
    } catch (error) {
      console.warn("Failed to deliver render progress update", {
        stage,
        message,
        sandboxId,
        error,
      });
    }
  };

  const pushLog = (
    entry: Omit<RenderLogEntry, "timestamp"> & { timestamp?: string },
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
      { logs: [...renderLogs] },
    );
  }
  if (!hasExpectedSceneClass(normalizedScript)) {
    pushLog({
      level: "error",
      message: "Aborting render: no scene classes found",
      context: "input",
    });
    throw new ManimValidationError(
      "Manim script must declare at least one renderable scene class before rendering.",
      "input",
      { logs: [...renderLogs] },
    );
  }
  let heuristicFixedScript = normalizedScript;
  const heuristicResult = runHeuristicChecks(heuristicFixedScript);
  if (heuristicResult.errors.length) {
    const summary = heuristicResult.errors
      .map((issue) => `- ${issue.message}`)
      .join("\n");
    pushLog({
      level: "warn",
      message: `Heuristic issues detected: ${summary}`,
      context: "heuristic",
    });

    if (scriptFixer) {
      await reportProgress(
        "script-fix",
        "Fixing heuristic issues before render",
      );
      heuristicFixedScript = await scriptFixer(
        heuristicFixedScript,
        `Heuristic validation failed:\n${summary}`,
      );

      // Re-extract scene names in case the fixer changed classes
      sceneNames = extractSceneClassNames(heuristicFixedScript);
      pushLog({
        level: "info",
        message: "Script fixer applied for heuristic errors",
        context: "heuristic",
      });
    } else {
      pushLog({
        level: "error",
        message: `Heuristic validation failed (no fixer available): ${summary}`,
        context: "heuristic",
      });
      throw new ManimValidationError(
        `Heuristic validation failed:\n${summary}`,
        "heuristic",
        { logs: [...renderLogs] },
      );
    }
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
    } = {},
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
    let bufferedStdout = "";
    let bufferedStderr = "";

    const appendWithLimit = (current: string, chunk: string, limit: number) => {
      if (!chunk) return current;
      const next = current + chunk;
      return next.length <= limit ? next : next.slice(-limit);
    };

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
      bufferedStdout = appendWithLimit(
        bufferedStdout,
        chunk,
        MAX_COMMAND_BUFFER_CHARS,
      );
      recordChunk(chunk, "stdout");
      if (userStdout) {
        userStdout(chunk);
      } else if (defaultStdout) {
        defaultStdout(chunk);
      }
    };

    const combinedStderr = (chunk: string) => {
      bufferedStderr = appendWithLimit(
        bufferedStderr,
        chunk,
        MAX_COMMAND_BUFFER_CHARS,
      );
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
      const stderr = truncateOutput(result.stderr || bufferedStderr);
      const stdout = truncateOutput(result.stdout || bufferedStdout);
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
        stderr: result.stderr || bufferedStderr,
        stdout: result.stdout || bufferedStdout,
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

  let shouldCleanup = true;

  try {
    if (existingSandboxId) {
      await reportProgress(
        "sandbox",
        "Connecting to existing rendering sandbox",
      );
      sandbox = await Sandbox.connect(existingSandboxId, {
        timeoutMs: 3_600_000, // 60 minutes
      });
      console.log("E2B sandbox connected successfully", {
        sandboxId: sandbox.sandboxId,
      });
      pushLog({
        level: "info",
        message: `Sandbox connected (${sandbox.sandboxId})`,
        context: "sandbox",
      });
      // Report sandboxId immediately so polling loop can capture it before timeout
      await reportProgress("sandbox", "Sandbox connected", sandbox.sandboxId);
    } else {
      await reportProgress("sandbox", "Provisioning secure rendering sandbox");
      sandbox = await Sandbox.create("manim20-ffmpeg-bookmarks-latest", {
        timeoutMs: 3_600_000, // 60 minutes
        envs: {
          ELEVEN_API_KEY: process.env.ELEVENLABS_API_KEY ?? "",
          TMPDIR: "/dev/shm",
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
      // Report sandboxId immediately so polling loop can capture it before timeout
      await reportProgress("sandbox", "Sandbox ready", sandbox.sandboxId);
    }

    const scriptPath = `/home/user/script.py`;
    const mediaDir = `/home/user/media`;
    const baseVideosDir = `${mediaDir}/videos`;

    let enhancedScript = heuristicFixedScript;
    enhancedScript = injectScaledTextHelper(enhancedScript);
    enhancedScript = injectSceneFadeOut(enhancedScript);
    enhancedScript = injectEduvidsCallout(enhancedScript);

    await reportProgress("prepare", "Uploading enhanced script to sandbox");
    await sandbox.files.write(scriptPath, enhancedScript);
    console.log("Manim script written to sandbox");
    pushLog({
      level: "info",
      message: "Script written to sandbox with enhancements",
      context: "prepare",
    });

    // Pre-render validation: syntax, AST safety, and scene structure.
    let currentScript = enhancedScript;
    let currentSceneNames = sceneNames;
    const PRE_RENDER_MAX_FIXES = 3;
    for (
      let preFixAttempt = 0;
      preFixAttempt <= PRE_RENDER_MAX_FIXES;
      preFixAttempt += 1
    ) {
      try {
        await runCommandOrThrow(`python -m py_compile ${scriptPath}`, {
          description: "Syntax check",
          stage: "syntax",
          timeoutMs: 120_000,
          hint: "Fix Python syntax errors reported above before rendering with Manim.",
        });
        break;
      } catch (syntaxError) {
        if (!scriptFixer || preFixAttempt === PRE_RENDER_MAX_FIXES) {
          if (syntaxError instanceof ManimValidationError) {
            throw syntaxError;
          }
          throw new ManimValidationError(
            `Syntax check failed: ${String(syntaxError)}`,
            "syntax",
            { logs: [...renderLogs] },
          );
        }

        await reportProgress(
          "script-fix",
          `Syntax check failed (attempt ${preFixAttempt + 1}/${
            PRE_RENDER_MAX_FIXES + 1
          }), requesting LLM fix`,
        );
        const errorMessage =
          syntaxError instanceof ManimValidationError
            ? syntaxError.message
            : String(syntaxError);
        const fixedScript = await scriptFixer(currentScript, errorMessage);
        currentScript = fixedScript;
        currentSceneNames = extractSceneClassNames(currentScript);
        if (!currentSceneNames.length) {
          throw syntaxError; // fixer broke the script structure
        }

        await sandbox.files.write(scriptPath, currentScript);

        // Quick syntax sanity check on the fixed script
        await runCommandOrThrow(`python -m py_compile ${scriptPath}`, {
          description: "Syntax check (post-fix)",
          stage: "syntax",
          timeoutMs: 120_000,
          hint: "Script fixer introduced a syntax error.",
        });
      }
    }

    await runCommandOrThrow(buildAstValidationCommand(scriptPath), {
      description: "AST validation",
      stage: "ast",
      timeoutMs: 120_000,
      hint: "Remove disallowed imports or builtins from the Manim script before rendering.",
    });

    await runCommandOrThrow(buildSceneValidationCommand(scriptPath), {
      description: "Scene validation",
      stage: "scene",
      timeoutMs: 120_000,
      hint: "Ensure each scene imports correctly, inherits from manim.Scene, and defines construct(self).",
    });

    // Check LaTeX availability
    if (!latexEnvironmentVerified) {
      await reportProgress("latex", "Checking LaTeX environment");
      await runCommandOrThrow(`latex --version`, {
        description: "Check LaTeX",
        stage: "latex",
        timeoutMs: 120_000,
        hint: "The Manim template requires LaTeX. Ensure it is installed in the sandbox template.",
      });
      latexEnvironmentVerified = true;
    }

    // Dry-run validation: render last frame only (`-s`) to catch errors
    // before committing to the full render. If scriptFixer is provided,
    // try to patch the script based on Manim output.
    const dryRunArgs = [
      scriptPath,
      ...currentSceneNames,
      "-s",
      "--disable_caching",
    ];
    const dryRunCmd = `manim ${dryRunArgs.join(" ")}`;
    const DRY_RUN_MAX_FIXES = 2;
    for (let attempt = 0; attempt <= DRY_RUN_MAX_FIXES; attempt += 1) {
      try {
        await runCommandOrThrow(dryRunCmd, {
          description: "Manim dry-run validation",
          stage: "dry-run",
          timeoutMs: 600_000, // 10 minutes
          hint: "Review the traceback to resolve errors inside your Manim scene.",
          streamOutput: true,
        });
        break;
      } catch (dryRunError) {
        if (!scriptFixer || attempt === DRY_RUN_MAX_FIXES) {
          if (dryRunError instanceof ManimValidationError) {
            throw dryRunError;
          }
          throw new ManimValidationError(
            `Dry-run validation failed: ${String(dryRunError)}`,
            "dry-run",
            { logs: [...renderLogs] },
          );
        }
        let errorMessage: string;
        if (dryRunError instanceof ManimValidationError) {
          errorMessage = dryRunError.message;
        } else if (dryRunError instanceof CommandExitError) {
          const parts: string[] = [`Manim command exited with code ${dryRunError.exitCode}`];
          if (dryRunError.stderr?.trim()) parts.push(`STDERR:\n${dryRunError.stderr}`);
          if (dryRunError.stdout?.trim()) parts.push(`STDOUT:\n${dryRunError.stdout}`);
          errorMessage = parts.join("\n\n");
        } else {
          errorMessage = String(dryRunError);
        }
        await reportProgress(
          "script-fix",
          `Dry-run failed (attempt ${attempt + 1}/${DRY_RUN_MAX_FIXES + 1}), requesting LLM fix`,
        );
        const fixedScript = await scriptFixer(currentScript, errorMessage);
        currentScript = fixedScript;
        currentSceneNames = extractSceneClassNames(currentScript);
        if (!currentSceneNames.length) {
          throw dryRunError; // fixer broke the script structure
        }

        await sandbox.files.write(scriptPath, currentScript);

        // Quick syntax sanity check on the fixed script
        await runCommandOrThrow(`python -m py_compile ${scriptPath}`, {
          description: "Syntax check (post-fix)",
          stage: "syntax",
          timeoutMs: 120_000,
          hint: "Script fixer introduced a syntax error.",
        });
      }
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

    // Use the (possibly fixed) scene names for the actual render
    const manimArgs = [
      scriptPath,
      ...currentSceneNames,
      "--media_dir",
      mediaDir,
      "--disable_caching",
      "--format=mp4",
      "-qm",
    ];
    if (resolution) {
      safeWidth = Math.max(1, Math.round(resolution.width));
      safeHeight = Math.max(1, Math.round(resolution.height));
      manimArgs.push("-r", `${safeHeight},${safeWidth}`);
    }

    const manimCmd = `manim ${manimArgs.join(" ")}`;
    const renderContextLabel = "Manim render";

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
        pushLog({ level, message: text, context: renderContextLabel });
      }
    };

    console.log("Starting manim render with command:", manimCmd);
    await reportProgress("render", "Rendering frames");
    const renderHandle = await sandbox.commands.run(manimCmd, {
      background: true,
      timeoutMs: 3_600_000, // 60 minutes
      onStdout: (chunk) => recordChunk(chunk, "stdout"),
      onStderr: (chunk) => recordChunk(chunk, "stderr"),
    });

    pushLog({
      level: "info",
      message: `Manim render started (pid ${renderHandle.pid})`,
      context: "render",
    });

    shouldCleanup = false;
    return {
      state: {
        sandboxId: sandbox.sandboxId,
        processId: renderHandle.pid,
        scriptPath,
        mediaDir,
        baseVideosDir,
        sceneNames: currentSceneNames,
        renderOptions,
        warnings,
        logs: [...renderLogs],
        applyWatermark,
        existingSandboxId,
      },
      processId: renderHandle.pid,
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
        },
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
    if (shouldCleanup) {
      await ensureCleanup();
    }
  }
}

export async function pollManimRender({
  state,
  maxWaitMs = 3_600_000,
  onProgress,
}: {
  state: RenderState;
  maxWaitMs?: number;
  onProgress?: (update: RenderProgressUpdate) => Promise<void> | void;
}): Promise<RenderPollResult> {
  const renderLogs: RenderLogEntry[] = [...state.logs];

  const reportProgress = async (
    stage: RenderLifecycleStage,
    message: string,
    sandboxId?: string,
  ) => {
    if (!onProgress) return;
    try {
      await onProgress({ stage, message, sandboxId });
    } catch (error) {
      console.warn("Failed to deliver render progress update", {
        stage,
        message,
        sandboxId,
        error,
      });
    }
  };

  const pushLog = (
    entry: Omit<RenderLogEntry, "timestamp"> & { timestamp?: string },
  ) => {
    const timestamp = entry.timestamp ?? new Date().toISOString();
    renderLogs.push({ ...entry, timestamp });
  };

  const renderContextLabel = "Manim render";

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
      pushLog({ level, message: text, context: renderContextLabel });
    }
  };

  let sandbox: Sandbox | null = null;
  try {
    sandbox = await Sandbox.connect(state.sandboxId, {
      timeoutMs: 3_600_000,
    });

    const processes = await sandbox.commands.list();
    const isRunning = processes.some((proc) => proc.pid === state.processId);

    if (!isRunning) {
      pushLog({
        level: "info",
        message: `Render process ${state.processId} is no longer running`,
        context: "render",
      });
      return {
        complete: true,
        success: true,
        logs: [...renderLogs],
        state: { ...state, logs: [...renderLogs] },
      };
    }

    const handle = await sandbox.commands.connect(state.processId, {
      onStdout: (chunk) => recordChunk(chunk, "stdout"),
      onStderr: (chunk) => recordChunk(chunk, "stderr"),
      timeoutMs: Math.max(60_000, maxWaitMs + 30_000),
    });

    const outcome = await Promise.race([
      handle
        .wait()
        .then((result) => ({ type: "result" as const, result }))
        .catch((error) => ({ type: "error" as const, error })),
      sleep(maxWaitMs).then(() => ({ type: "timeout" as const })),
    ]);

    if (outcome.type === "timeout") {
      await handle.disconnect();
      await reportProgress("render", "Rendering frames", state.sandboxId);
      pushLog({
        level: "info",
        message: `Render still in progress (pid ${state.processId})`,
        context: "render",
      });
      return {
        complete: false,
        logs: [...renderLogs],
        state: { ...state, logs: [...renderLogs] },
      };
    }

    if (outcome.type === "error") {
      const err = outcome.error;
      const errStderr =
        err instanceof CommandExitError ? err.stderr ?? "" : "";
      const errStdout =
        err instanceof CommandExitError ? err.stdout ?? "" : "";
      const stderr = truncateOutput(
        handle.stderr || errStderr || "",
      );
      const stdout = truncateOutput(
        handle.stdout || errStdout || "",
      );
      const exitCode =
        err instanceof CommandExitError ? err.exitCode : undefined;
      const messageParts = [
        typeof exitCode === "number"
          ? `Manim render failed with exit code ${exitCode}`
          : "Manim render failed",
        "Review the traceback to resolve errors inside your Manim scene.",
      ];
      if (stderr) {
        messageParts.push(`STDERR:\n${stderr}`);
      }
      if (stdout) {
        messageParts.push(`STDOUT:\n${stdout}`);
      }
      // Fall back to streamed render logs if handle/result had no output
      if (!stderr && !stdout) {
        const logLines = renderLogs
          .filter((l) => l.level === "stderr" || l.level === "stdout")
          .map((l) => l.message);
        if (logLines.length) {
          messageParts.push(
            `OUTPUT (from streamed logs):\n${truncateOutput(logLines.join("\n"))}`,
          );
        }
      }
      return {
        complete: true,
        success: false,
        errorMessage: messageParts.join("\n\n"),
        logs: [...renderLogs],
        state: { ...state, logs: [...renderLogs] },
      };
    }

    const result = outcome.result;
    if (result.exitCode !== 0) {
      const stderr = truncateOutput(result.stderr || handle.stderr || "");
      const stdout = truncateOutput(result.stdout || handle.stdout || "");
      const messageParts = [
        `Manim render failed with exit code ${result.exitCode}`,
        "Review the traceback to resolve errors inside your Manim scene.",
      ];
      if (stderr) {
        messageParts.push(`STDERR:\n${stderr}`);
      }
      if (stdout) {
        messageParts.push(`STDOUT:\n${stdout}`);
      }
      // Fall back to streamed render logs if result/handle had no output
      if (!stderr && !stdout) {
        const logLines = renderLogs
          .filter((l) => l.level === "stderr" || l.level === "stdout")
          .map((l) => l.message);
        if (logLines.length) {
          messageParts.push(
            `OUTPUT (from streamed logs):\n${truncateOutput(logLines.join("\n"))}`,
          );
        }
      }
      return {
        complete: true,
        success: false,
        errorMessage: messageParts.join("\n\n"),
        logs: [...renderLogs],
        state: { ...state, logs: [...renderLogs] },
      };
    }

    pushLog({
      level: "info",
      message: `Manim render completed (pid ${state.processId})`,
      context: "render",
    });

    return {
      complete: true,
      success: true,
      logs: [...renderLogs],
      state: { ...state, logs: [...renderLogs] },
    };
  } catch (err: unknown) {
    const errorMessage =
      err instanceof ManimValidationError ? err.message : String(err);
    return {
      complete: true,
      success: false,
      errorMessage,
      logs: [...renderLogs],
      state: { ...state, logs: [...renderLogs] },
    };
  }
}

export async function finalizeManimRender({
  state,
  onProgress,
}: {
  state: RenderState;
  onProgress?: (update: RenderProgressUpdate) => Promise<void> | void;
}): Promise<RenderResult> {
  const renderLogs: RenderLogEntry[] = [...state.logs];
  const warnings: ValidationWarning[] = [...state.warnings];

  const reportProgress = async (
    stage: RenderLifecycleStage,
    message: string,
    sandboxId?: string,
  ) => {
    if (!onProgress) return;
    try {
      await onProgress({ stage, message, sandboxId });
    } catch (error) {
      console.warn("Failed to deliver render progress update", {
        stage,
        message,
        sandboxId,
        error,
      });
    }
  };

  const pushLog = (
    entry: Omit<RenderLogEntry, "timestamp"> & { timestamp?: string },
  ) => {
    const timestamp = entry.timestamp ?? new Date().toISOString();
    renderLogs.push({ ...entry, timestamp });
  };

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
    } = {},
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
    let bufferedStdout = "";
    let bufferedStderr = "";

    const appendWithLimit = (current: string, chunk: string, limit: number) => {
      if (!chunk) return current;
      const next = current + chunk;
      return next.length <= limit ? next : next.slice(-limit);
    };

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
      bufferedStdout = appendWithLimit(
        bufferedStdout,
        chunk,
        MAX_COMMAND_BUFFER_CHARS,
      );
      recordChunk(chunk, "stdout");
      if (userStdout) {
        userStdout(chunk);
      } else if (defaultStdout) {
        defaultStdout(chunk);
      }
    };

    const combinedStderr = (chunk: string) => {
      bufferedStderr = appendWithLimit(
        bufferedStderr,
        chunk,
        MAX_COMMAND_BUFFER_CHARS,
      );
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
      const stderr = truncateOutput(result.stderr || bufferedStderr);
      const stdout = truncateOutput(result.stdout || bufferedStdout);
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
        stderr: result.stderr || bufferedStderr,
        stdout: result.stdout || bufferedStdout,
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
    sandbox = await Sandbox.connect(state.sandboxId, {
      timeoutMs: 3_600_000,
    });

    await reportProgress("render-output", "Render complete, locating output");

    const scriptFilename = state.scriptPath.split("/").pop() ?? "script.py";
    const moduleName = scriptFilename.replace(/\.py$/i, "");
    const qualityCandidates: string[] = [];

    const resolution = state.renderOptions?.resolution;
    let safeWidth: number | undefined;
    let safeHeight: number | undefined;
    if (resolution) {
      safeWidth = Math.max(1, Math.round(resolution.width));
      safeHeight = Math.max(1, Math.round(resolution.height));
      qualityCandidates.push(`custom_quality_${safeWidth}x${safeHeight}`);
    }
    qualityCandidates.push(
      "720p30",
      "medium_quality",
      "720p15",
      "480p15",
      "low_quality",
    );

    if (!sandbox) {
      await ensureCleanup();
      throw new ManimValidationError(
        "Sandbox is unavailable while locating the rendered video.",
        "render",
        { logs: [...renderLogs] },
      );
    }

    await reportProgress("files", "Locating rendered video file");
    const locateRenderedScenePath = async (sceneName: string) => {
      const candidatePaths = Array.from(
        new Set([
          ...qualityCandidates.map(
            (quality) =>
              `${state.baseVideosDir}/${moduleName}/${quality}/${sceneName}.mp4`,
          ),
          `${state.baseVideosDir}/${moduleName}/${sceneName}.mp4`,
        ]),
      );

      for (const candidate of candidatePaths) {
        const existsCheck = await sandbox!.commands.run(
          [
            "python - <<'PY'",
            "import os",
            `path = r"${candidate}"`,
            "print('1' if os.path.isfile(path) else '', end='')",
            "PY",
          ].join("\n"),
        );
        if ((existsCheck.stdout ?? "").trim() === "1") {
          return candidate;
        }
      }

      const searchResult = await sandbox!.commands.run(
        [
          "python - <<'PY'",
          "import os",
          `base = r"${state.baseVideosDir}/${moduleName}"`,
          `target = "${sceneName}.mp4"`,
          "if os.path.isdir(base):",
          "    for root, _, files in os.walk(base):",
          "        if target in files:",
          "            print(os.path.join(root, target))",
          "            break",
          "PY",
        ].join("\n"),
      );
      const locatedPath = (searchResult.stdout ?? "").trim();
      return locatedPath || undefined;
    };

    const renderedScenePaths: string[] = [];
    for (const sceneName of state.sceneNames) {
      const scenePath = await locateRenderedScenePath(sceneName);
      if (!scenePath) {
        await ensureCleanup();
        throw new ManimValidationError(
          `Unable to locate ${sceneName}.mp4 under ${state.baseVideosDir}/${moduleName}.`,
          "render",
          { logs: [...renderLogs] },
        );
      }
      renderedScenePaths.push(scenePath);
      pushLog({
        level: "info",
        message: `Video file located: ${scenePath}`,
        context: "files",
      });
    }

    let videoPath = renderedScenePaths[0];
    if (renderedScenePaths.length > 1) {
      const mergedVideoPath = `${state.baseVideosDir}/${moduleName}/combined.mp4`;
      await reportProgress("video-processing", "Concatenating rendered scenes");

      // Build concat filter chain (no fades/delays in ffmpeg)
      const inputs = renderedScenePaths.map((p) => `-i ${p}`).join(" ");
      const n = renderedScenePaths.length;

      const concatInputs = renderedScenePaths
        .map((_, i) => `[${i}:v][${i}:a]`)
        .join("");
      const filterComplex = `${concatInputs}concat=n=${n}:v=1:a=1[vout][aout]`;

      await runCommandOrThrow(
        `ffmpeg -y ${inputs} -filter_complex "${filterComplex}" -map "[vout]" -map "[aout]" -c:v libx264 -preset fast -crf 18 -c:a aac -b:a 192k ${mergedVideoPath}`,
        {
          description: "Concatenate rendered scenes",
          stage: "render",
          timeoutMs: 300_000,
          hint: "ffmpeg failed while joining individual scene renders.",
          streamOutput: { stdout: true, stderr: true },
        },
      );
      videoPath = mergedVideoPath;
    }

    const outputDirIndex = videoPath.lastIndexOf("/");
    const outputDir =
      outputDirIndex > 0 ? videoPath.slice(0, outputDirIndex) : state.baseVideosDir;

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
      },
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
        { logs: [...renderLogs] },
      );
    }

    const probeDimensions = await runCommandOrThrow(
      `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 ${videoPath}`,
      {
        description: "Video dimension probe",
        stage: "video-validation",
        timeoutMs: 180_000,
        hint: "Unable to read rendered video dimensions.",
      },
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

    if (state.applyWatermark) {
      const watermarkedPath = `${outputDir}/watermarked.mp4`;
      const watermarkText = "eduvids";
      const fontFile = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
      // const drawText = `drawtext=fontfile=${fontFile}:text='${watermarkText}':fontcolor=white@1.0:fontsize=24:box=1:boxcolor=black@0.4:boxborderw=10:x=w-tw-20:y=h-th-20`;
      const drawText = `drawtext=fontfile=${fontFile}:text='${watermarkText}':fontcolor=white@1.0:fontsize=24:box=0:x=w-tw-20:y=h-th-20`;
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
        "Validating watermarked video",
      );
      const probeWm = await runCommandOrThrow(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 ${watermarkedPath}`,
        {
          description: "Watermarked video validation",
          stage: "watermark-validation",
          timeoutMs: 180_000,
          hint: "The watermarked video appears to be corrupted.",
        },
      );
      const wmDuration = parseFloat((probeWm.stdout || "").trim());
      if (!wmDuration || wmDuration <= 0) {
        await ensureCleanup();
        throw new ManimValidationError(
          `Watermarked video has invalid duration: ${wmDuration}s — aborting upload`,
          "watermark-validation",
          { logs: [...renderLogs] },
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
        { logs: [...renderLogs] },
      );
    }
    const fileBytes = Buffer.from(fileBytesArray);
    const base64 = fileBytes.toString("base64");
    const dataUrl = `data:video/mp4;base64,${base64}`;
    console.log(
      `Prepared base64 data URL for upload (length: ${base64.length} chars)`,
    );
    pushLog({
      level: "info",
      message: "Prepared base64 data URL for upload",
      context: "download",
    });

    if (!sandbox) {
      throw new Error("Sandbox was unexpectedly null at return point");
    }

    return {
      videoPath: dataUrl,

      warnings,
      logs: [...renderLogs],
      sandboxId: sandbox.sandboxId,
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
        },
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

export async function renderManimVideo({
  script,
  prompt,
  applyWatermark = true,
  renderOptions,
  onProgress,
  existingSandboxId,
  scriptFixer,
}: RenderRequest): Promise<RenderResult> {
  const { state } = await startManimRender({
    script,
    prompt,
    applyWatermark,
    renderOptions,
    onProgress,
    existingSandboxId,
    scriptFixer,
  });

  let currentState = state;
  while (true) {
    const pollResult = await pollManimRender({
      state: currentState,
      maxWaitMs: 3_600_000,
      onProgress,
    });
    currentState = pollResult.state;
    if (!pollResult.complete) {
      continue;
    }
    if (pollResult.success === false) {
      throw new ManimValidationError(
        pollResult.errorMessage ?? "Manim render failed.",
        "render",
        {
          logs: [...currentState.logs],
        },
      );
    }
    break;
  }

  return finalizeManimRender({ state: currentState, onProgress });
}
