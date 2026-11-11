import type { VideoVariant } from "./types";

/** One policy for narration, planning and animation; explicit requests win. */
export function videoGenerationPrompt(
  prompt: string,
  variant: VideoVariant,
): string {
  const format =
    variant === "short"
      ? "Create a vertical (9:16) Short. When the request does not specify a duration, keep the complete explanation under 95 seconds. The portrait frame is 8 units wide and about 14.2 units tall (x from -4 to 4, y from -7.1 to 7.1): stack content vertically and keep every element within x from -3.4 to 3.4."
      : "Create a landscape (16:9) video. When the request does not specify a duration, aim for two to four minutes, using less time when the explanation is complete sooner.";
  return `${prompt}\n\nFORMAT AND DURATION POLICY\n${format}\nAn explicit duration in the request takes precedence over these defaults. Budget narration and animation together, including transitions. Use only the words and scenes needed to explain one idea; never pad to reach a word count, scene count or minimum duration. Use large readable typography and well-spaced visual groups.`;
}
