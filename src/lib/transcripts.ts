const SENTENCES_PER_PARAGRAPH = 4;

/**
 * WebVTT captions to readable paragraphs. Drops cue timings and inline tags,
 * and collapses the repeated lines YouTube's rolling auto-captions produce.
 */
export function vttToText(vtt: string): string {
  const lines: string[] = [];
  for (const raw of vtt.replace(/\r/g, "").split("\n")) {
    const line = raw
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (
      !line ||
      line === "WEBVTT" ||
      /^(Kind|Language|NOTE|STYLE)\b/.test(line) ||
      /^\d+$/.test(line) ||
      line.includes("-->")
    ) {
      continue;
    }
    if (lines.at(-1) !== line) lines.push(line);
  }

  const sentences =
    lines
      .join(" ")
      .replace(/\s+/g, " ")
      .match(/[^.!?]+[.!?]+["”’)]*|[^.!?]+$/g)
      ?.map((sentence) => sentence.trim())
      .filter(Boolean) ?? [];

  const paragraphs: string[] = [];
  for (let i = 0; i < sentences.length; i += SENTENCES_PER_PARAGRAPH) {
    paragraphs.push(sentences.slice(i, i + SENTENCES_PER_PARAGRAPH).join(" "));
  }
  return paragraphs.join("\n\n");
}
