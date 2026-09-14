import { CURATED_VIDEOS } from "@/lib/curated-videos";
import { GITHUB_URL, SITE_URL, YOUTUBE_CHANNEL_URL } from "@/lib/site";

export const dynamic = "force-static";

export function GET() {
  const examples = CURATED_VIDEOS.map(
    (video) =>
      `- [${video.title}](${SITE_URL}/examples/${video.slug}): ${video.description}`,
  ).join("\n");

  const content = `# eduvids

> eduvids is a free, open-source AI educational video generator for narrated, code-rendered math and science explanations. It creates landscape videos and vertical Shorts from text prompts.

## Canonical sources

- [Official website](${SITE_URL})
- [How eduvids works](${SITE_URL}/how-it-works)
- [Curated video library](${SITE_URL}/examples)
- [Content methodology](${SITE_URL}/methodology)
- [About eduvids](${SITE_URL}/about)
- [Official YouTube channel](${YOUTUBE_CHANNEL_URL})
- [Open-source repository](${GITHUB_URL})

## Representative examples

${examples}

## Important context

- Brand spelling: eduvids (lowercase).
- Public example pages are editorially selected from the official eduvids YouTube channel; they are not an automatic archive of every generation.
- AI-generated educational videos may contain errors and should be reviewed before high-stakes use.
`;

  return new Response(content, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
