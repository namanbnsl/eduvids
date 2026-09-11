# Workflow reliability and deployment

The September failures have three distinct causes:

- Vercel terminated individual requests. `generate-video` had no explicit `maxDuration`. LLM calls had no deadline, and script generation retried three times inside one request. Sandbox preparation combined syntax checks, a dry run, and multiple model repair calls. Finalization could run a 300-second concatenation and a 360-second watermark command in the same request. A 282-second render poll did not protect those other stages.
- Google reported a suspended credential. Voiceover generation bypassed key-health reporting. Other calls reported health without awaiting persistence, the error classifier missed suspension messages, and a generic 15-minute auto-heal could revive blocked keys and bypass quota cooldowns.
- Exhausted script generation returned the string `Script Generation Failed`. The renderer then reported a missing scene class, hiding the original provider failure. Missing scene classes were also rejected before the old in-step repair loop.

## Execution model

Generation and YouTube routes declare a 300-second Vercel limit. Each generation call has a 180-second abort signal and zero AI SDK retries. Upstash performs up to three retries in fresh requests, selecting a key again each time. Scene validation and rendering failures can trigger two separately checkpointed script repairs. Invalid and partial provider output raises an error instead of being stored as successful code.

Preparation runs only quick syntax, AST, scene, and environment checks. The actual render exercises the scene in E2B; a second synchronous dry run is unnecessary. Rendering and postprocessing run as background sandbox jobs. Each uses a lock and atomic exit-status file. A repeated launch reuses the same job, and a missing process is never assumed successful. Upstash polls using short requests separated by durable 10-second sleeps. Each sandbox job has a 30-minute deadline plus a bounded missing-result grace period.

Postprocessing validates every scene, joins outputs, applies the watermark, and validates the final MP4. Generated Python and real FFmpeg processing are covered by local fixture tests. All MP4 bytes remain outside the workflow history. The sandbox survives upload failures until the upload URL has been stored. UploadThing files use the job ID as a custom identifier, allowing discovery after a lost response; this is recovery, not a guarantee of exactly-once external writes.

The video becomes ready and is saved to Convex before optional publishing. YouTube results are checkpointed before subsequent steps. An upload-start claim prevents automatic reposting after an ambiguous YouTube response; the channel must be inspected before manually retrying that upload. X publishing is optional, follows YouTube persistence, and has no automatic retry of the tweet itself. A publishing failure preserves the generated video.

KV, Convex, provider, file-transfer, and publishing requests have explicit deadlines where supported by the installed SDKs. Progress streams close after 45 seconds and on disconnect, terminal jobs, or storage errors, releasing their timers. The client falls back to polling. The job endpoint can fall back to Convex if KV is unavailable.

## Deployment checklist

1. Deploy the Convex changes to the deployment used by Vercel. Local `.env` files point to a **development** deployment; do not assume it is the production backend. No schema migration is needed.
2. Enable Vercel Fluid Compute and verify the deployed generation and YouTube routes have the declared 300-second maximum. The code deliberately does not depend on higher paid-plan limits. See [Vercel duration configuration](https://vercel.com/docs/functions/configuring-functions/duration).
3. Deploy the Next.js changes. The build now enforces TypeScript rather than ignoring build errors.
4. Check the Google account/key reported as suspended. Code cannot reactivate a suspended credential. Configure valid numbered `GOOGLE_GENERATIVE_AI_API_KEY_*` credentials. After correcting credentials, reset health for the affected models with the existing `apiKeys.resetAllKeys` mutation on the correct deployment. Preserve environment-key ordering: the existing pool identifies keys by index. Do not repeatedly reset suspended credentials to healthy.
5. Verify the configured model IDs are available to that Google account. This patch does not change model selection or make paid provider calls.
6. Verify the Upstash signing keys, QStash token, workflow URL, and Vercel protection-bypass secret refer to the intended deployment. Existing runs targeting an immutable old Vercel deployment keep executing old code. Start new runs against the updated deployment; replaying an old run against changed workflow step names is not a migration strategy.
7. Run one short end-to-end generation and inspect the model, prepare, render polling, postprocessing, upload, persistence, and optional publishing steps. Test interrupted delivery and confirm it does not duplicate a sandbox render or overwrite a ready video.

See [Upstash retry configuration](https://upstash.com/docs/workflow/howto/configure). Retries are configured both at the generation trigger and endpoint. Slow work must still fit within a request or execute in the sandbox; durable orchestration alone does not extend a Vercel invocation.

## Local verification

`bun run test` runs regression suites for provider errors/cancellation, key health, sandbox duplicate delivery and exit status, actual Python/FFmpeg processing, and progress streams. FFmpeg, ffprobe, and Python 3 must be installed for the media fixture test. `bun run check` runs ESLint and TypeScript; `bun run build` checks the production bundle.

Local fixtures do not verify live Google credentials, E2B templates, UploadThing, signed Upstash delivery, YouTube/X permissions, or Vercel account settings. Failed production runs are not automatically restarted.
