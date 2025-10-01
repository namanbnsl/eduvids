import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "scimath-vids",
  name: "Educational Video Generator",
  env: process.env.NODE_ENV === "production" ? "production" : "dev",
});
