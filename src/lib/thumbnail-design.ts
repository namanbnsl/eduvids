import { createGoogleModel } from "./google-provider";
import { maybeWithTracing, streamTextWithTracking } from "./llm";
import {
  THUMBNAIL_VISUAL_TYPES,
  type ThumbnailConcept,
  type VideoTitleSet,
} from "./youtube-metadata";
import {
  THUMBNAIL_DESIGN_LIMIT,
  THUMBNAIL_PALETTE_COLORS,
  type ThumbnailPalette,
} from "./youtube-thumbnail";

/**
 * Model-designed thumbnails. The packaging call picks titles, copy and a
 * catalogue concept; here the model composes each whole frame itself in
 * Manim, then looks at the renders and revises them once. The renderer
 * enforces the house rules and falls back to the concept when a design
 * fails, so a design never costs a video its thumbnail.
 */

export type ThumbnailDesigns = [string | null, string | null, string | null];

const SLOTS = ["A", "B", "C"] as const;

function designSystemPrompt(palette: ThumbnailPalette): string {
  const [cool, warm] = THUMBNAIL_PALETTE_COLORS[palette];
  return `You are the thumbnail designer for eduvids, a visual math and science channel shelved beside 3Blue1Brown, Welch Labs and Veritasium. Each video has three title-and-thumbnail packages (A, B, C). For each, design and BUILD the entire 1280x720 thumbnail in Manim Community Edition Python. There is no template: you choose the composition, the scale, where the words go and what the picture is.

HOUSE STYLE (non-negotiable)
- Flat near-black canvas. Crisp solid strokes and flat fills. No glow, bloom, vignette, gradients, sheen, shadows or photoreal 3D.
- Type is Computer Modern, as in 3Blue1Brown, set by the text() and tex() helpers. Sentence case, never ALL CAPS.
- Colour: off-white INK, grey MUTED, ONE cool hue for the picture (COOL = ${cool}) and ONE warm hue (WARM = ${warm}) reserved for the single focal detail and the payoff word.
- Restraint: few elements, big shapes, lots of black. Asymmetry and scale contrast are welcome. One focal point that reads at phone size (about 360 px wide).

WHAT WINS THE CLICK
- The title and thumbnail are one sentence split in two: the image shows the strange thing, the title makes it matter. Never repeat the title.
- Show the moment that makes a viewer think "wait, what?": the impossible number, two things diverging, the object that should not exist, the wrong answer crossed out, the one exception in a sea of sameness.
- Draw THIS video's picture, not a generic icon of its field: the objects, numbers and comparisons the narration actually uses.
- Make A, B and C clearly different compositions. Do not default to headline-left, picture-right. Some directions that work: an enormous number filling the frame with the wrong guess struck through; an object bleeding off the frame edge; words set inside or along the drawing; a before/after split; a dense field of marks with one warm exception; an absurd comparison of scale; a diagram cropped tight on the one moment that matters. Invent your own.

COPY
- A and C carry words: at most 8 words in total, ideally 2-5, set large (90-220 px for the main line). The suggested headline is a starting point: rephrase it if a sharper wording fits your picture, but keep its meaning and complete the title's thought.
- B is visual-only: never call text(). tex() is allowed for a number or symbol that IS the picture.
- Never invent numbers, data or claims. Everything must be true to the narration.

CODE CONTRACT
- Define \`def thumbnail():\` returning a list of mobjects. No Scene, camera, animation, imports, files or network.
- P(x, y): pixel coordinates (origin top-left, x right, y down) to a scene point. px(n): a pixel length in scene units. The frame is 1280x720 px.
- text(copy, size_px, color="ink"): Computer Modern copy. "\\n" breaks lines; inline $math$; \\hl{...} paints words warm; \\strike{...} draws the crossed-out wrong intuition. color is "ink", "muted", "cool" or "accent".
- tex(latex, size_px, color="ink"): a formula or number; \\hl{...} paints a term warm.
- diagram(visual, width_px) returns (group, focus_point): a verified drawing from the catalogue, scaled to width_px, which you can place, crop or combine. visual is a dict like the concept's visual JSON; "type" is one of ${THUMBNAIL_VISUAL_TYPES.join(", ")}. Use it when it fits; draw your own when it does not.
- Shapes: everything Manim exports (Circle, Line, Polygon, Arc, ArcBetweenPoints, VGroup, FunctionGraph, ParametricFunction, Dot, Rectangle, RoundedRectangle, Sector, AnnularSector, DashedLine, Arrow, CurvedArrow, ...), numpy as np, math. Colours: COOL, WARM, INK, MUTED, BG. Strokes 3-10 wide. Never sheen, gradients or set_color_by_gradient.
- Write LaTeX in raw strings: r"\\hl{23}".
- Position with .move_to(P(x, y)), .next_to, .align_to, .shift.

HARD RULES (checked after rendering; a violation discards the design)
- All text inside a 40 px margin of the frame edge. Shapes MAY bleed off the edges.
- No text under YouTube's duration badge: the bottom-right 168x64 px.
- No text smaller than 34 px, including after you scale a group.
- No line or shape edge may run through text, and text blocks never overlap.

Return exactly this, nothing else:

=== THUMBNAIL A ===
IDEA: one sentence: the composition and why it stops the scroll
\`\`\`python
<code>
\`\`\`
=== THUMBNAIL B ===
...
=== THUMBNAIL C ===
...`;
}

function packageBrief(titles: VideoTitleSet): string {
  return titles.candidates
    .map((title, index) => {
      const concept: ThumbnailConcept | undefined =
        titles.thumbnailConcepts?.[index];
      const lines = [`THUMBNAIL ${SLOTS[index]}`, `Title: ${title}`];
      if (index === 1) {
        lines.push("Copy: none (visual-only)");
      } else if (concept?.headline) {
        lines.push(
          `Suggested headline: ${concept.headline}`,
          `Warm word: ${concept.accent || "(none)"}`,
          ...(concept.strike
            ? [`Crossed-out wrong intuition: ${concept.strike}`]
            : []),
        );
      }
      if (concept) {
        lines.push(
          `Picture idea: ${concept.visualConcept || "(none)"}`,
          `Catalogue concept: ${JSON.stringify(concept.visual)}`,
        );
      }
      return lines.join("\n");
    })
    .join("\n\n");
}

/** The code block of each "=== THUMBNAIL X ===" section; "KEEP" gives null. */
export function parseThumbnailDesigns(raw: string): ThumbnailDesigns {
  const designs: ThumbnailDesigns = [null, null, null];
  const sections = raw.split(/^=+\s*THUMBNAIL\s+([ABC])\s*=+\s*$/im);
  for (let index = 1; index < sections.length; index += 2) {
    const slot = SLOTS.indexOf(
      sections[index]!.toUpperCase() as (typeof SLOTS)[number],
    );
    const body = sections[index + 1] ?? "";
    const code = body.match(/```(?:python|py)?\s*\n([\s\S]*?)```/)?.[1]?.trim();
    if (
      slot >= 0 &&
      code &&
      /\bdef\s+thumbnail\s*\(/.test(code) &&
      code.length <= THUMBNAIL_DESIGN_LIMIT
    ) {
      designs[slot] = code;
    }
  }
  return designs;
}

function source(voiceoverScript?: string): string {
  return voiceoverScript
    ? `\n\nNARRATION:\n${voiceoverScript.slice(0, 8_000)}`
    : "";
}

/** Draft designs for the three packages. Never throws; failures give nulls. */
export async function designThumbnails({
  titles,
  palette,
  voiceoverScript,
  sessionId,
}: {
  titles: VideoTitleSet;
  palette: ThumbnailPalette;
  voiceoverScript?: string;
  sessionId: string;
}): Promise<ThumbnailDesigns> {
  try {
    const googleModel = await createGoogleModel("gemini-3.8-flash");
    const text = await streamTextWithTracking(
      {
        model: maybeWithTracing(googleModel.provider(googleModel.modelId), {
          posthogProperties: { $ai_session_id: sessionId },
        }),
        system: designSystemPrompt(palette),
        prompt: `Design the three thumbnails.\n\n${packageBrief(titles)}${source(voiceoverScript)}`,
        temperature: 0.9,
      },
      googleModel,
    );
    return parseThumbnailDesigns(text);
  } catch (error) {
    console.warn(
      "Thumbnail design failed; using catalogue concepts:",
      error instanceof Error ? error.message : error,
    );
    return [null, null, null];
  }
}

export interface ThumbnailDraft {
  /** Public URL of what rendered in this slot (the design or its fallback). */
  imageUrl: string | null;
  design: string | null;
  /** Set when the design was rejected and the slot fell back. */
  error?: string;
}

/**
 * Show the model its renders and let it revise each slot once. Returns new
 * code per slot, or null to keep what rendered. Never throws.
 */
export async function reviewThumbnails({
  titles,
  palette,
  drafts,
  voiceoverScript,
  sessionId,
}: {
  titles: VideoTitleSet;
  palette: ThumbnailPalette;
  drafts: ThumbnailDraft[];
  voiceoverScript?: string;
  sessionId: string;
}): Promise<ThumbnailDesigns> {
  if (!drafts.some((draft) => draft.design)) return [null, null, null];
  const content: Array<
    { type: "text"; text: string } | { type: "image"; image: URL }
  > = [
    {
      type: "text",
      text: `${packageBrief(titles)}${source(voiceoverScript)}\n\nBelow are your three designs as rendered. Judge each as a ruthless art director for a channel beside 3Blue1Brown and Veritasium, imagining it at phone size (360 px wide) in a crowded feed:\n- Does it read instantly? One focal point? Anything cramped, accidentally clipped, overlapping or too small?\n- Is it true to the narration and the house style?\n- Is it intriguing, and does it look designed rather than templated? Are A, B and C clearly different?\nFor a design the renderer rejected, the error is given and the image shows the fallback that will ship instead: fix the code, or reply KEEP to ship the fallback.\nFor each thumbnail reply KEEP if it is already excellent; otherwise give the complete improved code. Use the same "=== THUMBNAIL X ===" format, with KEEP in place of the code block where you keep it.`,
    },
  ];
  drafts.forEach((draft, index) => {
    content.push({
      type: "text",
      text: `=== THUMBNAIL ${SLOTS[index]} ===\n${
        draft.design
          ? `CODE:\n\`\`\`python\n${draft.design}\n\`\`\``
          : "(catalogue concept; no design code)"
      }${draft.error ? `\nRENDERER REJECTED THE DESIGN: ${draft.error}` : ""}${
        draft.imageUrl ? "\nRENDER:" : "\nNOTHING RENDERED."
      }`,
    });
    if (draft.imageUrl)
      content.push({ type: "image", image: new URL(draft.imageUrl) });
  });

  try {
    const googleModel = await createGoogleModel("gemini-3.8-flash");
    const text = await streamTextWithTracking(
      {
        model: maybeWithTracing(googleModel.provider(googleModel.modelId), {
          posthogProperties: { $ai_session_id: sessionId },
        }),
        system: designSystemPrompt(palette),
        messages: [{ role: "user", content }],
        temperature: 0.5,
      },
      googleModel,
    );
    const revised = parseThumbnailDesigns(text);
    // Only slots that had a design can be revised.
    return revised.map((code, index) =>
      drafts[index]?.design ? code : null,
    ) as ThumbnailDesigns;
  } catch (error) {
    console.warn(
      "Thumbnail review failed; keeping the drafts:",
      error instanceof Error ? error.message : error,
    );
    return [null, null, null];
  }
}
