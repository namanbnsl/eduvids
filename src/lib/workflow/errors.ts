/** Provider errors can include the actual credential in their message. */
export function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/AIza[\w-]+/g, "[REDACTED]")
    .replace(/(api[_ -]?key\s*[:=]\s*)[^\s,'";]+/gi, "$1[REDACTED]")
    .slice(0, 6000);
}

export function isCredentialError(message: string): boolean {
  return /permission denied|suspended|unauthorized|api key (?:not valid|invalid)|\b40[13]\b/i.test(
    message,
  );
}

export function generationFailureMessage(message: string): string {
  if (isCredentialError(message) || /all keys are blocked/i.test(message)) {
    return "Video generation is unavailable because the AI provider rejected its credentials. The site operator needs to check the provider account and API keys.";
  }
  if (/timeout|timed out|deadline/i.test(message)) {
    return "Video generation exceeded its time limit after recovery attempts. Please try a shorter or simpler video.";
  }
  if (/Manim|scene|syntax|script validation/i.test(message)) {
    return "The animation script could not be rendered after automatic repair. Please try simplifying the request.";
  }
  return "Video generation failed after recovery attempts. Please try again.";
}
