/**
 * Intent Inference - Lightweight query analysis for hard filters only
 *
 * We rely on semantic embeddings for relevance. This module only handles:
 * - 3D detection (3D diagrams are excluded unless explicitly requested)
 */

import type { QueryIntent } from "./types";
import { KEYWORDS_3D } from "./constants";

function normalizeQuery(query: string): string {
  return query.toLowerCase().replace(/[^\w\s]/g, " ");
}

export function inferQueryIntent(userQuery: string): QueryIntent {
  const normalizedQuery = normalizeQuery(userQuery);

  // Check for 3D-related keywords - only hard filter we enforce
  const allow3d = KEYWORDS_3D.some((keyword) =>
    normalizedQuery.includes(keyword.toLowerCase())
  );

  return {
    allow3d,
  };
}

export function shouldIncludeDoc(
  intent: QueryIntent,
  _docDomain?: string,
  docDimension?: "2d" | "3d"
): boolean {
  // Only hard filter: exclude 3D unless explicitly requested
  if (docDimension === "3d" && !intent.allow3d) {
    return false;
  }

  return true;
}
