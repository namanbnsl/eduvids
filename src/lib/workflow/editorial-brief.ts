import { createHash } from "node:crypto";
import {
  EditorialBriefReviewError,
  EditorialBriefValidationError,
  parseEditorialBrief,
  parseEditorialReview,
  type EditorialBrief,
  type EditorialReview,
} from "../editorial-brief";
import type { VideoVariant } from "../types";

export const EDITORIAL_BRIEF_ARTIFACT = "editorialBriefV1";
const MAX_DRAFTS = 2;

type Dependencies = {
  prompt: string;
  variant: VideoVariant;
  runStep: <T>(name: string, work: () => Promise<T>) => Promise<T>;
  read: (key: string) => Promise<string | undefined>;
  write: (key: string, value: string) => Promise<void>;
  draft: (feedback: string) => Promise<unknown>;
  review: (brief: EditorialBrief) => Promise<unknown>;
};

/** Each model call is its own durable step, with one bounded revision. */
export async function prepareEditorialBrief(
  deps: Dependencies,
): Promise<EditorialBrief | undefined> {
  const inputHash = createHash("sha256")
    .update(JSON.stringify([deps.prompt, deps.variant]))
    .digest("hex");
  const saved = await deps.runStep("read-editorial-state-v1", async () => ({
    accepted: await deps.read(EDITORIAL_BRIEF_ARTIFACT),
    hasNarration: Boolean(await deps.read("voiceoverScript")),
  }));
  if (saved.accepted) {
    try {
      const record = JSON.parse(saved.accepted);
      if (record.version !== 1 || record.inputHash !== inputHash)
        throw new Error("Stale brief");
      const brief = parseEditorialBrief(record.brief);
      const review = parseEditorialReview(record.review);
      if (review.decision !== "accept") throw new Error("Unaccepted brief");
      return brief;
    } catch {
      throw new EditorialBriefReviewError(
        "The saved editorial brief does not match this request or lacks acceptance.",
      );
    }
  }
  // Do not invent a retrospective brief for a pre-rollout, already narrated job.
  // New jobs cannot reach narration without the accepted record above.
  if (saved.hasNarration) return undefined;

  let feedback = "";
  let reason = "No usable editorial brief was returned.";
  for (let attempt = 0; attempt < MAX_DRAFTS; attempt++) {
    const drafted = await deps.runStep(
      `draft-editorial-brief-v1-${attempt}`,
      async () => {
        try {
          const brief = parseEditorialBrief(await deps.draft(feedback));
          await deps.write(
            `editorialDraftV1-${attempt}`,
            JSON.stringify(brief),
          );
          return { brief, error: null };
        } catch (error) {
          if (!(error instanceof EditorialBriefValidationError)) throw error;
          await deps.write(`editorialDraftErrorV1-${attempt}`, error.message);
          return { brief: null, error: error.message };
        }
      },
    );
    if (!drafted.brief) {
      feedback = drafted.error!;
      reason = feedback;
      continue;
    }
    const brief = drafted.brief;
    const checked = await deps.runStep(
      `review-editorial-brief-v1-${attempt}`,
      async () => {
        try {
          const review = parseEditorialReview(await deps.review(brief));
          await deps.write(
            `editorialReviewV1-${attempt}`,
            JSON.stringify(review),
          );
          return { review, error: null };
        } catch (error) {
          if (!(error instanceof EditorialBriefValidationError)) throw error;
          await deps.write(`editorialReviewErrorV1-${attempt}`, error.message);
          return { review: null, error: error.message };
        }
      },
    );
    if (!checked.review) {
      feedback = checked.error!;
      reason = feedback;
      continue;
    }
    const review: EditorialReview = checked.review;
    if (review.decision === "accept") {
      await deps.runStep("accept-editorial-brief-v1", () =>
        deps.write(
          EDITORIAL_BRIEF_ARTIFACT,
          JSON.stringify({ version: 1, inputHash, brief, review }),
        ),
      );
      return brief;
    }
    feedback = JSON.stringify({ previousBrief: brief, review });
    reason = review.summary;
    if (review.decision === "reject") break;
  }
  throw new EditorialBriefReviewError(
    `The concept needs editorial review before narration: ${reason}`,
  );
}
