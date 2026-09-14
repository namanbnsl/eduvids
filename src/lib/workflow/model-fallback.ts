import {
  isModelOverloaded,
  isRetryableModelOutputError,
} from "./errors";

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
    const shouldFallback =
      isModelOverloaded(error) || isRetryableModelOutputError(error);
    if (!fallback || signal.aborted || !shouldFallback) throw error;
    return await fallback();
  }
}
