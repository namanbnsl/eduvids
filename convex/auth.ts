import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { components } from "./_generated/api";
import { DataModel } from "./_generated/dataModel";
// import { query } from "./_generated/server";
import { betterAuth } from "better-auth";

const siteUrl = process.env.SITE_URL!;

// @ts-ignore next-line
export const authComponent = createClient<DataModel>(components.betterAuth);

export const createAuth = (
  ctx: GenericCtx<DataModel>,
  { optionsOnly } = { optionsOnly: false }
) => {
  return betterAuth({
    logger: {
      disabled: optionsOnly,
    },
    baseURL: siteUrl,
    database: authComponent.adapter(ctx),
    socialProviders: {
      google: {
        prompt: "select_account",
        clientId: process.env.GOOGLE_CLIENT_ID as string, // TODO: set up env vars
        clientSecret: process.env.GOOGLE_CLIENT_SECRET as string, // TODO: set up env vars
      },
      github: {
        clientId: process.env.GITHUB_CLIENT_ID as string, // TODO: set up env vars
        clientSecret: process.env.GITHUB_CLIENT_SECRET as string, // TODO: set up env vars
      },
    },
    plugins: [convex()],
  });
};

// export const getCurrentUser = query({
//   args: {},
//   handler: async (ctx) => {
//     return authComponent.getAuthUser(ctx);
//   },
// });
