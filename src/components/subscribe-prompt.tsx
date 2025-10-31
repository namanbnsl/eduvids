import { Youtube } from "lucide-react";

const SUBSCRIBE_URL = "https://www.youtube.com/@eduvids-ai?sub_confirmation=1";

const SubscribePrompt = () => {
  return (
    <div className="rounded-lg border border-border/70 bg-background/70 px-4 py-3 shadow-sm">
      <p className="text-sm text-muted-foreground">
        Subscribe to our YouTube channel to get the video <br />
        as soon as it’s automatically uploaded.
      </p>
      <a
        href={SUBSCRIBE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        <Youtube className="size-4" />
        Subscribe on YouTube
      </a>
    </div>
  );
};

export { SubscribePrompt };
