"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Separator } from "@/components/ui/separator";
import { Message, MessageAvatar, MessageContent } from "@/components/message";
import {
  PromptInput,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
  PromptInputButton,
} from "@/components/prompt-input";
import { useChat } from "@ai-sdk/react";
import { Response } from "@/components/response";
import { Conversation, ConversationContent } from "@/components/conversation";
import { VideoPlayer } from "@/components/video-player";
import {
  OnboardingTour,
  type OnboardingStep,
} from "@/components/onboarding-tour";
import { Github, Youtube } from "lucide-react";
import type { ToolUIPart, UIDataTypes, UIMessage } from "ai";
import type { JobStatus } from "@/components/video-player";

const ONBOARDING_STORAGE_KEY = "eduvids:onboarding:v1";

type ExecutePythonToolOutput = {
  text?: string;
  results?: unknown;
  logs?: unknown;
  error?: unknown;
};

type GenerateVideoToolOutput = {
  jobId: string;
  description: string;
  status?: JobStatus;
  src?: string;
  videoUrl?: string;
  error?: string;
  details?: string;
  progress?: number;
  step?: string;
  variant?: "video" | "short";
};

type AppTools = {
  execute_python: {
    input: { code: string };
    output: ExecutePythonToolOutput;
  };
  generate_video: {
    input: { description: string };
    output: GenerateVideoToolOutput;
  };
};

type ChatMessage = UIMessage<unknown, UIDataTypes, AppTools>;
type ChatMessagePart = ChatMessage["parts"][number];
type GenerateVideoToolUIPart = ToolUIPart<AppTools>;

const isGenerateVideoToolPart = (
  part: ChatMessagePart
): part is Extract<GenerateVideoToolUIPart, { type: "tool-generate_video" }> =>
  part.type === "tool-generate_video";

export default function ChatPage() {
  const [input, setInput] = useState("");
  const [generationMode, setGenerationMode] = useState<
    "video" | "short" | null
  >(null);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const conversationSpotlightRef = useRef<HTMLDivElement | null>(null);
  const newChatSpotlightRef = useRef<HTMLDivElement | null>(null);
  const videoToggleSpotlightRef = useRef<HTMLDivElement | null>(null);
  const composerSpotlightRef = useRef<HTMLDivElement | null>(null);

  const { messages, status, sendMessage } = useChat<ChatMessage>();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const trimmed = input.trim();
    const mode = generationMode;
    const text =
      mode === "video" && trimmed.length > 0
        ? `Generate a video of ${trimmed}`
        : mode === "short" && trimmed.length > 0
        ? `Generate a short vertical video of ${trimmed}`
        : input;

    sendMessage(
      { text },
      {
        body: {
          model: "gemini-2.5-flash",
          forceVariant: mode,
        },
      }
    );

    setInput("");
    setGenerationMode(null);
  };

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "1");
    const seen = window.localStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (!seen) {
      setShowOnboarding(true);
    }
  }, []);

  const onboardingSteps = useMemo<OnboardingStep[]>(
    () => [
      {
        id: "conversation",
        title: "Follow the conversation",
        description:
          'This stream keeps every question and answer together so you can review context at a glance. Example: Revisit a response after asking "Summarize Galileo\'s experiments in two sentences."',
        target: conversationSpotlightRef,
        placement: "right",
        spotlightPadding: 28,
      },
      {
        id: "new-chat",
        title: "Start fresh anytime",
        description:
          'Kick off a new idea without losing your current thread. Example: Launch a clean session to explore "Design a lab on projectile motion."',
        target: newChatSpotlightRef,
        placement: "bottom",
      },
      {
        id: "video-mode",
        title: "Turn prompts into videos",
        description:
          'Toggle video mode to have responses rendered as animations tailored to your topic. Example: Request "Animate the phases of mitosis with labeled steps."',
        target: videoToggleSpotlightRef,
        placement: "top",
      },
      {
        id: "composer",
        title: "Compose with guidance",
        description:
          'Draft questions here, submit with Enter, and lean on Shift+Enter for multi-line prompts. Example: Draft "Compare energy transfer in conduction, convection, and radiation with bullet points."',
        target: composerSpotlightRef,
        placement: "top",
        spotlightPadding: 24,
      },
    ],
    [
      conversationSpotlightRef,
      newChatSpotlightRef,
      videoToggleSpotlightRef,
      composerSpotlightRef,
    ]
  );

  const handleOnboardingClose = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "1");
    }
    setShowOnboarding(false);
  };

  return (
    <div className="relative flex flex-col h-svh">
      {/* Background wash */}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_left,rgba(120,120,255,0.05),transparent_50%)]" />
      {/* Top bar */}
      <header className="flex items-center justify-between gap-3 px-4 md:px-6 py-4 border-b border-zinc-200/70 dark:border-zinc-800/70">
        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="font-mono text-xs text-zinc-500 hover:text-foreground transition-colors"
          >
            eduvids
          </Link>
          <span className="hidden md:inline text-zinc-400">/</span>
          <span className="hidden md:inline text-xs text-zinc-500">Chat</span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="https://www.youtube.com/@eduvids-ai"
            aria-label="YouTube"
            className="rounded-full p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-foreground dark:hover:bg-zinc-800"
          >
            <Youtube className="size-4" />
          </Link>
          <Link
            href="https://github.com/namanbnsl/eduvids"
            aria-label="GitHub"
            className="rounded-full p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-foreground dark:hover:bg-zinc-800"
          >
            <Github className="size-4" />
          </Link>
        </div>
      </header>
      {/* Chat area */}
      <div
        className={`mx-auto w-full max-w-7xl flex-1 px-4 md:px-6 flex flex-col`}
      >
        <div
          ref={conversationSpotlightRef}
          className="relative flex flex-1 flex-col"
        >
          <Conversation>
            <ConversationContent>
              {messages.map((message) => (
                <Message from={message.role} key={message.id}>
                  <MessageContent>
                    {message.parts?.map((part, i) => {
                      if (part.type === "text") {
                        return (
                          <Response
                            key={`${message.id}-${i}`}
                            className={`
        max-w-none text-base leading-relaxed break-words ${
          message.role == "assistant" ? "p-4" : ""
        } rounded-lg

        /* Direct element styling */
        [&>h1]:mt-6 [&>h1]:mb-4 [&>h1]:font-bold [&>h1]:text-xl
        [&>h2]:mt-5 [&>h2]:mb-3 [&>h2]:font-bold [&>h2]:text-lg
        [&>h3]:mt-4 [&>h3]:mb-2 [&>h3]:font-semibold [&>h3]:text-base
        [&>h4]:mt-3 [&>h4]:mb-2 [&>h4]:font-medium

        [&>p]:my-3 [&>p]:leading-relaxed

        [&>ul]:my-3 [&>ul]:pl-6 [&>ul]:list-disc [&>ul]:space-y-1
        [&>ol]:my-3 [&>ol]:pl-6 [&>ol]:list-decimal [&>ol]:space-y-1
        [&_li]:leading-relaxed

        [&>pre]:my-4 [&>pre]:p-4 [&>pre]:rounded-lg [&>pre]:overflow-x-auto
        [&>pre]:bg-zinc-800 [&>pre]:text-zinc-100

        [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-sm
        [&_code]:bg-zinc-200 dark:[&_code]:bg-zinc-700

        [&>blockquote]:my-4 [&>blockquote]:pl-4 [&>blockquote]:border-l-4
        [&>blockquote]:border-zinc-300 dark:[&>blockquote]:border-zinc-600
        [&>blockquote]:italic [&>blockquote]:text-zinc-600 dark:[&>blockquote]:text-zinc-400

        [&_.math-display]:my-4 [&_.math-display]:text-center
        [&_.math-inline]:mx-1
      `}
                          >
                            {part.text}
                          </Response>
                        );
                      }

                      if (isGenerateVideoToolPart(part)) {
                        switch (part.state) {
                          case "input-available":
                            return <div key={i}>Loading video...</div>;
                          case "output-available":
                            return (
                              <div key={i}>
                                <VideoPlayer {...part.output} />
                              </div>
                            );
                          case "output-error":
                            return <div key={i}>Error: {part.errorText}</div>;
                          default:
                            return null;
                        }
                      }

                      return null;
                    })}
                  </MessageContent>
                  <MessageAvatar
                    src=""
                    name={message.role == "assistant" ? "AI" : "ME"}
                  />
                </Message>
              ))}
            </ConversationContent>
          </Conversation>
        </div>

        <Separator />

        {/* Composer */}
        <div className="w-full py-4" ref={composerSpotlightRef}>
          <PromptInput onSubmit={handleSubmit} className="mt-4">
            <PromptInputTextarea
              onChange={(e) => setInput(e.target.value)}
              value={input}
              placeholder={
                generationMode === "video"
                  ? "Describe the topic or animation you want to turn into a video"
                  : generationMode === "short"
                  ? "Describe the topic for your vertical short"
                  : undefined
              }
            />
            <PromptInputToolbar>
              <PromptInputTools>
                <div ref={videoToggleSpotlightRef} className="inline-flex">
                  <div className="inline-flex gap-1">
                    <PromptInputButton
                      onClick={() =>
                        setGenerationMode((mode) =>
                          mode === "video" ? null : "video"
                        )
                      }
                      variant={
                        generationMode === "video" ? "default" : "outline"
                      }
                    >
                      Video
                    </PromptInputButton>
                    <PromptInputButton
                      onClick={() =>
                        setGenerationMode((mode) =>
                          mode === "short" ? null : "short"
                        )
                      }
                      variant={
                        generationMode === "short" ? "default" : "outline"
                      }
                    >
                      Short
                    </PromptInputButton>
                  </div>
                </div>
              </PromptInputTools>
              <PromptInputSubmit disabled={!input} status={status} />
            </PromptInputToolbar>
          </PromptInput>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Please avoid sharing personal data—everything submitted here will be
            uploaded to the community YouTube channel.
          </p>
        </div>
      </div>

      {showOnboarding ? (
        <OnboardingTour
          steps={onboardingSteps}
          onClose={handleOnboardingClose}
        />
      ) : null}
    </div>
  );
}
