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

// Core prompt sections that are ALWAYS included
export const CORE_SECTION_KEYS = [
  "critical_requirements",
  "core_structure",
  "overlap_prevention",
  "text_helpers",
  "layout_templates",
  "color_palette",
  "animation_style",
  "layout_helpers",
];

// Retrieval budgets
export const RETRIEVAL_CONFIG = {
  maxExamples: 2,
  maxSchemas: 2,
  maxTopicSections: 2,
  examplesPerSchema: 1,
  topK: 10,
};

// Prompt section definitions with tier assignments
export interface PromptSection {
  key: string;
  title: string;
  tier: "core" | "topic";
  topicTags: string[];
  domain?: RagDomain;
  startMarker: string;
  endMarker?: string;
}

export const PROMPT_SECTIONS: PromptSection[] = [
  {
    key: "core_structure",
    title: "Mandatory Script Structure",
    tier: "core",
    topicTags: ["manim", "structure", "imports", "voiceover"],
    startMarker: "MANDATORY SCRIPT STRUCTURE",
    endMarker: "CRITICAL REQUIREMENTS",
  },
  {
    key: "critical_requirements",
    title: "Critical Requirements",
    tier: "core",
    topicTags: ["requirements", "class", "imports"],
    startMarker: "CRITICAL REQUIREMENTS",
    endMarker: "THINGS YOU MUST NEVER DO",
  },
  {
    key: "overlap_prevention",
    title: "Overlap Prevention Rules",
    tier: "core",
    topicTags: ["overlap", "spacing", "layout", "positioning"],
    startMarker: "OVERLAP PREVENTION",
    endMarker: "SIMPLE TEMPLATES",
  },
  {
    key: "layout_templates",
    title: "Layout Templates",
    tier: "core",
    topicTags: ["templates", "layout", "title", "diagram"],
    startMarker: "SIMPLE TEMPLATES",
    endMarker: "ALIGNMENT BEST PRACTICES",
  },
  {
    key: "text_helpers",
    title: "Text & Label Helpers",
    tier: "core",
    topicTags: ["text", "label", "font", "bullet"],
    startMarker: "TEXT RENDERING",
    endMarker: "LAYOUT CONTRACT",
  },
  {
    key: "diagram_schemas",
    title: "Diagram Schema Helpers",
    tier: "topic",
    topicTags: ["diagram", "schema", "helper", "create"],
    startMarker: "DIAGRAM SCHEMA HELPERS",
    endMarker: "LAYOUT HELPERS",
  },
  {
    key: "layout_helpers",
    title: "Layout Helpers",
    tier: "core",
    topicTags: ["layout", "position", "center", "stack"],
    startMarker: "LAYOUT HELPERS",
    endMarker: "TEXT RENDERING",
  },
  {
    key: "animation_style",
    title: "Animation Style",
    tier: "topic",
    topicTags: ["animation", "style", "fadein", "fadeout"],
    startMarker: "ANIMATION STYLE",
    endMarker: "COLOR PALETTE",
  },
  {
    key: "color_palette",
    title: "Color Palette",
    tier: "topic",
    topicTags: ["color", "palette", "background"],
    startMarker: "COLOR PALETTE",
    endMarker: "ERROR PREVENTION",
  },
];

// Schema ID to domain mapping
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
