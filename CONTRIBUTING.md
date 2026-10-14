# Contributing to eduvids

Thanks for helping out. eduvids turns a topic into a narrated, animated lesson. An LLM plans the lesson and writes [Manim](https://www.manim.community/) code, an E2B sandbox renders it, and the voice is timed to the picture. Contributions are welcome at every layer, from the Next.js app to the prompts to the Python that runs inside the sandbox.

## Ways to help

- **Report a bad video.** If a video came out wrong, open an issue with the prompt you used, the language and format (landscape or Short), and a link or screenshot. This is the most useful bug report there is.
- **Fix rendering problems.** Overlapping labels, text running off-screen, broken LaTeX, narration out of sync and failed renders all count.
- **Improve the lessons.** Better prompts, visual devices and house-style rules make every video better. See [`docs/`](docs) for the reasoning behind the current look.
- **Languages and voices.** You can add or improve narration for languages other than English.
- **The app itself.** UI, accessibility, performance, docs.

If you're new, look for issues labelled [`good first issue`](https://github.com/namanbnsl/eduvids/labels/good%20first%20issue) or [`help wanted`](https://github.com/namanbnsl/eduvids/labels/help%20wanted). For anything bigger than a small fix, open an issue first so we can agree on the approach before you put time into it.

## Getting set up

Follow [Run it yourself](README.md#run-it-yourself) in the README. In short:

```bash
git clone https://github.com/namanbnsl/eduvids
cd eduvids
bun install
cp .env.example .env   # fill in the keys
bun run dev
```

The dev command starts Next.js, the local QStash server and Convex together. Rendering needs an E2B account and the `eduvids-render` sandbox template built once (see [`sandbox-templates/eduvids-render`](sandbox-templates/eduvids-render)).

You don't need every service to work on most things. UI changes and many prompt or style changes can be checked without a full render.

## Where things live

| Path | What's there |
| --- | --- |
| `src/app` | Next.js routes: the app, marketing pages, and the `chat`, `jobs` and `workflow` API routes |
| `src/lib/workflow` | The render workflow: sandbox jobs, model fallback, error handling |
| `src/prompt.ts` | The prompts that plan lessons and write Manim code |
| `src/lib/video-style.ts`, `src/lib/thumbnail` | The house style (palette, fonts, layout helpers) and thumbnail rendering |
| `src/lib/e2b.ts` | Talking to the render sandbox |
| `convex` | Database schema and functions for chats and videos |
| `sandbox-templates/eduvids-render` | The E2B template that renders videos. The other folders are older templates |
| `tests` | Node tests (`*.test.ts`) and the Python checks they drive (`*.py`) |
| `docs` | Design notes with before/after renders and scripts to reproduce them |

## Before you open a pull request

Run these and make sure they pass:

```bash
bun run check         # eslint + tsc
bun run test          # node test runner
bun run format:check  # prettier (run format:write to fix)
```

Some tests render with Manim and LaTeX. If `manim` and `xelatex` aren't installed locally, those tests are skipped and the rest still run. If your change touches the house style, the Manim prompts or the sandbox, install them and run the full suite. Better still, render a video or two and attach before/after screenshots.

## Pull requests

- Branch off `main` and keep each PR to one change.
- Write commit messages as plain sentences saying what the change does, for example "Retry a render whose ffmpeg encoder was killed instead of reporting a script error".
- In the PR description, explain what was wrong and how you fixed it. For visual changes, include before/after images or GIFs. For prompt changes, include the topics you tested with.
- Add or update a test when you fix a bug that a test could have caught.
- Don't commit `.env` files or API keys.

## Code of conduct

Be kind and assume good intent. Harassment or personal attacks of any kind aren't tolerated. If something goes wrong, contact the maintainer through [GitHub](https://github.com/namanbnsl) or [X](https://x.com/eduvidsai).

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
