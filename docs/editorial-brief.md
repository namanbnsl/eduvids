# Editorial brief before narration

New video jobs draft and independently review a structured lesson brief before generating narration. The brief records the viewer question, plausible starting intuition, missing insight, opening demonstration, causal steps and their visuals, takeaway, transfer question/answer, scope and assumptions. Mathematical constructions are valid demonstrations; the stage does not require a physical object or a manufactured misconception.

Each model call runs in its own existing durable workflow step. A repairable review receives one revision with the prior brief and specific issues. A rejection stops immediately. Invalid/truncated JSON, inconsistent verdicts and exhausted revisions never become approval. Provider/storage failures remain operational errors handled by the existing workflow recovery policy.

A held concept sets the job's error and YouTube `needs_review` state and returns before narration, sandbox creation or upload. This is an automated editorial decision, not a request for publication permission. The user's publishing authorisation and privacy configuration are unchanged.

## Stored artifacts

The existing job-scoped artifact store retains these under its current 24-hour TTL:

- `editorialDraftV1-0` / `editorialDraftV1-1`: validated drafts.
- `editorialReviewV1-0` / `editorialReviewV1-1`: structured review decisions and issues.
- `editorialDraftErrorV1-N` / `editorialReviewErrorV1-N`: output-validation failures without raw model text.
- `editorialBriefV1`: accepted brief, accepting review, schema version and request/format hash.
- `editorialHoldV1`: hold reason when the stage cannot accept a brief.

The accepted artifact is passed explicitly to narration, scene planning and animation generation/regeneration. This does not validate that the finished script or render actually follows it; those checks belong to the subsequent script/render review stages.

Already-narrated jobs from before rollout resume without generating a retrospective brief. Cached accepted records must match the request and format and contain a valid accepting review. Durable replay reuses completed drafting/review steps.

## Validation and limits

`tests/editorial-brief.test.ts` checks schema failures, verdict consistency, acceptance persistence, revision feedback, bounded rejection, failure propagation and replay/legacy behavior. `tests/fixtures/editorial-briefs.json` supplies manually written physical and mathematical examples. These are engineering fixtures, not evidence that a particular model reliably judges teaching quality.

Before relying on the stage's acceptance rate, compare its decisions with human judgments on representative channel topics. Inspect whether it identifies a real explanatory insight, sufficient causal steps, truthful assumptions and an answerable transfer question. Include weak but well-formatted briefs, unsupported premises and sound maths topics. Track false acceptance, unnecessary rejection and revision usefulness. Do not choose a threshold merely to maximise pass rate.

The reviewer has no new research/retrieval capability. Editorial acceptance is not factual verification, a rendered-content approval, or a guarantee of retention or channel growth. No generated evaluation fixtures or videos are published by tests.
