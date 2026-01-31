import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";

let cachedClient: ConvexHttpClient | null = null;

export function getConvexClient(): ConvexHttpClient {
  if (cachedClient) {
    return cachedClient;
  }

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
  }

  cachedClient = new ConvexHttpClient(convexUrl);
  return cachedClient;
}

export { api };
