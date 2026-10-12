// =============================================================================
// eduvids house style
// =============================================================================
// One dark, minimal look shared by every rendered video, end card, and
// thumbnail. A flat near-black ground (thumbnails add a soft spotlight), warm
// off-white ink, muted warm axes, and a small set of clear accents. Words and equations share Computer Modern (CMU Serif), the type
// used by 3Blue1Brown and Welch Labs.

export const HOUSE_STYLE = {
  font: "CMU Serif",
  // Video stays flat, like 3Blue1Brown and Welch Labs: a soft spotlight bands
  // into visible rings after 8-bit encoding unless dithered, and dithering
  // costs ~75% more bitrate that YouTube's re-encode throws away.
  background: "#0A0A0A",
  // Thumbnails are static stills, so they get a dithered pool of light that
  // also separates them from YouTube's #0F0F0F dark-mode page.
  thumbnailLight: "#2A2621",
  ink: "#ECE7DD",
  muted: "#8F877B",
  faint: "#3A3631",
  blue: "#58C4DD",
  yellow: "#F7D35C",
  red: "#FC6255",
  green: "#83C167",
  pink: "#E65A8D",
  purple: "#B189C6",
  teal: "#5CD0B3",
  orange: "#F0A35E",
} as const;

export const HOUSE_STYLE_MARKER = "# __house_style__";

const hueShades = (names: string[], hex: string) =>
  names
    .map((name) => {
      if (name.endsWith("_A")) return `${name} = _house_shade("${hex}", 0.38)`;
      if (name.endsWith("_B")) return `${name} = _house_shade("${hex}", 0.18)`;
      if (name.endsWith("_D")) return `${name} = _house_shade("${hex}", -0.22)`;
      if (name.endsWith("_E")) return `${name} = _house_shade("${hex}", -0.45)`;
      return `${name} = ManimColor("${hex}")`;
    })
    .join("\n");

const family = (base: string) => [
  base,
  `${base}_A`,
  `${base}_B`,
  `${base}_C`,
  `${base}_D`,
  `${base}_E`,
];

/**
 * Module-level Python injected into every generated scene script. It remaps
 * Manim's named colors onto the house palette, so `BLUE`, `YELLOW_C`, `WHITE`
 * and friends stay on-brand even when the model reaches for defaults. It also
 * sets typography and axis defaults.
 */
export const MANIM_HOUSE_STYLE_PREAMBLE = `${HOUSE_STYLE_MARKER}
from manim import Text as _HouseText, MathTex as _HouseMathTex, Tex as _HouseTex, NumberLine as _HouseNumberLine

config.background_color = "${HOUSE_STYLE.background}"


def _house_shade(hex_color, amount):
    base = ManimColor(hex_color)
    target = ManimColor("#FFFFFF") if amount > 0 else ManimColor("${HOUSE_STYLE.background}")
    return interpolate_color(base, target, abs(amount))


INK = ManimColor("${HOUSE_STYLE.ink}")
MUTED = ManimColor("${HOUSE_STYLE.muted}")
FAINT = ManimColor("${HOUSE_STYLE.faint}")
BG = ManimColor("${HOUSE_STYLE.background}")
WHITE = INK
GRAY = GREY = LIGHT_GRAY = LIGHT_GREY = GRAY_A = GREY_A = GRAY_B = GREY_B = MUTED
DARK_GRAY = DARK_GREY = DARKER_GRAY = DARKER_GREY = GRAY_D = GREY_D = GRAY_E = GREY_E = FAINT
${hueShades(family("BLUE"), HOUSE_STYLE.blue)}
${hueShades(family("TEAL"), HOUSE_STYLE.teal)}
${hueShades(family("YELLOW"), HOUSE_STYLE.yellow)}
${hueShades(family("GOLD"), HOUSE_STYLE.yellow)}
${hueShades(family("RED"), HOUSE_STYLE.red)}
${hueShades(family("MAROON"), HOUSE_STYLE.pink)}
${hueShades(family("GREEN"), HOUSE_STYLE.green)}
${hueShades(family("PURPLE"), HOUSE_STYLE.purple)}
PINK = ManimColor("${HOUSE_STYLE.pink}")
ORANGE = ManimColor("${HOUSE_STYLE.orange}")
DARK_BLUE = BLUE_E

# A single assignment keeps the preamble valid for the thumbnail AST guard,
# which only allows imports, assignments, and definitions at top level.
_house_defaults = (
    _HouseText.set_default(font="${HOUSE_STYLE.font}", color=INK),
    _HouseMathTex.set_default(color=INK),
    _HouseTex.set_default(color=INK),
    _HouseNumberLine.set_default(color=MUTED, stroke_width=2),
)
`;

/**
 * Inserts the house-style preamble after the top-level imports, forces the
 * house background, and removes the EB Garamond + disable_ligatures pattern.
 * In Manim 0.19+, disable_ligatures drops one trailing character per space,
 * so "tangent line" renders as "tangent lin".
 */
export function applyManimHouseStyle(script: string): string {
  const result = script
    .replace(/,\s*disable_ligatures\s*=\s*True/g, "")
    .replace(/disable_ligatures\s*=\s*True\s*,\s*/g, "")
    .replace(/font\s*=\s*["']EB Garamond["']/g, `font="${HOUSE_STYLE.font}"`)
    .replace(/(self\.camera\.background_color\s*=\s*)[^\n]+/g, "$1BG");

  if (result.includes(HOUSE_STYLE_MARKER)) return result;

  const lines = result
    .replace(/^config\.background_color\s*=.*$/gm, "")
    .split("\n");
  let lastImportIndex = -1;
  for (let index = 0; index < lines.length; index++) {
    const trimmed = lines[index]?.trim() ?? "";
    if (/^(?:from\s+\S+\s+import\s|import\s)/.test(trimmed)) {
      lastImportIndex = index;
    } else if (trimmed.length > 0 && !trimmed.startsWith("#")) {
      break;
    }
  }
  lines.splice(lastImportIndex + 1, 0, "", MANIM_HOUSE_STYLE_PREAMBLE);
  return lines.join("\n");
}

/**
 * Python helper shipped to the sandbox for thumbnails. It renders a soft,
 * dithered radial spotlight centered on the hero and applies it with a
 * per-channel max ("lighten"), which only lifts pixels darker than the light:
 * the background. Content is untouched.
 *
 *   python house_light.py thumbnail IN.png OUT.png
 */
export const HOUSE_LIGHT_PY = `import sys
import numpy as np
from PIL import Image

BACKGROUND = np.array([int("${HOUSE_STYLE.background}"[i:i + 2], 16) for i in (1, 3, 5)], dtype=np.float32)


def _hex(value):
    return np.array([int(value[i:i + 2], 16) for i in (1, 3, 5)], dtype=np.float32)


def spotlight(width, height, light, center, radius=1.05, dither=0.6):
    y, x = np.mgrid[0:height, 0:width].astype(np.float32)
    aspect = width / max(1.0, height)
    dx = (x / width - center[0]) * aspect
    dy = y / height - center[1]
    distance = np.sqrt(dx * dx + dy * dy) / (radius * aspect * 0.5)
    falloff = np.clip(1.0 - distance, 0.0, 1.0) ** 1.6
    image = BACKGROUND + (light - BACKGROUND) * falloff[..., None]
    image += np.random.default_rng(7).uniform(-dither, dither, image.shape)
    return np.clip(image, 0, 255)


def content_center(frame):
    # Light the hero, not the frame: aim at the centroid of saturated content
    # (colored strokes), which ignores large off-white headline text.
    saturation = frame.max(axis=2) - frame.min(axis=2)
    weight = np.clip(saturation - 40.0, 0.0, None)
    if weight.sum() < 1.0:
        return (0.5, 0.48)
    y, x = np.mgrid[0:frame.shape[0], 0:frame.shape[1]]
    cx = float((weight * x).sum() / weight.sum() / frame.shape[1])
    cy = float((weight * y).sum() / weight.sum() / frame.shape[0])
    return (min(0.72, max(0.28, cx)), min(0.62, max(0.38, cy)))


def main():
    mode = sys.argv[1]
    if mode == "thumbnail":
        source, out = sys.argv[2], sys.argv[3]
        frame = np.asarray(Image.open(source).convert("RGB")).astype(np.float32)
        height, width = frame.shape[:2]
        center = content_center(frame)
        light = spotlight(width, height, _hex("${HOUSE_STYLE.thumbnailLight}"), center)
        Image.fromarray(np.maximum(frame, light).astype(np.uint8)).save(out)
        return
    raise SystemExit("unknown mode: " + mode)


if __name__ == "__main__":
    main()
`;

export const HOUSE_LIGHT_PATH = "/home/user/house_light.py";

/**
 * Registers the CMU Serif files that ship with texlive-fonts-extra with
 * fontconfig, so Pango (Manim's Text) can find them. Idempotent; never fails
 * the render if fonts are missing (Pango falls back to its default face).
 */
export const REGISTER_HOUSE_FONTS_COMMAND = [
  "mkdir -p ~/.fonts",
  "find /usr/share/texlive /usr/share/texmf /usr/share/fonts -name 'cmun*.otf' -exec cp -n {} ~/.fonts/ \\; 2>/dev/null",
  "fc-cache -f ~/.fonts >/dev/null 2>&1",
  "fc-list | grep -q 'CMU Serif' && echo house-fonts-ok || echo house-fonts-missing",
].join("; ");
