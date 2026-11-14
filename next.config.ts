import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@resvg/resvg-js"],
  // The video house style, render driver, thumbnail renderer and fonts are
  // read at runtime and uploaded to the render sandbox, so they must ship
  // with the workflow.
  outputFileTracingIncludes: {
    "/api/workflow/generate-video": [
      "./src/lib/video-render/video_style.py",
      "./src/lib/video-render/render_driver.py",
      "./src/lib/thumbnail/renderer.py",
      "./src/lib/fonts/*",
    ],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "i.ytimg.com",
        pathname: "/vi/**",
      },
    ],
  },
  async rewrites() {
    return [
      {
        source: "/ph/static/:path*",
        destination: "https://us-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/ph/:path*",
        destination: "https://us.i.posthog.com/:path*",
      },
    ];
  },
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
