import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@resvg/resvg-js"],
  // The thumbnail renderer, video style module and fonts are read at runtime
  // and uploaded to the render sandbox, so they must ship with the workflow.
  outputFileTracingIncludes: {
    "/api/workflow/generate-video": [
      "./src/lib/thumbnail/renderer.py",
      "./src/lib/thumbnail/video_style.py",
      "./src/lib/thumbnail/render_driver.py",
      "./src/lib/thumbnail/frame_picker.py",
      "./src/lib/thumbnail/fonts/*",
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
