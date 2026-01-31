import posthog from "posthog-js";

if (process.env.NODE_ENV === "production") {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
    api_host: "/ph",
    ui_host: "https://us.posthog.com",
  });
}
