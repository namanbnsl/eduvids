const MCP_ENDPOINT = "https://mcp.deepwiki.com/mcp";
const MANIM_REPO = "ManimCommunity/manim";

interface MCPResponse {
  jsonrpc: string;
  id?: number;
  result?: {
    content?: Array<{ type: string; text: string }>;
    [key: string]: unknown;
  };
  error?: { code: number; message: string };
}

/**
 * Parse a response that may be JSON or SSE (text/event-stream).
 * DeepWiki's MCP endpoint can return SSE even when JSON is preferred.
 * In SSE format, the JSON-RPC message is in the last `data:` line
 * of a `message` event.
 */
async function parseMCPResponse(response: Response): Promise<MCPResponse> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("text/event-stream")) {
    const text = await response.text();
    // Collect all `data:` lines; the final JSON-RPC payload is the last one
    const dataLines = text
      .split("\n")
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice("data:".length).trim());

    // Walk backwards to find the last parseable JSON-RPC object
    for (let i = dataLines.length - 1; i >= 0; i--) {
      if (!dataLines[i]) continue;
      try {
        const parsed = JSON.parse(dataLines[i]) as MCPResponse;
        if (parsed.jsonrpc) return parsed;
      } catch {
        // not valid JSON, keep looking
      }
    }
    throw new Error("No valid JSON-RPC message found in SSE stream");
  }
  return (await response.json()) as MCPResponse;
}

/**
 * Query ManimCommunity/manim documentation via DeepWiki MCP
 * to get context for fixing Manim script errors.
 */
export async function queryManimDocs(errorContext: string): Promise<string> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "User-Agent": "eduvids/0.5",
    };

    // 1. Initialize MCP session
    const initResponse = await fetch(MCP_ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "eduvids", version: "1.0.0" },
        },
        id: 1,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!initResponse.ok) {
      console.warn(
        "[DeepWiki] Init HTTP error:",
        initResponse.status,
        initResponse.statusText,
      );
      return "";
    }

    const sessionId = initResponse.headers.get("mcp-session-id");
    const initData = await parseMCPResponse(initResponse);
    if (initData.error) {
      console.warn("[DeepWiki] Init error:", initData.error.message);
      return "";
    }

    if (sessionId) headers["mcp-session-id"] = sessionId;

    // 2. Send initialized notification
    const initializedResponse = await fetch(MCP_ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/initialized",
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!initializedResponse.ok) {
      console.warn(
        "[DeepWiki] Initialized HTTP error:",
        initializedResponse.status,
        initializedResponse.statusText,
      );
      return "";
    }

    // 3. Call ask_question tool
    const question = `I'm getting this error in my Manim Community v0.19.0 script. What is the correct API usage to fix it?\n\nError:\n${errorContext.slice(0, 2000)}`;

    const toolResponse = await fetch(MCP_ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          name: "ask_question",
          arguments: {
            repoName: MANIM_REPO,
            question,
          },
        },
        id: 2,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!toolResponse.ok) {
      console.warn(
        "[DeepWiki] Tool HTTP error:",
        toolResponse.status,
        toolResponse.statusText,
      );
      return "";
    }

    const toolData = await parseMCPResponse(toolResponse);
    if (toolData.error) {
      console.warn("[DeepWiki] Tool call error:", toolData.error.message);
      return "";
    }

    const content = toolData.result?.content;
    if (Array.isArray(content)) {
      return content
        .filter((c) => c.type === "text")
        .map((c) => c.text)
        .join("\n")
        .slice(0, 4000);
    }

    return "";
  } catch (err) {
    console.warn(
      "[DeepWiki] Failed to query manim docs:",
      err instanceof Error ? err.message : String(err),
    );
    return "";
  }
}
