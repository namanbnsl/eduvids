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

export interface ThumbnailSpec {
  title: string;
  palette: ThumbnailPalette;
  /** Metadata only; the renderer draws no eyebrow. */
  eyebrow: string;
  headline: string;
  accent: string;
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
  const normalized = text.toLowerCase();
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
  return titles.candidates.map((title, index) => {
    const concept = titles.thumbnailConcepts?.[index];
    // Without a concept there is no vetted copy: show the visual on its own.
    // An equation hero needs valid notation; otherwise draw what the title is
    // about rather than an unrelated formula.
    const drawn =
      concept?.visual &&
      !(concept.visual.type === "equation" && !concept.visual.notation)
        ? concept.visual
        : {
            type: inferVisualType(
              `${concept?.visualConcept ?? ""} ${title} ${topic}`,
            ),
          };
    return {
      title,
      palette,
      eyebrow: concept?.eyebrow ?? "",
      headline: concept?.headline ?? "",
      accent: concept?.accent ?? "",
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
