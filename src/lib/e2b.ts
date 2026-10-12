import { CommandExitError, Sandbox } from "@e2b/code-interpreter";
import { Buffer } from "node:buffer";
import { RenderLogEntry, ValidationStage } from "@/lib/types";
import {
  EDUVIDS_TTS_SERVICE_PATH,
  EDUVIDS_TTS_SERVICE_SOURCE,
  eduvidsTTSSandboxEnvironment,
} from "@/lib/eduvids-tts-service";
import type { RelatedYouTubeVideo } from "@/lib/youtube-metadata";
import type { VideoTitleSet } from "@/lib/youtube-metadata";
import {
  buildThumbnailSpecs,
  loadThumbnailAssets,
  type ThumbnailPalette,
} from "@/lib/youtube-thumbnail";
import {
  applyVideoStyle,
  loadVideoStyleAssets,
  RENDER_DRIVER_PATH,
  videoPalette,
  videoRenderFlags,
  WATERMARK_FONT_COMMAND,
  WATERMARK_STYLE,
} from "@/lib/video-style";

const MAX_COMMAND_OUTPUT_CHARS = 4000;
const MAX_COMMAND_BUFFER_CHARS = 20000;
let latexEnvironmentVerified = false;

const CTA_MARKER = "# __EDUVIDS_CTA_INJECTED__";
const SCENE_FADE_MARKER = "# __EDUVIDS_SCENE_FADE_OUT__";

export function injectEduvidsCallout(
  script: string,
  previousVideo?: RelatedYouTubeVideo,
): string {
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

  const previousTitle = previousVideo?.title.trim().slice(0, 100);
  const narration = previousTitle
    ? `Continue with our previous video, ${previousTitle}. The link is in the description and top comment.`
    : "Generate your own educational videos for free at eduvids dot app";
  const narrationLiteral = JSON.stringify(narration);

  // House typography, as on the thumbnails: a large balanced SemiBold
  // headline, a sentence-case lead-in, accent for the one action, and no
  // block-capital tags. Names come from eduvids_style.
  const contentLines = previousTitle
    ? [
        `${bodyIndent}    lead = Text("Watch next", font_size=36, color=MUTED)`,
        `${bodyIndent}    previous_title = balanced_text(${JSON.stringify(previousTitle)}, font_size=60, max_lines=3)`,
        `${bodyIndent}    link_hint = Text("Link in description and top comment", font_size=32, color=MUTED)`,
        `${bodyIndent}    subscribe_hint = Text("Subscribe for the next visual", font_size=32, color=ACCENT)`,
        `${bodyIndent}    heading = VGroup(lead, previous_title).arrange(DOWN, aligned_edge=LEFT, buff=0.3)`,
        `${bodyIndent}    hints = VGroup(link_hint, subscribe_hint).arrange(DOWN, aligned_edge=LEFT, buff=0.22)`,
        `${bodyIndent}    end_content = VGroup(heading, hints).arrange(DOWN, aligned_edge=LEFT, buff=0.6)`,
        `${bodyIndent}    if end_content.width > config.frame_width - 1.6:`,
        `${bodyIndent}        end_content.scale_to_fit_width(config.frame_width - 1.6)`,
        `${bodyIndent}    end_content.move_to(ORIGIN)`,
        `${bodyIndent}    lock_layout(end_content)`,
        `${bodyIndent}    if isinstance(self, ThreeDScene):`,
        `${bodyIndent}        fixed_overlay(self, end_content)`,
        `${bodyIndent}    self.play(FadeIn(lead, shift=UP * 0.15), pop_in(previous_title, scale=0.85), run_time=max(0.4, tracker.duration * 0.25))`,
        `${bodyIndent}    self.play(FadeIn(link_hint, shift=UP * 0.1), run_time=max(0.3, tracker.duration * 0.15))`,
        `${bodyIndent}    self.play(pop_in(subscribe_hint), run_time=max(0.3, tracker.duration * 0.15))`,
        `${bodyIndent}    self.wait(max(0, tracker.get_remaining_duration()))`,
      ]
    : [
        `${bodyIndent}    cta_title = balanced_text("Generate your own educational videos for free", font_size=60, max_lines=3)`,
        `${bodyIndent}    cta_link = Text("eduvids.app", font_size=44, color=ACCENT)`,
        `${bodyIndent}    cta_content = VGroup(cta_title, cta_link).arrange(DOWN, aligned_edge=LEFT, buff=0.55)`,
        `${bodyIndent}    if cta_content.width > config.frame_width - 1.6:`,
        `${bodyIndent}        cta_content.scale_to_fit_width(config.frame_width - 1.6)`,
        `${bodyIndent}    cta_content.move_to(ORIGIN)`,
        `${bodyIndent}    lock_layout(cta_content)`,
        `${bodyIndent}    if isinstance(self, ThreeDScene):`,
        `${bodyIndent}        fixed_overlay(self, cta_content)`,
        `${bodyIndent}    self.play(pop_in(cta_title, scale=0.85), run_time=max(0.4, tracker.duration * 0.30))`,
        `${bodyIndent}    self.play(pop_in(cta_link), run_time=max(0.3, tracker.duration * 0.20))`,
        `${bodyIndent}    self.play(pulse(cta_link, scale=1.06), run_time=max(0.3, tracker.duration * 0.20))`,
        `${bodyIndent}    self.wait(max(0, tracker.get_remaining_duration()))`,
      ];

  const snippet = [
    `${bodyIndent}${CTA_MARKER}`,
    `${bodyIndent}# Clear scene and prepare for CTA (Call-to-Action)`,
    `${bodyIndent}existing_mobjects = list(self.mobjects)`,
    `${bodyIndent}if existing_mobjects:`,
    `${bodyIndent}    self.play(*[FadeOut(mob) for mob in existing_mobjects])`,
    `${bodyIndent}# End camera motion and reveal the end card as a screen overlay`,
    `${bodyIndent}if isinstance(self, ThreeDScene):`,
    `${bodyIndent}    self.stop_ambient_camera_rotation()`,
    `${bodyIndent}with self.voiceover(text=${narrationLiteral}) as tracker:`,
    ...contentLines,
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

export class ManimValidationError extends Error {
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
  sessionId?: string;
  variant?: "video" | "short";
  applyWatermark?: boolean;
  renderOptions?: RenderOptions;
  onProgress?: (update: RenderProgressUpdate) => Promise<void> | void;
  existingSandboxId?: string;
  previousVideo?: RelatedYouTubeVideo;
  /** The video's palette; pass the thumbnail's so the two match. */
  palette?: ThumbnailPalette;
  /** Skip the synchronous dry run when rendering in a durable sandbox job. */
  skipDryRun?: boolean;
  /** Called when dry-run fails — receives the current script and error output,
   *  returns the fixed script. Omit to skip the fix loop. */
  scriptFixer?: (script: string, errors: string) => Promise<string>;
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
  /** The watermark is drawn into frames, so postprocessing need not re-encode. */
  watermarkInVideo?: boolean;
  existingSandboxId?: string;
  prompt?: string;
  sessionId?: string;
  variant?: "video" | "short";
  previousVideo?: RelatedYouTubeVideo;
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

/**
 * Serializable state returned by prepareManimSandbox, holding everything
 * needed to kick off the actual render in a separate workflow step.
 */
export interface PreparedSandboxState {
  sandboxId: string;
  scriptPath: string;
  mediaDir: string;
  baseVideosDir: string;
  sceneNames: string[];
  renderOptions?: RenderOptions;
  warnings: ValidationWarning[];
  logs: RenderLogEntry[];
  applyWatermark: boolean;
  /** The watermark is drawn into frames, so postprocessing need not re-encode. */
  watermarkInVideo?: boolean;
  existingSandboxId?: string;
  prompt?: string;
  sessionId?: string;
  variant?: "video" | "short";
  previousVideo?: RelatedYouTubeVideo;
}

const SANDBOX_TEMPLATE = "manim20-ffmpeg-bookmarks-latest";
const THUMBNAIL_ROOT = "/home/user/eduvids-thumbnail";

export interface ThumbnailRenderResult {
  /** PNG data URLs in candidate order; null where that candidate failed. */
  images: [string | null, string | null, string | null];
  report: unknown;
}

/**
 * Install the house style module and its fonts into the sandbox's user
 * site-packages, where every generated script (and the validators) can import
 * it as `eduvids_style`.
 */
async function installVideoStyle(
  sandbox: Sandbox,
  palette: ThumbnailPalette,
  { watermark = false }: { watermark?: boolean } = {},
): Promise<void> {
  const assets = await loadVideoStyleAssets(palette, { watermark });
  const site = (
    await sandbox.commands.run(
      `python -c "import site; print(site.getusersitepackages())"`,
    )
  ).stdout.trim();
  await sandbox.commands.run(`mkdir -p "${site}/eduvids-fonts"`);
  await Promise.all([
    sandbox.files.write(`${site}/eduvids_style.py`, assets.module),
    sandbox.files.write(RENDER_DRIVER_PATH, assets.driver),
    ...assets.fonts.map(({ name, data }) =>
      sandbox.files.write(
        `${site}/eduvids-fonts/${name}`,
        data.buffer.slice(
          data.byteOffset,
          data.byteOffset + data.byteLength,
        ) as ArrayBuffer,
      ),
    ),
  ]);
}

/**
 * Render the three title-paired thumbnails from data specs with the bundled
 * renderer. Each candidate renders in its own process and retries once in
 * safe mode, so one bad spec never takes the others down. If the video's
 * sandbox has already been reclaimed, a fresh one is used.
 */
export async function renderThumbnailCandidates({
  prepared,
  titles,
  topic,
  designSeed,
}: {
  /** The video's sandbox, if it is idle; otherwise a fresh one is used. */
  prepared?: PreparedSandboxState;
  titles: VideoTitleSet;
  topic: string;
  designSeed: string;
}): Promise<ThumbnailRenderResult> {
  let sandbox: Sandbox | undefined;
  let ownsSandbox = false;
  if (prepared) {
    try {
      sandbox = await Sandbox.connect(prepared.sandboxId, {
        timeoutMs: 3_600_000,
        requestTimeoutMs: 180_000,
      });
    } catch (error) {
      console.warn(
        "Video sandbox unavailable for thumbnails; starting a fresh one",
        error instanceof Error ? error.message : error,
      );
    }
  }
  if (!sandbox) {
    sandbox = await Sandbox.create(SANDBOX_TEMPLATE, { timeoutMs: 600_000 });
    ownsSandbox = true;
  }

  try {
    const assets = await loadThumbnailAssets();
    await sandbox.commands.run(
      `rm -rf ${THUMBNAIL_ROOT}/out && mkdir -p ${THUMBNAIL_ROOT}/fonts`,
    );
    const specs = buildThumbnailSpecs({ titles, topic, designSeed });
    await Promise.all([
      sandbox.files.write(`${THUMBNAIL_ROOT}/renderer.py`, assets.renderer),
      sandbox.files.write(
        `${THUMBNAIL_ROOT}/specs.json`,
        JSON.stringify(specs),
      ),
      ...assets.fonts.map(({ name, data }) =>
        sandbox.files.write(
          `${THUMBNAIL_ROOT}/fonts/${name}`,
          data.buffer.slice(
            data.byteOffset,
            data.byteOffset + data.byteLength,
          ) as ArrayBuffer,
        ),
      ),
    ]);

    try {
      await sandbox.commands.run(
        `cd ${THUMBNAIL_ROOT} && python renderer.py batch --spec specs.json --out-dir out --font-dir fonts --timeout 150`,
        { timeoutMs: 180_000 },
      );
    } catch (error) {
      // Exit code 1 means no candidate rendered; results.json explains why.
      if (!(error instanceof CommandExitError)) throw error;
    }

    const report = JSON.parse(
      await sandbox.files.read(`${THUMBNAIL_ROOT}/out/results.json`),
    ) as Record<string, { ok: boolean; path?: string; errors?: string[] }>;

    const images = (await Promise.all(
      specs.map(async (_, index) => {
        const result = report[String(index)];
        if (!result?.ok || !result.path) {
          console.warn(
            `Thumbnail ${index} failed:`,
            result?.errors?.map((entry) => entry.slice(-400)),
          );
          return null;
        }
        const bytes = (await sandbox.files.read(result.path, {
          format: "bytes",
        })) as Uint8Array;
        return bytes.length
          ? `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`
          : null;
      }),
    )) as ThumbnailRenderResult["images"];

    if (images.every((image) => image === null)) {
      throw new Error("No thumbnail candidate rendered");
    }
    return { images, report };
  } finally {
    if (ownsSandbox) await sandbox.kill().catch(() => undefined);
  }
}

export async function startManimRender({
  script,
  prompt,
  sessionId,
  variant,
  applyWatermark = true,
  renderOptions,
  onProgress,
  existingSandboxId,
  previousVideo,
  palette,
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

    const buildManimError = (
      exitCode: number,
      rawStderr: string,
      rawStdout: string,
    ) => {
      const label = description ?? command;
      const stderr = truncateOutput(rawStderr);
      const stdout = truncateOutput(rawStdout);
      const messageParts = [`${label} failed with exit code ${exitCode}`];
      if (hint) {
        messageParts.push(hint);
      }
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
        message: `${label} failed with exit code ${exitCode}`,
        context: contextLabel,
      });
      const error = new ManimValidationError(messageParts.join("\n\n"), stage, {
        exitCode,
        stderr: rawStderr,
        stdout: rawStdout,
        hint,
        logs: [...renderLogs],
      });
      Object.assign(error, {
        command,
        description: label,
      });
      return error;
    };

    let result: Awaited<ReturnType<typeof sandbox.commands.run>>;
    try {
      result = await sandbox.commands.run(command, {
        envs: eduvidsTTSSandboxEnvironment(),
        timeoutMs,
        onStdout: streamStdout || onStdout ? combinedStdout : undefined,
        onStderr: streamStderr || onStderr ? combinedStderr : undefined,
      });
    } catch (cmdErr) {
      if (cmdErr instanceof CommandExitError) {
        throw buildManimError(
          cmdErr.exitCode,
          cmdErr.stderr || bufferedStderr,
          cmdErr.stdout || bufferedStdout,
        );
      }
      throw cmdErr;
    }
    if (result.exitCode !== 0) {
      throw buildManimError(
        result.exitCode,
        result.stderr || bufferedStderr,
        result.stdout || bufferedStdout,
      );
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
      sandbox = await Sandbox.create(SANDBOX_TEMPLATE, {
        timeoutMs: 3_600_000, // 60 minutes
        envs: {
          ...eduvidsTTSSandboxEnvironment(),
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

    await sandbox.files.write(
      EDUVIDS_TTS_SERVICE_PATH,
      EDUVIDS_TTS_SERVICE_SOURCE,
    );
    await installVideoStyle(
      sandbox,
      palette ?? videoPalette(sessionId ?? prompt),
    );

    let enhancedScript = heuristicFixedScript;
    enhancedScript = applyVideoStyle(enhancedScript);
    enhancedScript = injectSceneFadeOut(enhancedScript);
    enhancedScript = injectEduvidsCallout(enhancedScript, previousVideo);

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
      stage: "ast-guard",
      timeoutMs: 120_000,
      hint: "Remove disallowed imports or builtins from the Manim script before rendering.",
    });

    await runCommandOrThrow(buildSceneValidationCommand(scriptPath), {
      description: "Scene validation",
      stage: "scene-validation",
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
          timeoutMs: 240_000, // 4 minutes to stay within Vercel step limits
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
        const errorMessage =
          dryRunError instanceof ManimValidationError
            ? dryRunError.message
            : String(dryRunError);
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
      ...videoRenderFlags(resolution),
    ];
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
      envs: eduvidsTTSSandboxEnvironment(),
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
        prompt,
        sessionId,
        variant,
        previousVideo,
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

/**
 * Phase 1: Create sandbox, upload script, run all validations and dry-run
 * with fix loops. Returns a serializable PreparedSandboxState so the actual
 * render can be kicked off in a separate workflow step.
 */
export async function prepareManimSandbox({
  script,
  prompt,
  sessionId,
  variant,
  applyWatermark = true,
  renderOptions,
  onProgress,
  existingSandboxId,
  previousVideo,
  palette,
  scriptFixer,
  skipDryRun = false,
}: RenderRequest): Promise<PreparedSandboxState> {
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
    message: "Beginning render pipeline (prepare phase)",
    context: "render",
  });
  if (!normalizedScript.length) {
    throw new ManimValidationError(
      "Manim script is empty. Please provide a scene before rendering.",
      "input",
      { logs: [...renderLogs] },
    );
  }
  if (!hasExpectedSceneClass(normalizedScript)) {
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
    if (scriptFixer) {
      await reportProgress(
        "script-fix",
        "Fixing heuristic issues before render",
      );
      heuristicFixedScript = await scriptFixer(
        heuristicFixedScript,
        `Heuristic validation failed:\n${summary}`,
      );
      sceneNames = extractSceneClassNames(heuristicFixedScript);
    } else {
      throw new ManimValidationError(
        `Heuristic validation failed:\n${summary}`,
        "heuristic",
        { logs: [...renderLogs] },
      );
    }
  }

  const warnings: ValidationWarning[] = [...heuristicResult.warnings];
  let sandbox: Sandbox | null = null;

  const ensureCleanup = async () => {
    if (sandbox) {
      try {
        await sandbox.kill();
      } catch (cleanupError) {
        console.warn("Sandbox cleanup error (non-fatal):", cleanupError);
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

    let bufferedStdout = "";
    let bufferedStderr = "";

    const appendWithLimit = (current: string, chunk: string, limit: number) => {
      if (!chunk) return current;
      const next = current + chunk;
      return next.length <= limit ? next : next.slice(-limit);
    };

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

    const combinedStdout = (chunk: string) => {
      bufferedStdout = appendWithLimit(
        bufferedStdout,
        chunk,
        MAX_COMMAND_BUFFER_CHARS,
      );
      recordChunk(chunk, "stdout");
      if (streamStdout) {
        console.log(`[${contextLabel}][stdout] ${chunk}`);
      }
    };

    const combinedStderr = (chunk: string) => {
      bufferedStderr = appendWithLimit(
        bufferedStderr,
        chunk,
        MAX_COMMAND_BUFFER_CHARS,
      );
      recordChunk(chunk, "stderr");
      if (streamStderr) {
        console.error(`[${contextLabel}][stderr] ${chunk}`);
      }
    };

    const buildManimError = (
      exitCode: number,
      rawStderr: string,
      rawStdout: string,
    ) => {
      const label = description ?? command;
      const stderr = truncateOutput(rawStderr);
      const stdout = truncateOutput(rawStdout);
      const messageParts = [`${label} failed with exit code ${exitCode}`];
      if (hint) messageParts.push(hint);
      if (stderr) messageParts.push(`STDERR:\n${stderr}`);
      if (stdout) messageParts.push(`STDOUT:\n${stdout}`);
      return new ManimValidationError(messageParts.join("\n\n"), stage, {
        exitCode,
        stderr: rawStderr,
        stdout: rawStdout,
        hint,
        logs: [...renderLogs],
      });
    };

    let result: Awaited<ReturnType<typeof sandbox.commands.run>>;
    try {
      result = await sandbox.commands.run(command, {
        envs: eduvidsTTSSandboxEnvironment(),
        timeoutMs,
        onStdout: streamStdout ? combinedStdout : undefined,
        onStderr: streamStderr ? combinedStderr : undefined,
      });
    } catch (cmdErr) {
      if (cmdErr instanceof CommandExitError) {
        throw buildManimError(
          cmdErr.exitCode,
          cmdErr.stderr || bufferedStderr,
          cmdErr.stdout || bufferedStdout,
        );
      }
      throw cmdErr;
    }
    if (result.exitCode !== 0) {
      throw buildManimError(
        result.exitCode,
        result.stderr || bufferedStderr,
        result.stdout || bufferedStdout,
      );
    }
    const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);
    console.log(`${description ?? command} succeeded in ${elapsedSeconds}s`);
    return result;
  };

  try {
    if (existingSandboxId) {
      await reportProgress(
        "sandbox",
        "Connecting to existing rendering sandbox",
      );
      sandbox = await Sandbox.connect(existingSandboxId, {
        timeoutMs: 3_600_000,
        requestTimeoutMs: 15_000,
      });
    } else {
      await reportProgress("sandbox", "Provisioning secure rendering sandbox");
      sandbox = await Sandbox.create(SANDBOX_TEMPLATE, {
        timeoutMs: 3_600_000,
        requestTimeoutMs: 15_000,
        envs: {
          ...eduvidsTTSSandboxEnvironment(),
          TMPDIR: "/dev/shm",
        },
      });
    }
    await reportProgress("sandbox", "Sandbox ready", sandbox.sandboxId);

    const scriptPath = `/home/user/script.py`;
    const mediaDir = `/home/user/media`;
    const baseVideosDir = `${mediaDir}/videos`;

    await sandbox.files.write(
      EDUVIDS_TTS_SERVICE_PATH,
      EDUVIDS_TTS_SERVICE_SOURCE,
    );
    await installVideoStyle(
      sandbox,
      palette ?? videoPalette(sessionId ?? prompt),
      { watermark: applyWatermark },
    );

    let enhancedScript = heuristicFixedScript;
    enhancedScript = applyVideoStyle(enhancedScript);
    enhancedScript = injectSceneFadeOut(enhancedScript);
    enhancedScript = injectEduvidsCallout(enhancedScript, previousVideo);

    await sandbox.files.write(scriptPath, enhancedScript);

    // Pre-render validation
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
          timeoutMs: 20_000,
          hint: "Fix Python syntax errors reported above before rendering with Manim.",
        });
        break;
      } catch (syntaxError) {
        if (!scriptFixer || preFixAttempt === PRE_RENDER_MAX_FIXES) {
          throw syntaxError instanceof ManimValidationError
            ? syntaxError
            : new ManimValidationError(
                `Syntax check failed: ${String(syntaxError)}`,
                "syntax",
                { logs: [...renderLogs] },
              );
        }
        const errorMessage =
          syntaxError instanceof ManimValidationError
            ? syntaxError.message
            : String(syntaxError);
        const fixedScript = await scriptFixer(currentScript, errorMessage);
        currentScript = fixedScript;
        currentSceneNames = extractSceneClassNames(currentScript);
        if (!currentSceneNames.length) throw syntaxError;
        await sandbox.files.write(scriptPath, currentScript);
        await runCommandOrThrow(`python -m py_compile ${scriptPath}`, {
          description: "Syntax check (post-fix)",
          stage: "syntax",
          timeoutMs: 20_000,
        });
      }
    }

    await runCommandOrThrow(buildAstValidationCommand(scriptPath), {
      description: "AST validation",
      stage: "ast-guard",
      timeoutMs: 20_000,
    });

    await runCommandOrThrow(buildSceneValidationCommand(scriptPath), {
      description: "Scene validation",
      stage: "scene-validation",
      // Importing manim alone takes ~8s on a cold sandbox.
      timeoutMs: 60_000,
    });

    if (!latexEnvironmentVerified) {
      await runCommandOrThrow(`latex --version`, {
        description: "Check LaTeX",
        stage: "latex",
        timeoutMs: 20_000,
      });
      latexEnvironmentVerified = true;
    }

    if (!skipDryRun) {
      // Dry-run validation
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
            timeoutMs: 240_000, // 4 min per attempt to stay within 5 min step
            streamOutput: true,
          });
          break;
        } catch (dryRunError) {
          if (!scriptFixer || attempt === DRY_RUN_MAX_FIXES) {
            throw dryRunError instanceof ManimValidationError
              ? dryRunError
              : new ManimValidationError(
                  `Dry-run validation failed: ${String(dryRunError)}`,
                  "dry-run",
                  { logs: [...renderLogs] },
                );
          }
          const errorMessage =
            dryRunError instanceof ManimValidationError
              ? dryRunError.message
              : String(dryRunError);
          const fixedScript = await scriptFixer(currentScript, errorMessage);
          currentScript = fixedScript;
          currentSceneNames = extractSceneClassNames(currentScript);
          if (!currentSceneNames.length) throw dryRunError;
          await sandbox.files.write(scriptPath, currentScript);
          await runCommandOrThrow(`python -m py_compile ${scriptPath}`, {
            description: "Syntax check (post-fix)",
            stage: "syntax",
            timeoutMs: 20_000,
          });
        }
      }
    }

    return {
      sandboxId: sandbox.sandboxId,
      scriptPath,
      mediaDir,
      baseVideosDir,
      sceneNames: currentSceneNames,
      renderOptions,
      warnings,
      logs: [...renderLogs],
      applyWatermark,
      watermarkInVideo: applyWatermark,
      existingSandboxId,
      prompt,
      sessionId,
      variant,
      previousVideo,
    };
  } catch (err: unknown) {
    console.error("E2B prepare error:", err);
    await ensureCleanup();
    if (err instanceof ManimValidationError) {
      err.logs = err.logs ?? [...renderLogs];
      throw err;
    }
    if (err instanceof Error) {
      (err as ManimValidationError).logs = [...renderLogs];
      throw err;
    }
    throw new ManimValidationError(String(err), "render", {
      logs: [...renderLogs],
    });
  }
}

/**
 * Phase 2: Kick off the background Manim render command on an already-prepared
 * sandbox. This is fast (just starts the process) and returns immediately.
 */
export async function launchManimRender({
  prepared,
}: {
  prepared: PreparedSandboxState;
}): Promise<StartRenderResult> {
  const renderLogs: RenderLogEntry[] = [...prepared.logs];
  const pushLog = (
    entry: Omit<RenderLogEntry, "timestamp"> & { timestamp?: string },
  ) => {
    const timestamp = entry.timestamp ?? new Date().toISOString();
    renderLogs.push({ ...entry, timestamp });
  };

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
      pushLog({ level, message: text, context: "Manim render" });
    }
  };

  const sandbox = await Sandbox.connect(prepared.sandboxId, {
    timeoutMs: 3_600_000,
  });

  const manimArgs = [
    prepared.scriptPath,
    ...prepared.sceneNames,
    "--media_dir",
    prepared.mediaDir,
    ...videoRenderFlags(prepared.renderOptions?.resolution),
  ];

  const manimCmd = `manim ${manimArgs.join(" ")}`;
  console.log("Starting manim render with command:", manimCmd);

  const renderHandle = await sandbox.commands.run(manimCmd, {
    background: true,
    envs: eduvidsTTSSandboxEnvironment(),
    timeoutMs: 3_600_000,
    onStdout: (chunk) => recordChunk(chunk, "stdout"),
    onStderr: (chunk) => recordChunk(chunk, "stderr"),
  });

  pushLog({
    level: "info",
    message: `Manim render started (pid ${renderHandle.pid})`,
    context: "render",
  });

  return {
    state: {
      sandboxId: prepared.sandboxId,
      processId: renderHandle.pid,
      scriptPath: prepared.scriptPath,
      mediaDir: prepared.mediaDir,
      baseVideosDir: prepared.baseVideosDir,
      sceneNames: prepared.sceneNames,
      renderOptions: prepared.renderOptions,
      warnings: prepared.warnings,
      logs: [...renderLogs],
      applyWatermark: prepared.applyWatermark,
      existingSandboxId: prepared.existingSandboxId,
      prompt: prepared.prompt,
      sessionId: prepared.sessionId,
      variant: prepared.variant,
    },
    processId: renderHandle.pid,
  };
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
        err instanceof CommandExitError ? (err.stderr ?? "") : "";
      const errStdout =
        err instanceof CommandExitError ? (err.stdout ?? "") : "";
      const stderr = truncateOutput(handle.stderr || errStderr || "");
      const stdout = truncateOutput(handle.stdout || errStdout || "");
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

    const buildManimError = (
      exitCode: number,
      rawStderr: string,
      rawStdout: string,
    ) => {
      const label = description ?? command;
      const stderr = truncateOutput(rawStderr);
      const stdout = truncateOutput(rawStdout);
      const messageParts = [`${label} failed with exit code ${exitCode}`];
      if (hint) {
        messageParts.push(hint);
      }
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
        message: `${label} failed with exit code ${exitCode}`,
        context: contextLabel,
      });
      const error = new ManimValidationError(messageParts.join("\n\n"), stage, {
        exitCode,
        stderr: rawStderr,
        stdout: rawStdout,
        hint,
        logs: [...renderLogs],
      });
      Object.assign(error, {
        command,
        description: label,
      });
      return error;
    };

    let result: Awaited<ReturnType<typeof sandbox.commands.run>>;
    try {
      result = await sandbox.commands.run(command, {
        timeoutMs,
        onStdout: streamStdout || onStdout ? combinedStdout : undefined,
        onStderr: streamStderr || onStderr ? combinedStderr : undefined,
      });
    } catch (cmdErr) {
      if (cmdErr instanceof CommandExitError) {
        throw buildManimError(
          cmdErr.exitCode,
          cmdErr.stderr || bufferedStderr,
          cmdErr.stdout || bufferedStdout,
        );
      }
      throw cmdErr;
    }
    if (result.exitCode !== 0) {
      throw buildManimError(
        result.exitCode,
        result.stderr || bufferedStderr,
        result.stdout || bufferedStdout,
      );
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
      "1080p30",
      "1920p30",
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
      outputDirIndex > 0
        ? videoPath.slice(0, outputDirIndex)
        : state.baseVideosDir;

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
      const fontFile = (
        await sandbox!.commands.run(WATERMARK_FONT_COMMAND)
      ).stdout.trim();
      const drawText = `drawtext=fontfile=${fontFile}:text='${watermarkText}':${WATERMARK_STYLE}`;
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
