import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt = "eduvids – AI Educational Video Generator";
export const size = { width: 1200, height: 600 };
export const contentType = "image/png";

export default async function Image() {
  const [logoData, lexendRegular, lexendBold] = await Promise.all([
    readFile(join(process.cwd(), "public/favicon.png"), "base64"),
    readFile(join(process.cwd(), "public/fonts/Lexend-Regular.ttf")),
    readFile(join(process.cwd(), "public/fonts/Lexend-Bold.ttf")),
  ]);

  const logoSrc = `data:image/png;base64,${logoData}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#141413",
          fontFamily: "Lexend",
          position: "relative",
        }}
      >
        {/* Logo + brand row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "28px",
            marginBottom: "24px",
          }}
        >
          <img src={logoSrc} width={100} height={100} />
          <div
            style={{
              fontSize: 80,
              fontWeight: 700,
              letterSpacing: "-2px",
              color: "#ebebea",
              lineHeight: 1,
              display: "flex",
            }}
          >
            eduvids
          </div>
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: 30,
            color: "#a0a09a",
            letterSpacing: "0.3px",
            display: "flex",
          }}
        >
          AI Educational Video Generator
        </div>

        {/* Domain */}
        <div
          style={{
            position: "absolute",
            bottom: "28px",
            fontSize: 18,
            color: "#66665f",
            letterSpacing: "0.5px",
            display: "flex",
          }}
        >
          eduvids.app
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          name: "Lexend",
          data: lexendRegular,
          style: "normal",
          weight: 400,
        },
        {
          name: "Lexend",
          data: lexendBold,
          style: "normal",
          weight: 700,
        },
      ],
    }
  );
}
