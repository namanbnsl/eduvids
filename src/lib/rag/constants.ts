/**
 * RAG Constants - Configuration and hard exclusion rules
 *
 * NOTE: We rely on semantic embeddings for relevance matching.
 * Keywords here are only for HARD EXCLUSION rules (like 3D filtering).
 */

import type { RagDomain } from "./types";

export const RAG_VERSION = "1.0.0";

// 3D-related keywords - triggers allow3d = true (HARD FILTER)
// Without these keywords, 3D diagrams are excluded from results
export const KEYWORDS_3D = [
  "3d",
  "3D",
  "three d",
  "three dimensional",
  "three-dimensional",
  "xyz",
  "z axis",
  "z-axis",
  "cross product",
  "3d vector",
  "cube",
  "sphere",
  "cylinder",
  "cone",
  "prism",
  "surface plot",
  "plane intersection",
];

// Retrieval budgets
export const RETRIEVAL_CONFIG = {
  maxExamples: 3,
  maxSchemas: 2,
  examplesPerSchema: 1,
  topK: 15,
};

// Schema ID to domain mapping (used for metadata)
export const SCHEMA_DOMAIN_MAP: Record<string, RagDomain> = {
  atom_shells_v1: "chemistry",
  cartesian_graph_v1: "math",
  bar_chart_v1: "math",
  triangle_labeled_v1: "math",
  force_diagram_v1: "physics",
  mapping_diagram_v1: "math",
  flowchart_v1: "cs",
  "3d_axes_vector_v1": "math",
  surface_plot_v1: "math",
  unit_cube_v1: "math",
  "3d_shape_v1": "math",
  plane_intersection_v1: "math",
};
