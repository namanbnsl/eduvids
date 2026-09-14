/** Provider errors can include the actual credential in their message. */
export function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/AIza[\w-]+/g, "[REDACTED]")
    .replace(/\bsk_(?:live|test)_[\w-]+\b/gi, "[REDACTED]")
    .replace(/(api[_ -]?key\s*[:=]\s*)[^\s,'";]+/gi, "$1[REDACTED]")
    .slice(0, 6000);
}

export function isCredentialError(message: string): boolean {
  return /permission denied|suspended|unauthorized|api key (?:not valid|invalid)|\b40[13]\b/i.test(
    message,
  );
}

export function isModelOverloaded(error: unknown): boolean {
  const message = safeError(error);
  return !isCredentialError(message) &&
    /high demand|overloaded|temporarily unavailable|service unavailable|\b503\b|\bUNAVAILABLE\b/i.test(message);
}

export function isRetryableModelOutputError(error: unknown): boolean {
  return /AI response was (?:empty|truncated)/i.test(safeError(error));
}

export function generationFailureMessage(message: string): string {
  if (isCredentialError(message) || /all keys are blocked/i.test(message)) {
    return "Video generation is unavailable because the AI provider rejected its credentials. The site operator needs to check the provider account and API keys.";
  }
  if (/timeout|timed out|deadline/i.test(message)) {
    return "Video generation exceeded its time limit after recovery attempts. Please try a shorter or simpler video.";
  }
  if (isModelOverloaded(message)) {
    return "The AI provider is temporarily overloaded. Video generation could not complete after recovery attempts. Please try again later.";
  }
  if (/Manim|scene|syntax|script validation/i.test(message)) {
    return "The animation script could not be rendered after automatic repair. Please try simplifying the request.";
  }
  return "Video generation failed after recovery attempts. Please try again.";
}
