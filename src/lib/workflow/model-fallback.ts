import { isModelOverloaded, isRetryableModelOutputError } from "./errors";

/** Overload and unusable output are model problems; another model may succeed. */
export function shouldFallBackToNextModel(error: unknown): boolean {
  return isModelOverloaded(error) || isRetryableModelOutputError(error);
}

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
    if (!fallback || signal.aborted || !shouldFallBackToNextModel(error))
      throw error;
    return await fallback();
  }
}
