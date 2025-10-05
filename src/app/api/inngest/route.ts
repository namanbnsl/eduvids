import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest";
import { generateVideo, uploadVideoToYouTube } from "@/lib/inngest-functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [generateVideo, uploadVideoToYouTube],
  streaming: "force",
});
