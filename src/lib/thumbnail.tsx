import { ImageResponse } from "next/og";
import type { ThumbnailDesign } from "./llm";

const WIDTH = 1280;
const HEIGHT = 720;

export async function renderThumbnail(
  design: ThumbnailDesign,
  frameDataUrls: string[],
): Promise<Buffer> {
  // Replace image placeholders with actual frame URLs in HTML
  let html = design.html;
  frameDataUrls.forEach((url, index) => {
    // Support common placeholder patterns
    html = html.replace(`{{frame_${index}}}`, url);
    html = html.replace(`{frame_${index}}`, url);
    // Also try to replace src="" with first frame as fallback
    if (index === 0) {
      html = html.replace(/src=""/g, `src="${url}"`);
    }
  });

  // Render as JSX with dangerouslySetInnerHTML
  const response = new ImageResponse(
    (
      <div
        style={{
          width: WIDTH,
          height: HEIGHT,
          margin: 0,
          padding: 0,
          boxSizing: "border-box",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        }}
        dangerouslySetInnerHTML={{
          __html: `
            <style>
              * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
              }
              ${design.css}
            </style>
            ${html}
          `,
        }}
      />
    ),
    {
      width: WIDTH,
      height: HEIGHT,
    },
  );

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
