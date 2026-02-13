import { tavily } from "@tavily/core";

export interface TavilySource {
  title: string;
  url: string;
  content: string;
  rawContent?: string;
  score: number;
}

export interface TavilySearchResult {
  query: string;
  sources: TavilySource[];
  answer?: string;
}

const client = tavily({ apiKey: process.env.TAVILY_API_KEY ?? "" });

export async function searchForTopic(
  prompt: string,
): Promise<TavilySearchResult> {
  const apiKey = process.env.TAVILY_API_KEY;

  if (!apiKey) {
    console.warn("[Tavily] TAVILY_API_KEY not set, skipping web search");
    return { query: prompt, sources: [] };
  }

  // Truncate to 380 chars if needed (Tavily limit is 400)
  const searchQuery = prompt.length > 380 ? prompt.slice(0, 380) : prompt;
  console.log(
    `[Tavily] Searching for: "${searchQuery}" (${searchQuery.length} chars)`,
  );

  try {
    const response = await client.search(searchQuery, {
      searchDepth: "advanced",
      maxResults: 5,
      includeAnswer: "advanced",
      includeRawContent: "markdown",
    });

    console.log(`[Tavily] Got ${response.results.length} results`);

    const sources: TavilySource[] = response.results.map((result) => ({
      title: result.title,
      url: result.url,
      content: result.content,
      rawContent: result.rawContent,
      score: result.score,
    }));

    return {
      query: response.query,
      sources,
      answer: response.answer,
    };
  } catch (error) {
    console.error("[Tavily] Search failed:", error);
    return { query: prompt, sources: [] };
  }
}

export function formatSourcesForPrompt(sources: TavilySource[]): string {
  if (sources.length === 0) return "";

  const formattedSources = sources
    .map(
      (source, i) =>
        `[Source ${i + 1}] ${source.title}\nURL: ${source.url}\n${source.content}`,
    )
    .join("\n\n");

  return `
═══════════════════════════════════════════════════════════════════════════════
WEB RESEARCH SOURCES - Use this information to enhance the educational content
═══════════════════════════════════════════════════════════════════════════════

${formattedSources}

Use these sources to ensure the narration is accurate, up-to-date, and includes relevant facts and examples.
`;
}

function clip(value: string | undefined, maxChars: number): string {
  if (!value) return "";
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars)}...`;
}

export function formatWebResearchForPrompt(result: TavilySearchResult): string {
  if (!result.sources.length && !result.answer) return "";

  const answerBlock = clip(result.answer, 1600);
  const formattedSources = result.sources
    .map((source, i) => {
      const mainExcerpt =
        clip(source.rawContent, 1400) || clip(source.content, 700);
      const fallbackContent = mainExcerpt || "No excerpt available.";

      return [
        `[Source ${i + 1}] ${source.title}`,
        `URL: ${source.url}`,
        `Relevance score: ${source.score.toFixed(3)}`,
        `Excerpt:`,
        fallbackContent,
      ].join("\n");
    })
    .join("\n\n");

  return `
═══════════════════════════════════════════════════════════════════════════════
WEB RESEARCH RESULTS - USE THESE FACTS DIRECTLY IN THE SCRIPT
═══════════════════════════════════════════════════════════════════════════════

Search query: ${result.query}

${answerBlock ? `SYNTHESIZED WEB ANSWER:\n${answerBlock}\n\n` : ""}DETAILED SOURCE EXCERPTS:
${formattedSources}

INSTRUCTIONS:
- Prioritize facts from the synthesized answer and excerpts above.
- Use sources for factual grounding, numbers, definitions, and real-world examples.
- If sources disagree, present the consensus and avoid unsupported claims.
`;
}
