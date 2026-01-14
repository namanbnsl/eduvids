import { serve } from "@upstash/workflow/nextjs";
import { TwitterApi } from "twitter-api-v2";
import { qstashClientWithBypass } from "@/lib/workflow/client";

type XUploadPayload = {
  videoUrl: string;
  title: string;
};

export const { POST } = serve<XUploadPayload>(
  async (context) => {
    const { videoUrl, title } = context.requestPayload;

    await context.run("post-to-x", async () => {
      const twitterClient = new TwitterApi({
        appKey: process.env.X_API_KEY!,
        appSecret: process.env.X_API_KEY_SECRET!,
        accessToken: process.env.X_ACCESS_TOKEN!,
        accessSecret: process.env.X_ACCESS_TOKEN_SECRET!,
      });

      await twitterClient.v2.tweet({
        text: `${title} \n \n \n Generated for free at https://eduvids.vercel.app ${videoUrl}`,
      });
    });

    return { success: true };
  },
  {
    retries: 2,
    qstashClient: qstashClientWithBypass,
  }
);
