import { VOICEOVER_SERVICE_IMPORT, VOICEOVER_SERVICE_SETTER } from "@/prompt";

export type HeuristicSeverity = "critical" | "noncode" | "fixable";

export type HeuristicIssue = {
  message: string;
  severity: HeuristicSeverity;
};

export type HeuristicResult = {
  ok: boolean;
  autoFixable: boolean;
  issues: HeuristicIssue[];
  error?: string;
};

export type HeuristicOptions = {
  allowVerificationFixes?: boolean;
};

const REQUIRED_IMPORTS = [
  "from manim import",
  "from manim_voiceover import VoiceoverScene",
  VOICEOVER_SERVICE_IMPORT,
];

const PROSE_PHRASES = [
  "here is",
  "here's",
  "sure",
  "certainly",
  "explanation",
  "an analysis",
  "analysis of",
  "let's",
  "in this video",
  "we will",
  "i will",
  "first,",
  "second,",
  "finally",
  "overall",
];

const MARKDOWN_LIKE_PATTERNS = [/```/, /\[[^\]]+\]\([^\)]+\)/];

const CODE_LINE_PATTERNS = [
  /^(?:from|import|class|def|with|for|while|if|elif|else|try|except|finally|return|yield|async|await|pass|raise|break|continue|@)/,
  /^(?:FRAME_|SAFE_|config\.)/,
  /^(?:await\s+)?[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*\s*(?:=|\()/,
  /^[\[({]/,
  /^[})\]]+$/,
];

const STRING_LITERAL_PLACEHOLDER = " ";

const replaceWithPlaceholderPreservingNewlines = (value: string): string =>
  value.replace(/[^\n]/g, STRING_LITERAL_PLACEHOLDER);

const BUILTIN_SHADOWING_PATTERNS = [
  /\bstr\s*=\s*["']/i,
  /\blist\s*=\s*\[/i,
  /\bdict\s*=\s*\{/i,
  /\bint\s*=\s*\d/i,
  /\bfloat\s*=\s*\d/i,
  /\b(float|int)\s*=\s*[\w.]+/i,
  /\blen\s*=\s*/i,
  /\bmax\s*=\s*/i,
  /\bmin\s*=\s*/i,
];

const STRING_CALL_PATTERN = /(?<![A-Za-z0-9_])(['"][^'"]+['"])\s*\(/;

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

const formatIssueList = (issues: HeuristicIssue[]): string =>
  issues.map((issue, index) => `${index + 1}. ${issue.message}`).join("\n");

export function validateRequiredElements(script: string): {
  ok: boolean;
  error?: string;
} {
  const normalized = script.trim().replace(/\r/g, "");
  const issues: string[] = [];

  for (const requiredImport of REQUIRED_IMPORTS) {
    if (!normalized.includes(requiredImport)) {
      issues.push(`Missing required import: ${requiredImport}`);
    }
  }

  if (!normalized.includes("class MyScene")) {
    issues.push("Missing class MyScene definition");
  }

  if (!normalized.includes("def construct(self)")) {
    issues.push("Missing def construct(self) method");
  }

  if (!normalized.includes("set_speech_service")) {
    issues.push(`Missing ${VOICEOVER_SERVICE_SETTER} call`);
  }

  if (issues.length > 0) {
    return {
      ok: false,
      error: `Script validation failed - missing required elements:\n${issues
        .map((issue, idx) => `${idx + 1}. ${issue}`)
        .join("\n")}`,
    };
  }

  return { ok: true };
}

export function runHeuristicChecks(
  script: string,
  options: HeuristicOptions = {}
): HeuristicResult {
  const allowVerificationFixes = options.allowVerificationFixes ?? false;
  const issues: HeuristicIssue[] = [];
  const trimmed = script.trim();

  if (!trimmed) {
    issues.push({
      message: "❌ Script is empty after trimming.",
      severity: "critical",
    });
  }

  const normalized = trimmed.replace(/\r/g, "");
  const stripped = stripStringLiterals(normalized);
  const normalizedLines = normalized.split(/\n/);
  const strippedLines = stripped.split(/\n/);

  const isLikelyCodeLine = (rawLine: string): boolean => {
    const line = rawLine.trim();
    if (!line) return false;
    if (line.startsWith("#")) return false;
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
  };

  const firstCodeLineIndex = normalizedLines.findIndex((line) =>
    isLikelyCodeLine(line)
  );

  const preambleEndIndex =
    firstCodeLineIndex === -1 ? normalizedLines.length : firstCodeLineIndex;
  if (preambleEndIndex > 0) {
    const preambleOriginal = normalizedLines
      .slice(0, preambleEndIndex)
      .join("\n");
    const preambleStripped = strippedLines
      .slice(0, preambleEndIndex)
      .join("\n")
      .toLowerCase();

    for (const pattern of MARKDOWN_LIKE_PATTERNS) {
      if (pattern.test(preambleOriginal)) {
        issues.push({
          message:
            "❌ Detected Markdown or formatting artifacts before the first code line. Provide code only.",
          severity: "noncode",
        });
        break;
      }
    }

    for (const phrase of PROSE_PHRASES) {
      if (preambleStripped.includes(phrase)) {
        issues.push({
          message: `❌ Narrative/explanatory text detected before the first code line (contains "${phrase}"). Provide only executable Manim code.`,
          severity: "noncode",
        });
        break;
      }
    }

    const preambleLines = normalizedLines.slice(0, preambleEndIndex);
    for (let index = 0; index < preambleLines.length; index++) {
      const rawLine = preambleLines[index] ?? "";
      const line = rawLine.trim();
      if (!line) continue;
      if (line.startsWith("#")) continue;
      if (line === '"""' || line === "'''") continue;

      const strippedLine = strippedLines[index]?.trim() ?? "";
      const hasCodeSymbols = /[(){}\[\]=:+\-*/.,]/.test(line);
      const wordCount = strippedLine
        ? strippedLine.split(/\s+/).filter(Boolean).length
        : 0;

      if (wordCount >= 4 && !hasCodeSymbols) {
        issues.push({
          message: `❌ Non-code narrative detected before the first code line (line ${
            index + 1
          }): "${line.slice(0, 80)}"`,
          severity: "noncode",
        });
        break;
      }
    }
  }

  if (normalized.includes("VoiceoverScene")) {
    const referencesCameraFrame = normalized.includes("self.camera.frame");
    const assignsCameraFrame = /frame\s*=\s*self\.camera\.frame/.test(
      normalized
    );
    const usesMovingCamera = normalized.includes("MovingCameraScene");

    if (referencesCameraFrame && !usesMovingCamera) {
      issues.push({
        message:
          "❌ VoiceoverScene does not have camera.frame. Remove camera.frame references or inherit from MovingCameraScene.",
        severity: "fixable",
      });
    }

    if (assignsCameraFrame && !usesMovingCamera) {
      issues.push({
        message:
          "❌ Cannot assign frame = self.camera.frame in VoiceoverScene. Use FRAME_WIDTH/FRAME_HEIGHT constants instead.",
        severity: "fixable",
      });
    }
  }

  for (const requiredImport of REQUIRED_IMPORTS) {
    if (!normalized.includes(requiredImport)) {
      issues.push({
        message: `❌ Missing required import: ${requiredImport}`,
        severity: "fixable",
      });
    }
  }

  if (!normalized.includes("from manim import")) {
    issues.push({
      message: "❌ Missing: from manim import * (or specific imports)",
      severity: "fixable",
    });
  }

  if (!normalized.includes("class MyScene")) {
    issues.push({
      message: "❌ Missing: class MyScene definition.",
      severity: "fixable",
    });
  }

  if (!normalized.includes("def construct(self)")) {
    issues.push({
      message: "❌ Missing: def construct(self) method.",
      severity: "fixable",
    });
  }

  if (
    normalized.includes("VoiceoverScene") &&
    !normalized.includes("set_speech_service")
  ) {
    issues.push({
      message: `❌ VoiceoverScene requires ${VOICEOVER_SERVICE_SETTER}.`,
      severity: "fixable",
    });
  }

  for (const pattern of BUILTIN_SHADOWING_PATTERNS) {
    if (pattern.test(normalized)) {
      const match = normalized.match(pattern);
      issues.push({
        message: `❌ Shadowing built-in name detected: ${match?.[0]}. Use a different variable name to avoid "'str' object is not callable" errors.`,
        severity: "fixable",
      });
      break;
    }
  }

  if (STRING_CALL_PATTERN.test(normalized)) {
    issues.push({
      message:
        "❌ Potential error: calling a string literal like a function (e.g., 'text'()). Use Text('text') instead.",
      severity: "fixable",
    });
  }

  const PROBLEMATIC_MATHTEX_PATTERNS = [
    /MathTex\([^)]*\\frac\{[^}]+\}\{[^}]+\}\s*[+\-*/]\s*\\frac\{[^}]+\}\{[^}]+\}/,
    /MathTex\([^)]*(?:\\frac\{[^}]+\}\{[^}]+\}\s*[+\-*/]\s*){3,}/,
    /MathTex\([^)]*\^\{[^}]+\}\s*[+\-*/]/,
  ];

  for (const pattern of PROBLEMATIC_MATHTEX_PATTERNS) {
    if (pattern.test(normalized)) {
      issues.push({
        message:
          "❌ MathTex with problematic LaTeX pattern detected. Long chains of fractions or complex nested structures can split into invalid LaTeX fragments during animation. Use summation notation (\\sum), break into multiple MathTex objects, or explicitly isolate substrings.",
        severity: "fixable",
      });
      break;
    }
  }

  const LATEX_STRING_PATTERN = /r?["']([^"']*)["']/g;
  let latexMatch: RegExpExecArray | null;
  while ((latexMatch = LATEX_STRING_PATTERN.exec(normalized)) !== null) {
    const content = latexMatch[1];
    if (content?.includes("\\")) {
      let balance = 0;
      for (const char of content) {
        if (char === "{") balance++;
        else if (char === "}") balance--;
      }
      if (balance !== 0) {
        issues.push({
          message: `❌ Unbalanced braces detected in LaTeX string: "${content.slice(
            0,
            50
          )}...". Check your { and } usage.`,
          severity: "fixable",
        });
        break;
      }
    }
  }

  if (/MathTex\s*\(\s*r?["'][^"']*\\color\{/.test(normalized)) {
    issues.push({
      message:
        "❌ Invalid use of \\color{} inside MathTex. Use the `color` keyword argument or `tex_to_color_map` instead.",
      severity: "fixable",
    });
  }

  if (/r["'][^"']*\\\\/.test(normalized)) {
    issues.push({
      message:
        '❌ Double backslashes detected in raw string (r"..."). In raw strings, use single backslashes for LaTeX commands (e.g., r"\\frac" not r"\\\\frac").',
      severity: "fixable",
    });
  }

  const HALLUCINATED_PROPS = [
    "text_align",
    "set_style",
    "set_font_size",
    "set_text_color",
  ];
  for (const prop of HALLUCINATED_PROPS) {
    if (normalized.includes(`.${prop}(`)) {
      issues.push({
        message: `❌ Hallucinated property detected: .${prop}(). This method does not exist in Manim. Check the documentation or use standard methods like .set_color(), .scale(), etc.`,
        severity: "fixable",
      });
    }
  }

  const POSITION_CONFLICT_PATTERNS = [
    /\.move_to\s*\(\s*ORIGIN\s*\)[\s\S]{10,300}\.move_to\s*\(\s*ORIGIN\s*\)/,
    /\.move_to\s*\(\s*get_content_center\s*\(\s*\)\s*\)[\s\S]{10,300}\.move_to\s*\(\s*get_content_center\s*\(\s*\)\s*\)/,
    /\.move_to\s*\(\s*\[?\s*0\s*,\s*0[\s\S]{10,300}\.move_to\s*\(\s*\[?\s*0\s*,\s*0/,
  ];

  for (const pattern of POSITION_CONFLICT_PATTERNS) {
    if (pattern.test(normalized)) {
      issues.push({
        message:
          "❌ Position conflict detected: Multiple objects placed at the same position (ORIGIN or get_content_center()). Use .next_to() or different positions to prevent overlap.",
        severity: "fixable",
      });
      break;
    }
  }

  const FADEOUT_CHECK =
    /self\.play\s*\(\s*(?:FadeIn|Create|Write)\s*\([^)]+\)[\s\S]{0,50}\)\s*[\s\S]{50,500}self\.play\s*\(\s*(?:FadeIn|Create|Write)\s*\([^)]+\)/;
  if (FADEOUT_CHECK.test(normalized)) {
    const fadeOutCount = (normalized.match(/FadeOut\s*\(/g) || []).length;
    const contentAddCount = (
      normalized.match(/(?:FadeIn|Create|Write)\s*\(/g) || []
    ).length;

    if (contentAddCount > fadeOutCount + 2) {
      issues.push({
        message:
          "❌ Potential overlap: Multiple FadeIn/Create/Write animations without corresponding FadeOut. Call self.play(FadeOut(old_content)) before adding new content to prevent overlap.",
        severity: "fixable",
      });
    }
  }

  const BULLET_LIST_PATTERNS = [
    /create_bullet_list\s*\(\s*\[\s*(?:[^[\]]*,){4,}/,
    /create_bullet_list_mixed\s*\(\s*\[\s*(?:[^[\]]*,){4,}/,
    /BulletedList\s*\(\s*(?:[^)]*,){4,}/,
  ];

  for (const pattern of BULLET_LIST_PATTERNS) {
    if (pattern.test(normalized)) {
      issues.push({
        message:
          "❌ Too many bullet points detected (more than 4). Limit to 3 bullet points per scene and use multiple scenes for more content. This prevents overcrowding.",
        severity: "fixable",
      });
      break;
    }
  }

  const LONG_TEXT_PATTERN =
    /(?:Text|create_label|create_title)\s*\(\s*['"]([\s\S]{60,}?)['"]/g;
  let longTextMatch: RegExpExecArray | null;
  while ((longTextMatch = LONG_TEXT_PATTERN.exec(normalized)) !== null) {
    const textContent = longTextMatch[1];
    if (
      textContent &&
      textContent.length > 50 &&
      !textContent.includes("\\n")
    ) {
      issues.push({
        message: `❌ Very long text string detected (${textContent.length} chars) without line breaks. Text over 40 characters should include line breaks or use auto_break_long_text() to prevent overflow.`,
        severity: "fixable",
      });
      break;
    }
  }

  const MISSING_BUFF_PATTERN =
    /\.next_to\s*\(\s*[^,]+,\s*(?:UP|DOWN|LEFT|RIGHT|UL|UR|DL|DR)\s*\)/;
  if (MISSING_BUFF_PATTERN.test(normalized)) {
    issues.push({
      message:
        "❌ Missing buff parameter in .next_to() call. Always use .next_to(target, DIR, buff=0.5) to ensure proper spacing and prevent overlap.",
      severity: "fixable",
    });
  }

  const checkBracketBalance = (
    str: string,
    open: string,
    close: string
  ): boolean => {
    let count = 0;
    for (const char of str) {
      if (char === open) count++;
      if (char === close) count--;
      if (count < 0) return false;
    }
    return count === 0;
  };

  if (!checkBracketBalance(stripped, "(", ")")) {
    issues.push({
      message:
        "❌ Unbalanced parentheses detected. Check that all ( have matching ).",
      severity: "fixable",
    });
  }

  if (!checkBracketBalance(stripped, "[", "]")) {
    issues.push({
      message:
        "❌ Unbalanced square brackets detected. Check that all [ have matching ].",
      severity: "fixable",
    });
  }

  const playCount = (normalized.match(/self\.play\s*\(/g) || []).length;
  if (playCount === 0 && normalized.includes("def construct")) {
    issues.push({
      message:
        "❌ No animations detected (no self.play() calls). Manim videos require animations. Use self.play(Write(...)), self.play(Create(...)), or self.play(FadeIn(...)).",
      severity: "fixable",
    });
  }

  const FONT_SIZE_PATTERN = /font_size\s*=\s*([0-9]+(?:\.[0-9]+)?)/g;
  const ALLOWED_FONT_SIZES = [20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 46];
  const TEXT_CONSTRUCTOR_PATTERN =
    /\b(Text|MathTex|Tex|TexText|MarkupText|Paragraph)\s*\(/g;
  const missingFontSizeConstructors = new Set<string>();

  const scanConstructorsForFontSize = () => {
    TEXT_CONSTRUCTOR_PATTERN.lastIndex = 0;
    let constructorMatch: RegExpExecArray | null;
    while (
      (constructorMatch = TEXT_CONSTRUCTOR_PATTERN.exec(normalized)) !== null
    ) {
      const constructorName = constructorMatch[1] ?? "Text";
      let cursor = TEXT_CONSTRUCTOR_PATTERN.lastIndex;
      let depth = 1;
      let inString: string | null = null;
      let escaped = false;
      let hasFontSize = false;

      for (; cursor < normalized.length; cursor++) {
        const char = normalized[cursor];

        if (inString) {
          if (escaped) {
            escaped = false;
            continue;
          }
          if (char === "\\") {
            escaped = true;
            continue;
          }
          if (char === inString) {
            inString = null;
          }
          continue;
        }

        if (char === "'" || char === '"') {
          inString = char;
          continue;
        }

        if (char === "(") {
          depth += 1;
          continue;
        }

        if (char === ")") {
          depth -= 1;
          if (depth === 0) {
            cursor += 1;
            break;
          }
          continue;
        }

        if (
          depth === 1 &&
          normalized.slice(cursor, cursor + 9).startsWith("font_size")
        ) {
          hasFontSize = true;
        }
      }

      if (!hasFontSize) {
        missingFontSizeConstructors.add(constructorName);
      }

      TEXT_CONSTRUCTOR_PATTERN.lastIndex = cursor;
    }
  };

  scanConstructorsForFontSize();
  let fontSizeMatch: RegExpExecArray | null;
  while ((fontSizeMatch = FONT_SIZE_PATTERN.exec(normalized)) !== null) {
    const rawValue = fontSizeMatch[1];
    const numericValue = Number.parseFloat(rawValue ?? "0");
    if (!Number.isFinite(numericValue)) {
      continue;
    }
    const usesAllowedFont = ALLOWED_FONT_SIZES.some(
      (allowed) => Math.abs(numericValue - allowed) < 0.01
    );
    if (!usesAllowedFont) {
      issues.push({
        message: `❌ Non-standard font_size=${rawValue} detected. Use only ${ALLOWED_FONT_SIZES.join(
          ", "
        )} to keep typography compact and within the safe zone.`,
        severity: "fixable",
      });
      break;
    }
  }

  if (missingFontSizeConstructors.size > 0) {
    issues.push({
      message: `❌ Missing font_size on ${Array.from(
        missingFontSizeConstructors
      ).join(", ")}. Set font_size to one of ${ALLOWED_FONT_SIZES.join(
        ", "
      )} so text stays within the reduced typography scale.`,
      severity: "fixable",
    });
  }

  const SCALE_PATTERN = /\.scale\(\s*([0-9]+(?:\.[0-9]+)?)\s*(?:[,)]|$)/g;
  let scaleMatch: RegExpExecArray | null;
  while ((scaleMatch = SCALE_PATTERN.exec(normalized)) !== null) {
    const rawValue = scaleMatch[1];
    const numericValue = Number.parseFloat(rawValue ?? "0");
    if (!Number.isFinite(numericValue)) {
      continue;
    }
    if (numericValue > 1.3) {
      issues.push({
        message: `❌ Detected scale(${rawValue}) which enlarges objects beyond the safe typography range. Split content or adjust layout instead of scaling above 1.3x.`,
        severity: "fixable",
      });
      break;
    }
  }

  const SCALE_TO_FIT_WIDTH_PATTERN =
    /\.scale_to_fit_width\(\s*([0-9]+(?:\.[0-9]+)?)\s*(?:[,)]|$)/g;
  let scaleToFitMatch: RegExpExecArray | null;
  while (
    (scaleToFitMatch = SCALE_TO_FIT_WIDTH_PATTERN.exec(normalized)) !== null
  ) {
    const rawValue = scaleToFitMatch[1];
    const numericValue = Number.parseFloat(rawValue ?? "0");
    if (!Number.isFinite(numericValue)) {
      continue;
    }
    if (numericValue > 10.2) {
      issues.push({
        message: `❌ scale_to_fit_width(${rawValue}) exceeds the 10-unit safe width. Keep text groups within the frame and use the approved font sizes instead.`,
        severity: "fixable",
      });
      break;
    }
  }

  const relevantIssues = allowVerificationFixes
    ? issues.filter((issue) => issue.severity !== "fixable")
    : issues;

  const autoFixable =
    relevantIssues.length > 0 &&
    relevantIssues.every((issue) => issue.severity === "fixable");

  if (relevantIssues.length === 0) {
    return { ok: true, autoFixable: false, issues: [] };
  }

  return {
    ok: false,
    autoFixable,
    issues: relevantIssues,
    error: `Heuristic validation failed:\n${formatIssueList(relevantIssues)}`,
  };
}
