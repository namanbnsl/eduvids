import { isModelOverloaded } from "./errors";

/** Both calls share a deadline; fallback must never restart the invocation clock. */
export async function withOverloadFallback<T>(
  primary: () => Promise<T>,
  fallback: (() => Promise<T>) | undefined,
  signal: AbortSignal,
): Promise<T> {
  signal.throwIfAborted();
  try {
    return await primary();
  } catch (error) {
    if (!fallback || signal.aborted || !isModelOverloaded(error)) throw error;
    return await fallback();
  }
}
