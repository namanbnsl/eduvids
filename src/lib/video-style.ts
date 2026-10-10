import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  choosePalette,
  loadThumbnailAssets,
  type ThumbnailPalette,
} from "./youtube-thumbnail";

/**
 * Videos share their thumbnail's look: `thumbnail/video_style.py` sets the
 * canvas, Inter Tight text, matching math fonts and the per-video palette.
 * It is installed into the render sandbox as the `eduvids_style` module and
 * star-imported by every generated script.
 */

export const VIDEO_STYLE_MARKER = "# __EDUVIDS_HOUSE_STYLE__";
export const VIDEO_BACKGROUND = "#0E0F11";
const PALETTE_PLACEHOLDER = "__EDUVIDS_PALETTE__";
const WATERMARK_PLACEHOLDER = "__EDUVIDS_WATERMARK__";
/** Render driver (prefetch + parallel scenes), run as the sandbox render job. */
export const RENDER_DRIVER_PATH = "/home/user/eduvids_render.py";

/** The video palette is the thumbnail palette, keyed by the same seed. */
export function videoPalette(seed: string): ThumbnailPalette {
  return choosePalette(seed);
}

/**
 * Import the house style after the script's own imports, so its Text, MathTex
 * and colour names win over Manim's, and pin the canvas colour.
 */
export function applyVideoStyle(script: string): string {
  let result = script.replace(
    /^config\.background_color\s*=\s*[^\n]+$/gm,
    `config.background_color = "${VIDEO_BACKGROUND}"`,
  );
  if (result.includes(VIDEO_STYLE_MARKER)) return result;

  const lines = result.split("\n");
  let lastImport = -1;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? "";
    if (/^(class|def|async\s+def)\s/.test(line)) break;
    if (/^(from\s+\S+\s+import\s|import\s)/.test(line)) {
      lastImport = index;
      // Parenthesised imports continue until the closing bracket.
      if (line.includes("(") && !line.includes(")")) {
        while (index + 1 < lines.length && !lines[index]!.includes(")")) {
          index++;
        }
        lastImport = index;
      }
    }
  }
  lines.splice(
    lastImport + 1,
    0,
    VIDEO_STYLE_MARKER,
    "from eduvids_style import *",
  );
  // Models sometimes redefine house names (PRIMARY = BLUE, def header(...)).
  // Import again right before the first scene so the house versions win,
  // while module code above can still build on them (HIGHLIGHT = ACCENT).
  const firstClass = lines.findIndex(
    (line, index) => index > lastImport + 2 && /^class\s/.test(line),
  );
  const redefines = lines
    .slice(lastImport + 3, firstClass === -1 ? undefined : firstClass)
    .some((line) => /^\S/.test(line) && !/^(from|import|#)/.test(line));
  if (firstClass !== -1 && redefines) {
    lines.splice(
      firstClass,
      0,
      "from eduvids_style import *  # house names win over redefinitions",
      "",
    );
  }
  result = lines.join("\n");
  return result;
}

export interface VideoStyleAssets {
  module: string;
  driver: string;
  fonts: { name: string; data: Uint8Array }[];
}

let sourcesPromise: Promise<[string, string]> | undefined;

/**
 * The style module for one palette (with the watermark drawn into frames when
 * requested), the render driver, and the fonts they load.
 */
export async function loadVideoStyleAssets(
  palette: ThumbnailPalette,
  { watermark = false }: { watermark?: boolean } = {},
): Promise<VideoStyleAssets> {
  const dir = join(process.cwd(), "src/lib/thumbnail");
  sourcesPromise ??= Promise.all([
    readFile(join(dir, "video_style.py"), "utf8"),
    readFile(join(dir, "render_driver.py"), "utf8"),
  ]).catch((error) => {
    sourcesPromise = undefined;
    throw error;
  });
  const [[source, driver], { fonts }] = await Promise.all([
    sourcesPromise,
    loadThumbnailAssets(),
  ]);
  return {
    module: source
      .replace(PALETTE_PLACEHOLDER, palette)
      .replace(WATERMARK_PLACEHOLDER, watermark ? "eduvids" : ""),
    driver,
    fonts,
  };
}

const WATERMARK_FALLBACK_FONT =
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";

/** Prints the installed house font for ffmpeg, or DejaVu if it is missing. */
export const WATERMARK_FONT_COMMAND = `python -c "import os, site; p = os.path.join(site.getusersitepackages(), 'eduvids-fonts', 'InterTight-Medium.ttf'); print(p if os.path.exists(p) else '${WATERMARK_FALLBACK_FONT}')"`;

/** Quiet ink wordmark, inset from the corner like the thumbnails' margins. */
export const WATERMARK_STYLE =
  "fontcolor=0xEDEAE4@0.55:fontsize=22:x=w-tw-28:y=h-th-24";

/** Python lines that set `watermark_font` inside a sandbox script. */
export const WATERMARK_FONT_PYTHON = `import os, site
watermark_font = os.path.join(site.getusersitepackages(), 'eduvids-fonts', 'InterTight-Medium.ttf')
if not os.path.exists(watermark_font):
    watermark_font = '${WATERMARK_FALLBACK_FONT}'`;
