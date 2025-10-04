import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "eduvids",
  name: "eduvids",
  env: process.env.NODE_ENV === "production" ? "production" : "dev",
});
