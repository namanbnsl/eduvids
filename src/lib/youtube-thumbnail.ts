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

/**
 * A frame lifted from the finished video (see `thumbnail/frame_picker.py`).
 * `fallback` is drawn instead if the frame cannot be used.
 */
export interface ThumbnailFrameVisual {
  type: "frame";
  path: string;
  fallback: ThumbnailVisual;
}

export interface ThumbnailSpec {
  title: string;
  palette: ThumbnailPalette;
  /** Metadata only; the renderer draws no eyebrow. */
  eyebrow: string;
  headline: string;
  accent: string;
  visual: ThumbnailVisual | ThumbnailFrameVisual;
}

/** Candidates that show a real video frame; the rest keep a drawn visual. */
export const FRAME_CANDIDATES = 2;

const THUMBNAIL_DIR = join(process.cwd(), "src/lib/thumbnail");

export const THUMBNAIL_FONT_FILES = [
  "InterTight-SemiBold.ttf",
  "InterTight-SemiBoldItalic.ttf",
  "InterTight-Medium.ttf",
  "InterTight-MediumItalic.ttf",
  "FiraMath-Regular.otf",
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
  frames = [],
}: {
  titles: VideoTitleSet;
  topic: string;
  designSeed: string;
  /** Sandbox paths of frames picked from the video, best first. */
  frames?: string[];
}): [ThumbnailSpec, ThumbnailSpec, ThumbnailSpec] {
  const palette = choosePalette(designSeed);
  return titles.candidates.map((title, index) => {
    const concept = titles.thumbnailConcepts?.[index];
    // Without a concept there is no vetted copy: show the visual on its own.
    const drawn = concept?.visual ?? {
      type: inferVisualType(`${title} ${topic}`),
    };
    const frame = index < FRAME_CANDIDATES ? frames[index] : undefined;
    return {
      title,
      palette,
      eyebrow: concept?.eyebrow ?? "",
      headline: concept?.headline ?? "",
      accent: concept?.accent ?? "",
      visual: frame
        ? { type: "frame" as const, path: frame, fallback: drawn }
        : drawn,
    };
  }) as [ThumbnailSpec, ThumbnailSpec, ThumbnailSpec];
}

export interface ThumbnailAssets {
  renderer: string;
  framePicker: string;
  fonts: { name: string; data: Uint8Array }[];
}

let assetsPromise: Promise<ThumbnailAssets> | undefined;

/** Renderer source and fonts, read once from the deployment bundle. */
export function loadThumbnailAssets(): Promise<ThumbnailAssets> {
  assetsPromise ??= (async () => ({
    renderer: await readFile(join(THUMBNAIL_DIR, "renderer.py"), "utf8"),
    framePicker: await readFile(join(THUMBNAIL_DIR, "frame_picker.py"), "utf8"),
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
