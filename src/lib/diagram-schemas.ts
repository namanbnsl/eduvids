/**
 * DIAGRAM SCHEMAS - Canonical diagram types with structured helpers
 *
 * This module defines the "golden" diagram types that the LLM should use
 * instead of ad-hoc Manim primitives. Each schema includes:
 * - Unique identifier
 * - Dimension (2D/3D)
 * - Topic tags for RAG retrieval
 * - Parameter definitions
 * - Camera style hints
 *
 * The LLM MUST use the corresponding helper functions for these diagram types.
 */

export type DiagramDimension = "2d" | "3d";

export type CameraStyle =
  | "2d-static" // Default 2D view, no camera movement
  | "2d-moving" // MovingCameraScene for 2D panning/zooming
  | "3d-static" // Fixed 3D perspective
  | "3d-orbit"; // 3D with orbit animation

export interface SchemaParam {
  type: "number" | "string" | "enum" | "list" | "boolean" | "function";
  description: string;
  default?: unknown;
  enumValues?: string[];
  required?: boolean;
}

export interface DiagramSchema {
  id: string;
  name: string;
  dimension: DiagramDimension;
  topicTags: string[];
  description: string;
  manimHelper: string;
  params: Record<string, SchemaParam>;
  cameraStyle: CameraStyle;
}

/**
 * Master catalog of diagram schemas
 */
export const DIAGRAM_SCHEMAS: DiagramSchema[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // 2D DIAGRAMS
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "cartesian_graph_v1",
    name: "Cartesian Graph",
    dimension: "2d",
    topicTags: ["functions", "graph", "plot", "math", "algebra", "calculus"],
    description:
      "A 2D coordinate system with axes and one or more function plots",
    manimHelper: "create_cartesian_graph",
    cameraStyle: "2d-static",
    params: {
      func: {
        type: "string",
        description:
          "Python lambda expression for the function (e.g., lambda x: x**2)",
        default: "lambda x: x**2",
        required: true,
      },
      x_range: {
        type: "list",
        description: "X-axis range as [min, max, step]",
        default: [-4, 4, 1],
      },
      y_range: {
        type: "list",
        description: "Y-axis range as [min, max, step]",
        default: [-2, 8, 1],
      },
      color: {
        type: "enum",
        description: "Graph line color",
        enumValues: ["BLUE", "RED", "GREEN", "YELLOW", "CYAN", "PURPLE"],
        default: "BLUE",
      },
      show_labels: {
        type: "boolean",
        description: "Whether to show axis labels",
        default: true,
      },
      x_label: {
        type: "string",
        description: "X-axis label text",
        default: "x",
      },
      y_label: {
        type: "string",
        description: "Y-axis label text",
        default: "y",
      },
    },
  },

  {
    id: "bar_chart_v1",
    name: "Bar Chart",
    dimension: "2d",
    topicTags: ["statistics", "data", "chart", "comparison", "quantities"],
    description: "Vertical bar chart for comparing quantities",
    manimHelper: "create_bar_chart",
    cameraStyle: "2d-static",
    params: {
      values: {
        type: "list",
        description: "List of numeric values for each bar",
        required: true,
      },
      labels: {
        type: "list",
        description: "Labels for each bar (same length as values)",
        required: true,
      },
      colors: {
        type: "list",
        description:
          "Colors for each bar (optional, will auto-generate if not provided)",
        default: null,
      },
      bar_width: {
        type: "number",
        description: "Width of each bar",
        default: 0.6,
      },
      show_values: {
        type: "boolean",
        description: "Whether to display values above bars",
        default: true,
      },
    },
  },

  {
    id: "triangle_labeled_v1",
    name: "Labeled Triangle",
    dimension: "2d",
    topicTags: [
      "geometry",
      "triangle",
      "angles",
      "sides",
      "pythagorean",
      "trigonometry",
    ],
    description:
      "Triangle with vertex labels, side labels, and optional angles",
    manimHelper: "create_labeled_triangle",
    cameraStyle: "2d-static",
    params: {
      vertices: {
        type: "list",
        description:
          "Three vertex positions as [[x1,y1], [x2,y2], [x3,y3]] or use preset",
        default: "right_triangle",
      },
      vertex_labels: {
        type: "list",
        description: "Labels for vertices [A, B, C]",
        default: ["A", "B", "C"],
      },
      side_labels: {
        type: "list",
        description: "Labels for sides [AB, BC, CA] or null elements to skip",
        default: null,
      },
      show_angles: {
        type: "boolean",
        description: "Whether to show angle arcs",
        default: false,
      },
      angle_labels: {
        type: "list",
        description: "Labels for angles at each vertex",
        default: null,
      },
      color: {
        type: "enum",
        description: "Triangle stroke color",
        enumValues: ["BLUE", "WHITE", "GREEN", "YELLOW"],
        default: "BLUE",
      },
      fill_opacity: {
        type: "number",
        description: "Fill opacity (0-1)",
        default: 0.2,
      },
    },
  },

  {
    id: "force_diagram_v1",
    name: "Force Diagram",
    dimension: "2d",
    topicTags: [
      "physics",
      "forces",
      "mechanics",
      "newton",
      "vectors",
      "free body",
    ],
    description: "Object with force arrows showing direction and magnitude",
    manimHelper: "create_force_diagram",
    cameraStyle: "2d-static",
    params: {
      object_shape: {
        type: "enum",
        description: "Shape of the central object",
        enumValues: ["square", "rectangle", "circle", "dot"],
        default: "square",
      },
      object_size: {
        type: "number",
        description: "Size of the object",
        default: 1.0,
      },
      forces: {
        type: "list",
        description:
          "List of forces as [{direction: 'UP/DOWN/LEFT/RIGHT', magnitude: number, label: string, color: string}]",
        required: true,
      },
      show_net_force: {
        type: "boolean",
        description: "Whether to show the resultant net force",
        default: false,
      },
    },
  },

  {
    id: "flowchart_v1",
    name: "Flowchart",
    dimension: "2d",
    topicTags: [
      "process",
      "algorithm",
      "steps",
      "flow",
      "decision",
      "programming",
    ],
    description: "Process flowchart with boxes and arrows",
    manimHelper: "create_flowchart",
    cameraStyle: "2d-static",
    params: {
      steps: {
        type: "list",
        description:
          "List of steps as [{text: string, type: 'process'|'decision'|'start'|'end'}]",
        required: true,
      },
      connections: {
        type: "list",
        description:
          "List of connections as [[from_index, to_index, label?], ...]",
        required: true,
      },
      direction: {
        type: "enum",
        description: "Flow direction",
        enumValues: ["vertical", "horizontal"],
        default: "vertical",
      },
      box_width: {
        type: "number",
        description: "Width of process boxes",
        default: 2.5,
      },
      box_height: {
        type: "number",
        description: "Height of process boxes",
        default: 0.8,
      },
    },
  },

  {
    id: "atom_shells_v1",
    name: "Atom with Electron Shells",
    dimension: "2d",
    topicTags: [
      "chemistry",
      "atom",
      "electrons",
      "shells",
      "orbitals",
      "physics",
    ],
    description: "Bohr model atom with nucleus and electron shells",
    manimHelper: "create_atom_diagram",
    cameraStyle: "2d-static",
    params: {
      element_symbol: {
        type: "string",
        description: "Element symbol (e.g., 'H', 'He', 'C')",
        default: "H",
      },
      electron_config: {
        type: "list",
        description:
          "Electrons per shell as [2, 8, 8, ...] or auto from element",
        default: null,
      },
      show_nucleus_details: {
        type: "boolean",
        description: "Show protons/neutrons in nucleus",
        default: false,
      },
      protons: {
        type: "number",
        description: "Number of protons (if showing nucleus details)",
        default: null,
      },
      neutrons: {
        type: "number",
        description: "Number of neutrons (if showing nucleus details)",
        default: null,
      },
      shell_colors: {
        type: "list",
        description: "Colors for each shell",
        default: null,
      },
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 3D DIAGRAMS
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "3d_axes_vector_v1",
    name: "3D Axes with Vectors",
    dimension: "3d",
    topicTags: ["vectors", "3d", "linear algebra", "physics", "space"],
    description: "3D coordinate system with one or more vectors",
    manimHelper: "create_3d_axes_vector",
    cameraStyle: "3d-static",
    params: {
      vectors: {
        type: "list",
        description:
          "List of vectors as [{components: [x,y,z], color?: string, label?: string}]",
        required: true,
      },
      x_range: {
        type: "list",
        description: "X-axis range",
        default: [-3, 3, 1],
      },
      y_range: {
        type: "list",
        description: "Y-axis range",
        default: [-3, 3, 1],
      },
      z_range: {
        type: "list",
        description: "Z-axis range",
        default: [-3, 3, 1],
      },
      show_unit_vectors: {
        type: "boolean",
        description: "Show i, j, k unit vectors",
        default: false,
      },
    },
  },
];

/**
 * Get schema by ID
 */
export function getSchemaById(id: string): DiagramSchema | undefined {
  return DIAGRAM_SCHEMAS.find((s) => s.id === id);
}

/**
 * Get schemas by dimension
 */
export function getSchemasByDimension(
  dimension: DiagramDimension,
): DiagramSchema[] {
  return DIAGRAM_SCHEMAS.filter((s) => s.dimension === dimension);
}

/**
 * Get schemas matching any of the given topic tags
 */
export function getSchemasByTopic(topics: string[]): DiagramSchema[] {
  const lowerTopics = topics.map((t) => t.toLowerCase());
  return DIAGRAM_SCHEMAS.filter((schema) =>
    schema.topicTags.some((tag) =>
      lowerTopics.some((topic) => tag.includes(topic) || topic.includes(tag)),
    ),
  );
}

/**
 * Get all schema IDs
 */
export function getAllSchemaIds(): string[] {
  return DIAGRAM_SCHEMAS.map((s) => s.id);
}

/**
 * Check if a schema requires 3D scene
 */
export function schemaRequires3D(schemaId: string): boolean {
  const schema = getSchemaById(schemaId);
  return schema?.dimension === "3d";
}

/**
 * Check if a schema needs camera orbit
 */
export function schemaNeedsOrbit(schemaId: string): boolean {
  const schema = getSchemaById(schemaId);
  return schema?.cameraStyle === "3d-orbit";
}

/**
 * Generate the DIAGRAM_SCHEMA comment block for LLM output
 */
export function generateSchemaComment(
  schemaId: string,
  params: Record<string, unknown>,
): string {
  const paramStr = Object.entries(params)
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(", ");
  return `# DIAGRAM_SCHEMA: ${schemaId}\n# PARAMS: ${paramStr}`;
}
