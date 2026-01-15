import {
  VOICEOVER_SERVICE_IMPORT,
  VOICEOVER_SERVICE_SETTER,
} from "@/prompt";
import {
  HeuristicIssue,
  HeuristicOptions,
  runHeuristicChecks,
} from "./heuristics";

export interface AutoFixResult {
  ok: boolean;
  script: string;
  issues: HeuristicIssue[];
  appliedFixes: string[];
  unfixableReasons: HeuristicIssue[];
}

const REQUIRED_IMPORTS = [
  "from manim import *",
  "from manim_voiceover import VoiceoverScene",
  VOICEOVER_SERVICE_IMPORT,
];

const ALLOWED_FONT_SIZES = [20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 46];

const SCENE_CLASS_NAMES = [
  "MyScene",
  "MainScene",
  "Scene1",
  "MyScene1",
  "IntroScene",
  "VideoScene",
  "AnimationScene",
  "ManimScene",
  "DemoScene",
  "ExampleScene",
  "TutorialScene",
  "LessonScene",
  "EducationScene",
  "ExplainerScene",
];

const VALID_SCENE_BASES = [
  "Scene",
  "VoiceoverScene",
  "MovingCameraScene",
  "ThreeDScene",
  "ZoomedScene",
];

const STRING_LITERAL_PLACEHOLDER = " ";

const replaceWithPlaceholderPreservingNewlines = (value: string): string =>
  value.replace(/[^\n]/g, STRING_LITERAL_PLACEHOLDER);

const stripStringLiterals = (source: string): string =>
  source
    .replace(/'''[\s\S]*?'''/g, replaceWithPlaceholderPreservingNewlines)
    .replace(/"""[\s\S]*?"""/g, replaceWithPlaceholderPreservingNewlines)
    .replace(/"(?:\\.|[^"\\])*"/g, (match) =>
      match.replace(/./g, STRING_LITERAL_PLACEHOLDER)
    )
    .replace(/'(?:\\.|[^'\\])*'/g, (match) =>
      match.replace(/./g, STRING_LITERAL_PLACEHOLDER)
    );

const CODE_LINE_PATTERNS = [
  /^(?:from|import|class|def|with|for|while|if|elif|else|try|except|finally|return|yield|async|await|pass|raise|break|continue|@)/,
  /^(?:FRAME_|SAFE_|config\.)/,
  /^(?:await\s+)?[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*\s*(?:=|\()/,
  /^[\[({]/,
  /^[})\]]+$/,
];

function isLikelyCodeLine(rawLine: string): boolean {
  const line = rawLine.trim();
  if (!line) return false;
  if (line.startsWith("#")) return true;
  if (line === '"""' || line === "'''") return false;
  if (CODE_LINE_PATTERNS.some((pattern) => pattern.test(line))) {
    return true;
  }
  if (/^[A-Za-z_][A-Za-z0-9_]*\s*=/.test(line) && !line.includes("==")) {
    return true;
  }
  if (line.endsWith(":")) {
    return true;
  }
  if (/\w\s*\(/.test(line) && line.includes(")")) {
    return true;
  }
  return false;
}

function extractCodeFromMarkdown(raw: string): {
  code: string;
  appliedFix?: string;
} {
  const pythonFencePattern = /```(?:python|py)?\s*\n?([\s\S]*?)```/gi;
  const matches = [...raw.matchAll(pythonFencePattern)];

  if (matches.length > 0) {
    const bestMatch = matches.find((m) => {
      const content = m[1] ?? "";
      return (
        content.includes("class") ||
        content.includes("def ") ||
        content.includes("from manim")
      );
    });
    const content = bestMatch?.[1] ?? matches[0]?.[1] ?? "";
    return {
      code: content.trim(),
      appliedFix: "extracted code from ```python fences",
    };
  }

  const anyFencePattern = /```\s*\n?([\s\S]*?)```/gi;
  const anyMatches = [...raw.matchAll(anyFencePattern)];
  if (anyMatches.length > 0) {
    const content = anyMatches[0]?.[1] ?? "";
    if (content.includes("class") || content.includes("from manim")) {
      return {
        code: content.trim(),
        appliedFix: "extracted code from ``` fences",
      };
    }
  }

  return { code: raw.trim() };
}

function stripPreamble(raw: string): {
  code: string;
  removedLines: number;
  appliedFix?: string;
} {
  const normalizedLines = raw.replace(/\r/g, "").split("\n");
  const firstCodeLineIndex = normalizedLines.findIndex((line) =>
    isLikelyCodeLine(line)
  );

  if (firstCodeLineIndex <= 0) {
    return { code: raw.trim(), removedLines: 0 };
  }

  const preamble = normalizedLines.slice(0, firstCodeLineIndex).join("\n");
  const preambleLower = preamble.toLowerCase();

  const isPreambleText =
    /(?:here(?:'s| is)|below is|the following|sure|certainly|let me|i'll|okay|of course|here you go)/i.test(
      preambleLower
    ) || /^[^#]*[a-z]{10,}/m.test(preamble);

  if (!isPreambleText) {
    return { code: raw.trim(), removedLines: 0 };
  }

  const code = normalizedLines.slice(firstCodeLineIndex).join("\n").trim();
  return {
    code,
    removedLines: firstCodeLineIndex,
    appliedFix: `removed ${firstCodeLineIndex} preamble lines before first code line`,
  };
}

function stripTrailingProse(raw: string): {
  code: string;
  appliedFix?: string;
} {
  const lines = raw.split("\n");

  let lastCodeLineIndex = lines.length - 1;
  while (lastCodeLineIndex >= 0) {
    const line = lines[lastCodeLineIndex]?.trim() ?? "";
    if (line === "" || line.startsWith("#")) {
      lastCodeLineIndex--;
      continue;
    }
    if (isLikelyCodeLine(lines[lastCodeLineIndex] ?? "")) {
      break;
    }

    if (/^[a-z].*[.!?]$/i.test(line) && line.length > 30) {
      lastCodeLineIndex--;
      continue;
    }
    break;
  }

  if (lastCodeLineIndex < lines.length - 1) {
    const removedCount = lines.length - 1 - lastCodeLineIndex;
    return {
      code: lines.slice(0, lastCodeLineIndex + 1).join("\n").trim(),
      appliedFix: `removed ${removedCount} trailing prose lines after code`,
    };
  }

  return { code: raw };
}

function ensureImports(script: string): { script: string; applied: string[] } {
  const applied: string[] = [];
  const lines = script.split("\n");
  const normalized = script.replace(/\r/g, "");

  const missing = REQUIRED_IMPORTS.filter((imp) => !normalized.includes(imp));
  if (!missing.length) return { script, applied };

  let insertIndex = 0;
  while (
    insertIndex < lines.length &&
    (/^\s*(from|import)\b/.test(lines[insertIndex] ?? "") ||
      /^\s*$/.test(lines[insertIndex] ?? "") ||
      /^\s*#/.test(lines[insertIndex] ?? ""))
  ) {
    insertIndex++;
  }

  if (insertIndex === 0) {
    insertIndex = 0;
  }

  const newLines = [...lines];
  let offset = 0;
  for (const imp of missing) {
    newLines.splice(insertIndex + offset, 0, imp);
    applied.push(`added missing import: ${imp}`);
    offset++;
  }

  return { script: newLines.join("\n"), applied };
}

function findSceneClass(script: string): {
  name: string;
  bases: string;
  fullMatch: string;
  index: number;
} | null {
  const classRegex =
    /class\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*:/g;
  let match: RegExpExecArray | null;
  const candidates: {
    name: string;
    bases: string;
    fullMatch: string;
    index: number;
  }[] = [];

  while ((match = classRegex.exec(script)) !== null) {
    const [fullMatch, name, bases] = match;
    const basesLower = bases?.toLowerCase() ?? "";

    const hasSceneBase = VALID_SCENE_BASES.some((b) =>
      basesLower.includes(b.toLowerCase())
    );

    if (hasSceneBase || SCENE_CLASS_NAMES.includes(name ?? "")) {
      candidates.push({
        name: name ?? "",
        bases: bases ?? "",
        fullMatch: fullMatch ?? "",
        index: match.index,
      });
    }
  }

  if (candidates.length === 0) {
    const simpleClassRegex = /class\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
    while ((match = simpleClassRegex.exec(script)) !== null) {
      const name = match[1] ?? "";
      if (
        SCENE_CLASS_NAMES.includes(name) ||
        name.toLowerCase().includes("scene")
      ) {
        const fullLine = script.slice(
          match.index,
          script.indexOf("\n", match.index)
        );
        const basesMatch = fullLine.match(/\(([^)]*)\)/);
        candidates.push({
          name,
          bases: basesMatch?.[1] ?? "",
          fullMatch: fullLine,
          index: match.index,
        });
      }
    }
  }

  return candidates[0] ?? null;
}

function normalizeSceneClass(script: string): {
  script: string;
  applied: string[];
} {
  const applied: string[] = [];
  let s = script;

  const sceneClass = findSceneClass(s);
  if (!sceneClass) {
    return { script, applied };
  }

  if (sceneClass.name !== "MyScene") {
    const escapedName = sceneClass.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const classDefPattern = new RegExp(
      `class\\s+${escapedName}\\s*\\(`,
      "g"
    );
    s = s.replace(classDefPattern, "class MyScene(");

    const renderPattern = new RegExp(
      `(manim\\s+-[^"']*["\'])${escapedName}(["\'])`,
      "g"
    );
    s = s.replace(renderPattern, "$1MyScene$2");

    applied.push(`renamed scene class "${sceneClass.name}" to "MyScene"`);
  }

  let bases = sceneClass.bases;
  let basesChanged = false;

  if (!/\bVoiceoverScene\b/.test(bases)) {
    if (bases.trim()) {
      bases = `VoiceoverScene, ${bases}`;
    } else {
      bases = "VoiceoverScene";
    }
    basesChanged = true;
    applied.push("added VoiceoverScene to class inheritance");
  }

  if (
    /self\.camera\.frame/.test(s) &&
    !/\bMovingCameraScene\b/.test(bases)
  ) {
    bases = `${bases}, MovingCameraScene`.replace(/^,\s*/, "");
    basesChanged = true;
    applied.push("added MovingCameraScene due to camera.frame usage");
  }

  if (basesChanged) {
    bases = bases
      .replace(/,\s*,/g, ",")
      .replace(/^\s*,\s*/, "")
      .replace(/\s*,\s*$/, "")
      .trim();

    s = s.replace(
      /class\s+MyScene\s*\([^)]*\)\s*:/,
      `class MyScene(${bases}):`
    );
  }

  return { script: s, applied };
}

function ensureConstructAndVoiceover(script: string): {
  script: string;
  applied: string[];
} {
  const applied: string[] = [];
  const lines = script.split("\n");

  const constructPattern = /def\s+construct\s*\(\s*self\s*\)\s*:/;
  const hasConstruct = constructPattern.test(script);
  const hasSetSpeechService = script.includes("set_speech_service");

  if (!hasConstruct) {
    const classIndex = lines.findIndex((l) => /^\s*class\s+MyScene\b/.test(l));
    if (classIndex !== -1) {
      const classLine = lines[classIndex] ?? "";
      const classIndent = classLine.match(/^\s*/)?.[0] ?? "";
      const methodIndent = classIndent + "    ";

      let insertIndex = classIndex + 1;
      while (
        insertIndex < lines.length &&
        /^\s*$/.test(lines[insertIndex] ?? "")
      ) {
        insertIndex++;
      }

      lines.splice(
        insertIndex,
        0,
        `${methodIndent}def construct(self):`,
        `${methodIndent}    ${VOICEOVER_SERVICE_SETTER}`
      );
      applied.push(
        "inserted missing def construct(self) with voiceover service call"
      );
      return { script: lines.join("\n"), applied };
    }
  }

  if (hasConstruct && !hasSetSpeechService) {
    const constructIndex = lines.findIndex((l) => constructPattern.test(l));
    if (constructIndex !== -1) {
      const defLine = lines[constructIndex] ?? "";
      const defIndent = defLine.match(/^\s*/)?.[0] ?? "";
      const bodyIndent = defIndent + "    ";

      let insertIndex = constructIndex + 1;
      while (
        insertIndex < lines.length &&
        /^\s*$/.test(lines[insertIndex] ?? "")
      ) {
        insertIndex++;
      }

      const existingLine = lines[insertIndex] ?? "";
      if (!existingLine.includes("set_speech_service")) {
        lines.splice(insertIndex, 0, `${bodyIndent}${VOICEOVER_SERVICE_SETTER}`);
        applied.push("inserted missing set_speech_service call");
      }
    }
  }

  return { script: lines.join("\n"), applied };
}

function ensureNextToBuff(script: string): {
  script: string;
  applied: string[];
} {
  const applied: string[] = [];
  const pattern =
    /\.next_to\s*\(\s*([^,]+),\s*(UP|DOWN|LEFT|RIGHT|UL|UR|DL|DR|ORIGIN)\s*\)/g;

  let changed = false;
  const s = script.replace(pattern, (match, target, dir) => {
    if (match.includes("buff=") || match.includes("buff =")) {
      return match;
    }
    changed = true;
    return `.next_to(${target.trim()}, ${dir}, buff=0.5)`;
  });

  if (changed) {
    applied.push("added buff=0.5 to .next_to() calls missing buff parameter");
  }
  return { script: s, applied };
}

function clampScale(script: string): { script: string; applied: string[] } {
  const applied: string[] = [];
  const pattern = /\.scale\(\s*([0-9]+(?:\.[0-9]+)?)\s*\)/g;

  let changed = false;
  const s = script.replace(pattern, (full, num) => {
    const v = parseFloat(num);
    if (!Number.isFinite(v) || v <= 1.3) return full;
    changed = true;
    return `.scale(1.3)`;
  });

  if (changed) {
    applied.push("clamped .scale() values > 1.3 down to 1.3");
  }
  return { script: s, applied };
}

function clampScaleToFitWidth(script: string): {
  script: string;
  applied: string[];
} {
  const applied: string[] = [];
  const pattern = /\.scale_to_fit_width\(\s*([0-9]+(?:\.[0-9]+)?)\s*\)/g;

  let changed = false;
  const s = script.replace(pattern, (full, num) => {
    const v = parseFloat(num);
    if (!Number.isFinite(v) || v <= 10.2) return full;
    changed = true;
    return `.scale_to_fit_width(10.2)`;
  });

  if (changed) {
    applied.push("clamped .scale_to_fit_width() values > 10.2 down to 10.2");
  }
  return { script: s, applied };
}

function normalizeFontSizes(script: string): {
  script: string;
  applied: string[];
} {
  const applied: string[] = [];
  const pattern = /font_size\s*=\s*([0-9]+(?:\.[0-9]+)?)/g;

  const s = script.replace(pattern, (full, raw) => {
    const v = parseFloat(raw);
    if (!Number.isFinite(v)) return full;

    const inRange = ALLOWED_FONT_SIZES.some(
      (allowed) => Math.abs(v - allowed) < 0.01
    );
    if (inRange) return full;

    const nearest = ALLOWED_FONT_SIZES.reduce((best, current) =>
      Math.abs(current - v) < Math.abs(best - v) ? current : best
    );

    applied.push(`normalized font_size=${raw} to allowed value ${nearest}`);
    return `font_size=${nearest}`;
  });

  return { script: s, applied };
}

function tryFixBracketBalance(script: string): {
  script: string;
  applied: string[];
} {
  const applied: string[] = [];
  const stripped = stripStringLiterals(script);

  const count = (str: string, ch: string) =>
    [...str].filter((c) => c === ch).length;

  const missingParens = count(stripped, "(") - count(stripped, ")");
  const missingBrackets = count(stripped, "[") - count(stripped, "]");

  const lines = script.split("\n");

  if (missingParens > 0 && missingParens <= 3) {
    for (let i = 0; i < missingParens; i++) {
      lines.push(")");
    }
    applied.push(`added ${missingParens} closing ')' to fix unbalanced parentheses`);
  }

  if (missingBrackets > 0 && missingBrackets <= 3) {
    for (let i = 0; i < missingBrackets; i++) {
      lines.push("]");
    }
    applied.push(`added ${missingBrackets} closing ']' to fix unbalanced brackets`);
  }

  return { script: lines.join("\n"), applied };
}

function fixMathTexRawStrings(script: string): {
  script: string;
  applied: string[];
} {
  const applied: string[] = [];

  const pattern = /\bMathTex\s*\(\s*"([^"]+)"/g;
  let changed = false;

  const s = script.replace(pattern, (full, content) => {
    if (content.includes("\\")) {
      changed = true;
      return `MathTex(r"${content}"`;
    }
    return full;
  });

  if (changed) {
    applied.push('converted MathTex string literals to raw strings (r"...")');
  }

  return { script: s, applied };
}

function fixDoubleBackslashInRaw(script: string): {
  script: string;
  applied: string[];
} {
  const applied: string[] = [];

  const pattern = /r(["'])([^"']*)\1/g;
  let changed = false;

  const s = script.replace(pattern, (full, quote, content) => {
    if (content.includes("\\\\")) {
      const fixed = content.replace(/\\\\/g, "\\");
      changed = true;
      return `r${quote}${fixed}${quote}`;
    }
    return full;
  });

  if (changed) {
    applied.push("fixed double backslashes in raw strings (r\"\\\\\" → r\"\\\")");
  }

  return { script: s, applied };
}

function removeColorFromMathTex(script: string): {
  script: string;
  applied: string[];
} {
  const applied: string[] = [];

  const pattern = /\\color\{[^}]+\}/g;
  if (pattern.test(script)) {
    const s = script.replace(pattern, "");
    applied.push("removed \\color{} commands from LaTeX (use color= parameter instead)");
    return { script: s, applied };
  }

  return { script, applied };
}

function detectTruncation(script: string): boolean {
  const lines = script.split("\n");
  const lastNonEmptyLine = [...lines]
    .reverse()
    .find((l) => l.trim().length > 0);

  if (!lastNonEmptyLine) return true;

  const trimmed = lastNonEmptyLine.trim();

  if (trimmed.endsWith("\\")) return true;
  if (trimmed.endsWith(",") && !trimmed.endsWith("),")) return true;

  const stripped = stripStringLiterals(script);
  const openParens = (stripped.match(/\(/g) || []).length;
  const closeParens = (stripped.match(/\)/g) || []).length;
  const openBrackets = (stripped.match(/\[/g) || []).length;
  const closeBrackets = (stripped.match(/]/g) || []).length;

  if (openParens - closeParens > 3) return true;
  if (openBrackets - closeBrackets > 3) return true;

  const hasWithVoiceover = /with\s+self\.voiceover\s*\([^)]*\)\s*(?:as\s+\w+\s*)?:\s*$/.test(
    script
  );
  if (hasWithVoiceover) {
    const voiceoverMatch = script.match(
      /with\s+self\.voiceover\s*\([^)]*\)\s*(?:as\s+\w+\s*)?:/g
    );
    if (voiceoverMatch) {
      const lastVoiceover = voiceoverMatch[voiceoverMatch.length - 1];
      const lastVoiceoverIndex = script.lastIndexOf(lastVoiceover ?? "");
      const afterVoiceover = script.slice(
        lastVoiceoverIndex + (lastVoiceover?.length ?? 0)
      );
      const nonEmptyAfter = afterVoiceover
        .split("\n")
        .filter((l) => l.trim() && !l.trim().startsWith("#"));
      if (nonEmptyAfter.length === 0) return true;
    }
  }

  return false;
}

export function autoFixManimScript(
  rawScript: string,
  options: HeuristicOptions = {}
): AutoFixResult {
  const appliedFixes: string[] = [];
  let script = rawScript;

  const { code: codeFromMarkdown, appliedFix: markdownFix } =
    extractCodeFromMarkdown(script);
  if (markdownFix) {
    appliedFixes.push(markdownFix);
    script = codeFromMarkdown;
  }

  const { code: codeNoPreamble, appliedFix: preambleFix } =
    stripPreamble(script);
  if (preambleFix) {
    appliedFixes.push(preambleFix);
    script = codeNoPreamble;
  }

  const { code: codeNoTrailing, appliedFix: trailingFix } =
    stripTrailingProse(script);
  if (trailingFix) {
    appliedFixes.push(trailingFix);
    script = codeNoTrailing;
  }

  if (detectTruncation(script)) {
    const { script: bracketFixed, applied: bracketFixes } =
      tryFixBracketBalance(script);
    appliedFixes.push(...bracketFixes);
    script = bracketFixed;

    if (detectTruncation(script)) {
      const truncationResult = runHeuristicChecks(script, options);
      return {
        ok: false,
        script,
        issues: [
          {
            message:
              "❌ Script appears truncated or has severely unbalanced brackets. Cannot auto-fix.",
            severity: "critical",
          },
          ...truncationResult.issues,
        ],
        appliedFixes,
        unfixableReasons: [
          {
            message:
              "Script appears truncated - missing closing brackets or incomplete blocks",
            severity: "critical",
          },
        ],
      };
    }
  }

  {
    const { script: fixed, applied } = ensureImports(script);
    appliedFixes.push(...applied);
    script = fixed;
  }

  {
    const { script: fixed, applied } = normalizeSceneClass(script);
    appliedFixes.push(...applied);
    script = fixed;
  }

  {
    const { script: fixed, applied } = ensureConstructAndVoiceover(script);
    appliedFixes.push(...applied);
    script = fixed;
  }

  {
    const { script: fixed, applied } = fixMathTexRawStrings(script);
    appliedFixes.push(...applied);
    script = fixed;
  }

  {
    const { script: fixed, applied } = fixDoubleBackslashInRaw(script);
    appliedFixes.push(...applied);
    script = fixed;
  }

  {
    const { script: fixed, applied } = removeColorFromMathTex(script);
    appliedFixes.push(...applied);
    script = fixed;
  }

  {
    const { script: fixed, applied } = ensureNextToBuff(script);
    appliedFixes.push(...applied);
    script = fixed;
  }

  {
    const { script: fixed, applied } = clampScale(script);
    appliedFixes.push(...applied);
    script = fixed;
  }

  {
    const { script: fixed, applied } = clampScaleToFitWidth(script);
    appliedFixes.push(...applied);
    script = fixed;
  }

  {
    const { script: fixed, applied } = normalizeFontSizes(script);
    appliedFixes.push(...applied);
    script = fixed;
  }

  {
    const { script: fixed, applied } = tryFixBracketBalance(script);
    appliedFixes.push(...applied);
    script = fixed;
  }

  const validation = runHeuristicChecks(script, options);

  const unfixableReasons = validation.issues.filter(
    (i) => i.severity === "critical" || i.severity === "noncode"
  );

  const ok = validation.ok || unfixableReasons.length === 0;

  return {
    ok,
    script,
    issues: validation.issues,
    appliedFixes,
    unfixableReasons,
  };
}
