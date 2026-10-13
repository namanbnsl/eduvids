// Brings every uploaded video's description up to the current call to action
// (DESCRIPTION_CTA in src/lib/youtube-metadata.ts).
//
//   node --import tsx scripts/youtube/update-descriptions.ts            # dry run
//   node --import tsx scripts/youtube/update-descriptions.ts --apply
//   ... --apply --limit=20        stop after 20 updates
//   ... --apply --video=VIDEO_ID  one video only
//
// Each update costs 50 of the default 10,000 daily API units, so about 190
// videos a day. It is safe to re-run: videos already updated are skipped.
import { youtube_v3 } from "googleapis";

import { withDescriptionCta } from "../../src/lib/youtube-metadata";
import { flag, isQuotaError, youtubeClient } from "./client";

const MAX_DESCRIPTION = 5000;

const youtube = youtubeClient();
const apply = flag("apply") === true;
const limit = Number(flag("limit") ?? Infinity);
const onlyVideo = flag("video");

async function uploadedVideoIds(): Promise<string[]> {
  if (typeof onlyVideo === "string") return [onlyVideo];
  const channel = await youtube.channels.list({
    part: ["contentDetails"],
    mine: true,
  });
  const playlistId =
    channel.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!playlistId) throw new Error("No uploads playlist for this account");

  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const page = await youtube.playlistItems.list({
      part: ["contentDetails"],
      playlistId,
      maxResults: 50,
      pageToken,
    });
    for (const item of page.data.items ?? []) {
      if (item.contentDetails?.videoId) ids.push(item.contentDetails.videoId);
    }
    pageToken = page.data.nextPageToken ?? undefined;
  } while (pageToken);
  return ids;
}

async function main() {
  const ids = await uploadedVideoIds();
  console.log(`${ids.length} videos. ${apply ? "Updating." : "Dry run."}`);

  let updated = 0;
  let current = 0;
  for (let i = 0; i < ids.length && updated < limit; i += 50) {
    const batch = await youtube.videos.list({
      part: ["snippet"],
      id: ids.slice(i, i + 50),
    });
    for (const video of batch.data.items ?? []) {
      if (updated >= limit) break;
      const snippet = video.snippet;
      if (!video.id || !snippet?.title || !snippet.categoryId) continue;

      const description = withDescriptionCta(snippet.description ?? "");
      if (description === null) {
        current++;
        continue;
      }
      if (description.length > MAX_DESCRIPTION) {
        console.warn(`skip ${video.id}: description would exceed 5000 chars`);
        continue;
      }

      console.log(
        `${apply ? "update" : "would update"} ${video.id}  ${snippet.title}`,
      );
      if (apply) {
        // videos.update replaces the whole snippet: resend every field we keep.
        const next: youtube_v3.Schema$VideoSnippet = {
          title: snippet.title,
          categoryId: snippet.categoryId,
          description,
          tags: snippet.tags,
          defaultLanguage: snippet.defaultLanguage,
          defaultAudioLanguage: snippet.defaultAudioLanguage,
        };
        try {
          await youtube.videos.update({
            part: ["snippet"],
            requestBody: { id: video.id, snippet: next },
          });
        } catch (error) {
          if (isQuotaError(error)) {
            console.log("Daily API quota used up. Run again tomorrow.");
            break;
          }
          throw error;
        }
      }
      updated++;
    }
  }

  console.log(
    `${apply ? "Updated" : "Would update"} ${updated}; ${current} already current.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
