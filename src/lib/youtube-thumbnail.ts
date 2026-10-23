import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type {
  ThumbnailVisual,
  ThumbnailVisualType,
  VideoTitleSet,
} from "./youtube-metadata";

/**
 * Thumbnails are rendered by `thumbnail/renderer.py` from data, never from
 * model-written code. This module turns a title package into those specs and
 * loads the renderer and its fonts for upload into the render sandbox.
 */

// Cool hue carries the visual; warm hue marks the focal detail and accent copy.
// Names must match PALETTES in renderer.py.
export const THUMBNAIL_PALETTES = [
  "teal-amber",
  "azure-coral",
  "violet-amber",
  "teal-rose",
  "azure-amber",
] as const;

export type ThumbnailPalette = (typeof THUMBNAIL_PALETTES)[number];
export const THUMBNAIL_LAYOUTS = [
  "split_left",
  "split_right",
  "poster",
] as const;
export type ThumbnailLayout = (typeof THUMBNAIL_LAYOUTS)[number];

export interface ThumbnailSpec {
  title: string;
  palette: ThumbnailPalette;
  layout: ThumbnailLayout | "visual_only";
  /** Metadata only; the renderer draws no eyebrow. */
  eyebrow: string;
  headline: string;
  accent: string;
  /** One headline word drawn crossed out: the intuition the video corrects. */
  strike: string;
  /** Short copy beside the hero with a warm arrow to its focal detail. */
  callout: string;
  visual: ThumbnailVisual;
}

const THUMBNAIL_DIR = join(process.cwd(), "src/lib/thumbnail");

export const THUMBNAIL_FONT_FILES = [
  "cmunrm.otf",
  "cmunti.otf",
  "cmunbx.otf",
  "cmunbi.otf",
  "latinmodern-math.otf",
] as const;

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** One palette per video so every candidate (and the video) shares a scheme. */
export function choosePalette(seed: string): ThumbnailPalette {
  return THUMBNAIL_PALETTES[stableHash(seed) % THUMBNAIL_PALETTES.length]!;
}

export function inferVisualType(text: string): ThumbnailVisualType {
  return inferVisual(text).type;
}

/** A truthful default visual for text with no vetted concept. */
export function inferVisual(text: string): ThumbnailVisual {
  const normalized = text.toLowerCase();
  if (/\bfission\b|splitting (?:an? )?(?:atom|nucleus)/.test(normalized))
    return { type: "fission" };
  if (
    /\bwater\b|h2o|h₂o/.test(normalized) &&
    /molecul|bond|bent|vsepr/.test(normalized)
  )
    return { type: "molecule", shape: "water" };
  if (/carbon dioxide|co2|co₂/.test(normalized))
    return { type: "molecule", shape: "carbon_dioxide" };
  if (
    /packet|bandwidth|congestion|internet|streaming|movies?.*network/.test(
      normalized,
    )
  )
    return { type: "packet_flow" };
  if (/\bprimes?\b|prime number/.test(normalized)) {
    return { type: "spiral", shape: "primes" };
  }
  if (/fibonacci|golden ratio|golden spiral|phyllotaxis/.test(normalized)) {
    return { type: "spiral", shape: "golden" };
  }
  if (/double pendulum/.test(normalized)) {
    return { type: "chaos", shape: "pendulum" };
  }
  if (
    /chaos|chaotic|butterfly effect|lorenz|strange attractor/.test(normalized)
  ) {
    return { type: "chaos", shape: "lorenz" };
  }
  if (/koch|snowflake|coastline/.test(normalized)) {
    return { type: "fractal", shape: "koch" };
  }
  if (/fractal|sierpinski|self-similar|recursion|recursive/.test(normalized)) {
    return { type: "fractal" };
  }
  if (/benford|histogram|leading digit/.test(normalized)) {
    return { type: "bars" };
  }
  return { type: inferBaseVisualType(normalized) };
}

function inferBaseVisualType(normalized: string): ThumbnailVisualType {
  if (
    /luminescen|chemical.*glow|quantum.*(?:steps?|emission)|(?:photon|electron).*emission/.test(
      normalized,
    )
  ) {
    return "energy_levels";
  }
  if (/surface|manifold|terrain|multivariable|gradient/.test(normalized)) {
    return "surface_3d";
  }
  if (
    /solid|sphere|volume|torus|topolog|three dimensional|3d/.test(normalized)
  ) {
    return "solid_3d";
  }
  if (/euler|complex|imaginary|unit circle|phase|rotation/.test(normalized)) {
    return "complex_plane";
  }
  if (
    /probab|chance|random|bayes|distribution|statistic|normal/.test(normalized)
  ) {
    return "probability";
  }
  if (/atom|molecule|chem|bond|electron/.test(normalized)) return "atom";
  if (/gravity|planet|orbit|kepler|satellite|star/.test(normalized)) {
    return "orbit";
  }
  if (/wave|fourier|sound|frequency|signal|oscillat/.test(normalized)) {
    return "wave";
  }
  if (
    /derivative|differentiat|calculus|slope|limit|integral|function/.test(
      normalized,
    )
  ) {
    return "function_plot";
  }
  if (/matrix|matrices|linear|transform|eigen|determinant/.test(normalized)) {
    return "transformation";
  }
  if (
    /vector field|curl|divergence|flow|fluid|electric field/.test(normalized)
  ) {
    return "vector_field";
  }
  if (
    /neural|network|machine learning|deep learning|\bai\b|graph/.test(
      normalized,
    )
  ) {
    return "network";
  }
  return "geometry";
}

export function buildThumbnailSpecs({
  titles,
  topic,
  designSeed,
}: {
  titles: VideoTitleSet;
  topic: string;
  designSeed: string;
}): [ThumbnailSpec, ThumbnailSpec, ThumbnailSpec] {
  const palette = choosePalette(designSeed);
  const offset = stableHash(`layout:${designSeed}`) % THUMBNAIL_LAYOUTS.length;
  return titles.candidates.map((title, index) => {
    const concept = titles.thumbnailConcepts?.[index];
    // Without a concept there is no vetted copy: show the visual on its own.
    // An equation hero needs valid notation; otherwise draw what the title is
    // about rather than an unrelated formula.
    const drawn =
      concept?.visual &&
      !(concept.visual.type === "equation" && !concept.visual.notation) &&
      !(concept.visual.type === "number" && !concept.visual.value)
        ? concept.visual
        : inferVisual(`${concept?.visualConcept ?? ""} ${title} ${topic}`);
    return {
      title,
      palette,
      // Vary the published first candidate across jobs, and give C a distinct
      // composition. B stays a full-canvas, text-free alternative.
      layout:
        !concept?.headline || index === 1
          ? "visual_only"
          : THUMBNAIL_LAYOUTS[
              (offset + (index === 2 ? 1 : 0)) % THUMBNAIL_LAYOUTS.length
            ]!,
      eyebrow: concept?.eyebrow ?? "",
      headline: index === 1 ? "" : (concept?.headline ?? ""),
      accent: index === 1 ? "" : (concept?.accent ?? ""),
      strike: index === 1 ? "" : (concept?.strike ?? ""),
      callout: index === 1 ? "" : (concept?.callout ?? ""),
      // Video frames carry their own spacing, captions and formula colours.
      // Use the vetted concept in every slot so the renderer can lay it out.
      visual: drawn,
    };
  }) as [ThumbnailSpec, ThumbnailSpec, ThumbnailSpec];
}

export interface ThumbnailAssets {
  renderer: string;
  fonts: { name: string; data: Uint8Array }[];
}

let assetsPromise: Promise<ThumbnailAssets> | undefined;

/** Renderer source and fonts, read once from the deployment bundle. */
export function loadThumbnailAssets(): Promise<ThumbnailAssets> {
  assetsPromise ??= (async () => ({
    renderer: await readFile(join(THUMBNAIL_DIR, "renderer.py"), "utf8"),
    fonts: await Promise.all(
      THUMBNAIL_FONT_FILES.map(async (name) => ({
        name,
        data: new Uint8Array(
          await readFile(join(THUMBNAIL_DIR, "fonts", name)),
        ),
      })),
    ),
  }))().catch((error) => {
    assetsPromise = undefined;
    throw error;
  });
  return assetsPromise;
}
