import { tavily } from "@tavily/core";

export interface TavilySource {
  title: string;
  url: string;
  content: string;
  score: number;
}

export interface TavilySearchResult {
  query: string;
  sources: TavilySource[];
  answer?: string;
}

const client = tavily({ apiKey: process.env.TAVILY_API_KEY ?? "" });

export async function searchForTopic(
  prompt: string
): Promise<TavilySearchResult> {
  const apiKey = process.env.TAVILY_API_KEY;
  
  if (!apiKey) {
    console.warn("[Tavily] TAVILY_API_KEY not set, skipping web search");
    return { query: prompt, sources: [] };
  }

  // Truncate to 380 chars if needed (Tavily limit is 400)
  const searchQuery = prompt.length > 380 ? prompt.slice(0, 380) : prompt;
  console.log(`[Tavily] Searching for: "${searchQuery}" (${searchQuery.length} chars)`);

  try {
    const response = await client.search(searchQuery, {
      searchDepth: "basic",
      maxResults: 5,
      includeAnswer: true,
    });

    console.log(`[Tavily] Got ${response.results.length} results`);

    const sources: TavilySource[] = response.results.map((result) => ({
      title: result.title,
      url: result.url,
      content: result.content,
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
        `[Source ${i + 1}] ${source.title}\nURL: ${source.url}\n${source.content}`
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
