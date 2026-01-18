/**
 * Build Documents - Creates RagDoc objects from diagram examples and schemas
 *
 * These docs are indexed in Upstash Vector for semantic retrieval.
 * The system prompt is NOT indexed - it's always included in full.
 */

import * as fs from "fs";
import * as path from "path";
import { DIAGRAM_SCHEMAS } from "../diagram-schemas";
import type { RagDoc, RagDomain } from "./types";
import { RAG_VERSION, SCHEMA_DOMAIN_MAP } from "./constants";

interface CatalogExample {
  schemaId: string;
  slug: string;
  topicTags: string[];
  description: string;
  codePath: string;
}

interface Catalog {
  version: string;
  description: string;
  examples: CatalogExample[];
}

function inferDomainFromTags(tags: string[]): RagDomain {
  const lowerTags = tags.map((t) => t.toLowerCase());

  if (
    lowerTags.some((t) =>
      ["chemistry", "atom", "electron", "molecule", "carbon", "sodium", "element"].includes(t)
    )
  ) {
    return "chemistry";
  }
  if (
    lowerTags.some((t) =>
      ["physics", "force", "gravity", "tension", "newton", "mechanics"].includes(t)
    )
  ) {
    return "physics";
  }
  if (
    lowerTags.some((t) =>
      ["math", "geometry", "algebra", "calculus", "function", "graph", "triangle"].includes(t)
    )
  ) {
    return "math";
  }
  if (
    lowerTags.some((t) =>
      ["flowchart", "algorithm", "process", "decision", "code"].includes(t)
    )
  ) {
    return "cs";
  }
  if (
    lowerTags.some((t) =>
      ["biology", "cell", "dna", "organism", "species"].includes(t)
    )
  ) {
    return "bio";
  }

  return "general";
}

export function buildExampleDocs(docsDir: string): RagDoc[] {
  const catalogPath = path.join(docsDir, "diagrams", "catalog.json");

  if (!fs.existsSync(catalogPath)) {
    console.warn(`Catalog not found at ${catalogPath}`);
    return [];
  }

  const catalog: Catalog = JSON.parse(fs.readFileSync(catalogPath, "utf-8"));
  const docs: RagDoc[] = [];

  for (const example of catalog.examples) {
    const codePath = path.join(docsDir, "diagrams", example.codePath);

    if (!fs.existsSync(codePath)) {
      console.warn(`Example code not found: ${codePath}`);
      continue;
    }

    const code = fs.readFileSync(codePath, "utf-8");

    // Get diagram type from path (e.g., "atom" from "atom/carbon_atom.py")
    const diagramType = example.codePath.split("/")[0];

    // Get schema info for dimension
    const schema = DIAGRAM_SCHEMAS.find((s) => s.id === example.schemaId);
    const dimension = schema?.dimension ?? "2d";

    // Build searchable text - description + tags for semantic matching
    const searchText = [
      `Example: ${example.description}`,
      `Schema: ${example.schemaId}`,
      `Topics: ${example.topicTags.join(", ")}`,
      `Helper: ${schema?.manimHelper ?? "unknown"}`,
      "",
      "Code:",
      code,
    ].join("\n");

    // Combine topic tags from example and schema
    const allTags = [
      ...example.topicTags,
      ...(schema?.topicTags ?? []),
      diagramType,
    ].map((t) => t.toLowerCase());

    docs.push({
      id: `example:${example.schemaId}:${example.slug}`,
      text: searchText,
      metadata: {
        docType: "example",
        topicTags: [...new Set(allTags)],
        domain: inferDomainFromTags(allTags),
        schemaId: example.schemaId,
        diagramType,
        dimension,
        manimHelper: schema?.manimHelper,
        sourcePath: example.codePath,
        slug: example.slug,
        version: RAG_VERSION,
      },
    });
  }

  return docs;
}

export function buildSchemaDocs(): RagDoc[] {
  const docs: RagDoc[] = [];

  for (const schema of DIAGRAM_SCHEMAS) {
    // Build a human-readable schema card
    const paramsDescription = Object.entries(schema.params)
      .map(([name, param]) => {
        const required = param.required ? " (required)" : "";
        const defaultVal =
          param.default !== undefined ? ` [default: ${JSON.stringify(param.default)}]` : "";
        return `  - ${name}: ${param.type}${required}${defaultVal}\n    ${param.description}`;
      })
      .join("\n");

    const schemaCard = [
      `Diagram Schema: ${schema.name}`,
      `ID: ${schema.id}`,
      `Dimension: ${schema.dimension.toUpperCase()}`,
      `Camera Style: ${schema.cameraStyle}`,
      `Helper Function: ${schema.manimHelper}()`,
      "",
      `Description: ${schema.description}`,
      "",
      `Topics: ${schema.topicTags.join(", ")}`,
      "",
      "Parameters:",
      paramsDescription,
    ].join("\n");

    docs.push({
      id: `schema:${schema.id}`,
      text: schemaCard,
      metadata: {
        docType: "schema",
        topicTags: schema.topicTags.map((t) => t.toLowerCase()),
        domain: SCHEMA_DOMAIN_MAP[schema.id] ?? "general",
        schemaId: schema.id,
        dimension: schema.dimension,
        manimHelper: schema.manimHelper,
        sourcePath: "src/lib/diagram-schemas.ts",
        version: RAG_VERSION,
      },
    });
  }

  return docs;
}

export function buildAllDocs(docsDir: string): RagDoc[] {
  const exampleDocs = buildExampleDocs(docsDir);
  const schemaDocs = buildSchemaDocs();

  console.log(`Built ${exampleDocs.length} example docs`);
  console.log(`Built ${schemaDocs.length} schema docs`);

  return [...exampleDocs, ...schemaDocs];
}
