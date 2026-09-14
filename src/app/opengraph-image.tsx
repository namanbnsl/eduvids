import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const alt = "eduvids — AI educational videos, made clear";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const banner = await readFile(
    join(process.cwd(), "public/brand/eduvids-youtube-banner.png"),
    "base64",
  );

  return new ImageResponse(
    <img
      src={`data:image/png;base64,${banner}`}
      alt={alt}
      width={size.width}
      height={size.height}
      style={{ height: "100%", objectFit: "cover", width: "100%" }}
    />,
    size,
  );
}
