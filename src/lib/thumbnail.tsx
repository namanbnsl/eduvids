import { ImageResponse } from "next/og";
import type { ThumbnailDesign } from "./llm";

const WIDTH = 1280;
const HEIGHT = 720;

export async function renderThumbnail(
  design: ThumbnailDesign,
  frameDataUrls: string[],
): Promise<Buffer> {
  const hasFrames = frameDataUrls.length > 0;
  const isSplit = design.layout === "split" && hasFrames;

  const response = new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: isSplit ? "row" : "column",
          alignItems: "center",
          justifyContent: "center",
          width: WIDTH,
          height: HEIGHT,
          backgroundColor: design.backgroundColor,
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          padding: 60,
        }}
      >
        {/* Text section */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems:
              design.layout === "left-aligned" ? "flex-start" : "center",
            justifyContent: "center",
            flex: isSplit ? 1 : undefined,
            textAlign:
              design.layout === "left-aligned" ? "left" : "center",
          }}
        >
          <div
            style={{
              fontSize: 64,
              fontWeight: 700,
              color: design.textColor,
              lineHeight: 1.1,
              maxWidth: isSplit ? 500 : 1000,
            }}
          >
            {design.title}
          </div>
          {design.subtitle ? (
            <div
              style={{
                fontSize: 32,
                fontWeight: 400,
                color: design.accentColor,
                marginTop: 20,
                maxWidth: isSplit ? 500 : 800,
              }}
            >
              {design.subtitle}
            </div>
          ) : null}
        </div>

        {/* Frame section */}
        {hasFrames && (
          <div
            style={{
              display: "flex",
              flexDirection: isSplit ? "column" : "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 16,
              marginTop: isSplit ? 0 : 40,
              marginLeft: isSplit ? 40 : 0,
              flex: isSplit ? 1 : undefined,
            }}
          >
            {frameDataUrls.map((url, i) => (
              <img
                key={i}
                src={url}
                width={isSplit ? 400 : 280}
                height={isSplit ? 225 : 158}
                style={{
                  borderRadius: 8,
                  border: `2px solid ${design.accentColor}`,
                  objectFit: "cover",
                }}
              />
            ))}
          </div>
        )}

        {/* Accent bar */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            width: WIDTH,
            height: 6,
            backgroundColor: design.accentColor,
          }}
        />
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
    },
  );

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
