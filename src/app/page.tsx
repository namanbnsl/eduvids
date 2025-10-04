"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
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

const ONBOARDING_STORAGE_KEY = "eduvids:onboarding:v1";

export default function ChatPage() {
  const [input, setInput] = useState("");
  const [videoMode, setVideoMode] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const conversationSpotlightRef = useRef<HTMLElement | null>(null);
  const newChatSpotlightRef = useRef<HTMLElement | null>(null);
  const videoToggleSpotlightRef = useRef<HTMLElement | null>(null);
  const composerSpotlightRef = useRef<HTMLElement | null>(null);

  const { messages, status, sendMessage } = useChat();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const text =
      videoMode && input.trim().length > 0
        ? `Generate a video of ${input.trim()}`
        : input;

    sendMessage(
      { text },
      {
        body: {
          model: "gemini-2.5-flash",
          forceGenerateVideo: videoMode === true,
        },
      }
    );

    setInput("");
    setVideoMode(false);
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
          <div ref={newChatSpotlightRef} className="hidden sm:inline-flex">
            <Button variant="outline" size="sm">
              New chat
            </Button>
          </div>
          <Button variant="ghost" size="sm" className="text-zinc-500">
            Settings
          </Button>
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
              {messages.map((message: any) => (
                <Message from={message.role} key={message.id}>
                  <MessageContent>
                    {message.parts?.map((part: any, i: number) => {
                      switch (part.type) {
                        case "text":
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
                        case "tool-generate_video": {
                          const toolPart = part;
                          switch (toolPart.state) {
                            case "input-available":
                              return <div key={i}>Loading video...</div>;
                            case "output-available":
                              return (
                                <div key={i}>
                                  <VideoPlayer {...toolPart.output} />
                                </div>
                              );
                            case "output-error":
                              return (
                                <div key={i}>Error: {toolPart.errorText}</div>
                              );
                            default:
                              return null;
                          }
                        }
                        default:
                          return null;
                      }
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
                videoMode
                  ? "Describe the topic or animation you want to turn into a video"
                  : undefined
              }
            />
            <PromptInputToolbar>
              <PromptInputTools>
                <div ref={videoToggleSpotlightRef} className="inline-flex">
                  <PromptInputButton
                    onClick={() => setVideoMode((v) => !v)}
                    variant={videoMode ? "default" : "ghost"}
                  >
                    Generate Video
                  </PromptInputButton>
                </div>
              </PromptInputTools>
              <PromptInputSubmit disabled={!input} status={status} />
            </PromptInputToolbar>
          </PromptInput>
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

function formatExecutePythonOutput(output: unknown): string {
  if (output === undefined || output === null) {
    return "No output.";
  }

  // If the tool returned a simple string, show it directly
  if (typeof output === "string") {
    return output;
  }

  // If the tool returned a structured payload from e2b
  // Expected shape: { text?: string; results?: unknown; logs?: unknown; error?: unknown }
  const o = output as Record<string, unknown>;
  const text = typeof o.text === "string" ? o.text : undefined;
  const error = o.error as unknown;
  const results = o.results as unknown;
  const logs = o.logs as unknown;
  // Narrow `logs` (unknown) into a typed shape and avoid using `any`
  const logsObj =
    logs && typeof logs === "object"
      ? (logs as { stdout?: unknown[]; stderr?: unknown[] })
      : undefined;

  const stdoutArr =
    logsObj && Array.isArray(logsObj.stdout) ? logsObj.stdout : undefined;
  const stderrArr =
    logsObj && Array.isArray(logsObj.stderr) ? logsObj.stderr : undefined;
  const stdoutText = stdoutArr
    ?.map((x) => String(x))
    .join("")
    ?.trim();
  const stderrText = stderrArr
    ?.map((x) => String(x))
    .join("")
    ?.trim();

  // Show error prominently if present
  if (error) {
    try {
      return `Error:\n\n\`\`\`\n${
        typeof error === "string" ? error : JSON.stringify(error, null, 2)
      }\n\`\`\``;
    } catch {
      return `Error: ${String(error)}`;
    }
  }

  // Prefer stdout text if available
  if (text && text.trim().length > 0) {
    return text;
  }
  if (stdoutText && stdoutText.length > 0) {
    return stdoutText;
  }

  // Otherwise, show results and logs if present
  const sections: string[] = [];
  const hasNonEmptyResults = (() => {
    if (results === undefined || results === null) return false;
    if (Array.isArray(results)) return results.length > 0;
    if (typeof results === "object")
      return Object.keys(results as object).length > 0;
    return true;
  })();
  if (hasNonEmptyResults) {
    try {
      sections.push(
        "Results:\n\n" +
          "```json\n" +
          JSON.stringify(results, null, 2) +
          "\n```"
      );
    } catch {
      sections.push("Results:\n\n" + String(results));
    }
  }
  if (stderrText && stderrText.length > 0) {
    sections.push("Stderr:\n\n" + "```\n" + stderrText + "\n```");
  }

  if (sections.length > 0) {
    return sections.join("\n\n");
  }

  // Fallback to showing the whole object
  try {
    return "```json\n" + JSON.stringify(output, null, 2) + "\n```";
  } catch {
    return String(output);
  }
}
