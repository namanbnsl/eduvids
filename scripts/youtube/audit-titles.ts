// Read-only audit. There is deliberately no --apply mode or YouTube write API.
// npm run youtube:audit-titles -- --output=/tmp/youtube-title-audit.json
// Add --list-only to skip AI suggestions; --limit=N limits suggestions only.
// --resume=REPORT.json reuses previously validated suggestions.
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { listUploadedYouTubeVideos } from "../../src/lib/youtube";
import {
  assertValidUploadTitle,
  repairYouTubeMetadata,
  titleValidationErrors,
  GENERIC_VIDEO_TITLE,
} from "../../src/lib/youtube-validation";
import { flag } from "./client";
import { safeError } from "../../src/lib/workflow/errors";

async function main() {
  const videos = await listUploadedYouTubeVideos();
  const suggestions = new Set(videos.map((video) => video.title));
  const limit = Number(flag("limit") ?? Infinity);
  const listOnly = flag("list-only") === true;
  const resume = flag("resume");
  const previous =
    typeof resume === "string"
      ? (
          JSON.parse(readFileSync(resume, "utf8")) as {
            videos: { videoId: string; suggestedTitle: string | null }[];
          }
        ).videos
      : [];
  const rows = videos.flatMap((video) => {
    const reasons = titleValidationErrors(
      video.title,
      videos
        .filter((other) => other.videoId !== video.videoId)
        .map((other) => other.title),
    );
    if (!reasons.length) return [];
    const saved = previous.find(
      (row) => row.videoId === video.videoId,
    )?.suggestedTitle;
    const suggestedTitle =
      saved && !titleValidationErrors(saved, suggestions).length ? saved : null;
    if (suggestedTitle) suggestions.add(suggestedTitle);
    return [
      {
        videoId: video.videoId,
        url: video.watchUrl,
        title: video.title,
        reasons,
        suggestedTitle,
        suggestionError: undefined as string | undefined,
      },
    ];
  });
  const output = flag("output");
  const saveReport = () => {
    if (typeof output === "string")
      writeFileSync(
        output,
        JSON.stringify(
          {
            generatedAt: new Date().toISOString(),
            dryRun: true,
            scanned: videos.length,
            rejected: rows.length,
            videos: rows,
          },
          null,
          2,
        ) + "\n",
      );
  };
  saveReport();
  let next = 0;
  // Four bounded workers keep long channel audits practical. Reserving each
  // accepted suggestion synchronously also prevents duplicate suggestions.
  const results = await Promise.allSettled(
    Array.from({ length: 4 }, async () => {
      while (next < rows.length) {
        const index = next++;
        const row = rows[index]!;
        const video = videos.find((entry) => entry.videoId === row.videoId)!;
        if (!listOnly && !row.suggestedTitle && index < limit) {
          try {
            // Do not base a replacement on the Previous link or somebody else's
            // chapter names. Prefer the narration when it is available locally.
            const { CURATED_TRANSCRIPTS } =
              await import("../../src/lib/curated-transcripts");
            const script = CURATED_TRANSCRIPTS[video.videoId];
            const description =
              video.description.split(/\n\s*\n/)[0]?.trim() ?? "";
            if (
              !script &&
              video.title === GENERIC_VIDEO_TITLE &&
              (!description ||
                /eduvids\.app/.test(description) ||
                description.includes(
                  "Explore the topic through narrated diagrams",
                ))
            ) {
              throw new Error(
                "Needs source review: no narration or usable description available",
              );
            }
            const { generateUploadTitle } =
              await import("../../src/lib/youtube-repair");
            row.suggestedTitle = await repairYouTubeMetadata(
              "",
              (candidate) => {
                const validated = assertValidUploadTitle(
                  candidate,
                  suggestions,
                );
                suggestions.add(validated);
                return validated;
              },
              (feedback, signal) =>
                generateUploadTitle(
                  {
                    topic: `Existing title (may contain production directions): ${video.title}\nPublic description: ${description}`,
                    script,
                  },
                  feedback,
                  signal,
                ),
            );
          } catch (error) {
            row.suggestionError = safeError(error);
          }
        }
        saveReport();
        console.log(
          `${row.url}\n  Title: ${row.title}\n  Rejected: ${row.reasons.join("; ")}\n  Suggested: ${row.suggestedTitle ?? row.suggestionError ?? "not requested"}`,
        );
      }
    }),
  );
  for (const result of results)
    if (result.status === "rejected") throw result.reason;
  console.log(
    `Dry run: ${rows.length}/${videos.length} titles rejected. No YouTube changes made.`,
  );
}

main().catch((error) => {
  console.error(safeError(error));
  process.exitCode = 1;
});
