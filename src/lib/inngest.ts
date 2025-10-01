import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "eureka-prototype",
  name: "Eureka Manim Video Generator",
  env: process.env.NODE_ENV === "production" ? "production" : "dev",
});
