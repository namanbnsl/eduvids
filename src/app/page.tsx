"use client";

import type React from "react";

import { useEffect, useMemo, useRef, useState } from "react";
import { generateTopics } from "@/lib/actions/generate-topics";
import Link from "next/link";
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
import { Github, Youtube, Moon, Sun } from "lucide-react";
import type { ToolUIPart, UIDataTypes, UIMessage } from "ai";
import type { JobStatus } from "@/components/video-player";
import { QuickActionCards } from "@/components/quick-action-cards";

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
  const [isDark, setIsDark] = useState(false);
  const [topics, setTopics] = useState<string[]>([]);
  const [isLoadingTopics, setIsLoadingTopics] = useState(true);

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

    // Sync theme state with the class already applied by the inline script
    const isDarkMode = document.documentElement.classList.contains("dark");
    setIsDark(isDarkMode);

    // Hide loading screen
    const loadingScreen = document.getElementById("loading-screen");
    if (loadingScreen) {
      loadingScreen.style.display = "none";
    }

    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "1");
    const seen = window.localStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (!seen) {
      setShowOnboarding(true);
    }

    generateTopics()
      .then(setTopics)
      .finally(() => setIsLoadingTopics(false));
  }, []);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && generationMode) {
        setGenerationMode(null);
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (generationMode && videoToggleSpotlightRef.current) {
        const target = e.target as Node;
        if (!videoToggleSpotlightRef.current.contains(target)) {
          setGenerationMode(null);
        }
      }
    };

    document.addEventListener("keydown", handleEscape);
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [generationMode]);

  const toggleTheme = () => {
    const newIsDark = !isDark;
    setIsDark(newIsDark);
    if (newIsDark) {
      document.documentElement.classList.add("dark");
      window.localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      window.localStorage.setItem("theme", "light");
    }
  };

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

  const hasMessages = messages.length > 0;

  return (
    <div className="relative flex flex-col h-svh bg-background">
      {/* Background wash */}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_left,rgba(120,120,255,0.05),transparent_50%)]" />

      {/* Top bar */}
      <header className="flex items-center justify-between gap-3 px-4 md:px-6 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="font-mono text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            eduvids
          </Link>
          <span className="hidden md:inline text-muted-foreground">/</span>
          <span className="hidden md:inline text-sm text-muted-foreground">
            Chat
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleTheme}
            aria-label="Toggle dark mode"
            className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            {isDark ? <Sun className="size-5" /> : <Moon className="size-5" />}
          </button>
          <Link
            target="_blank"
            href="https://www.youtube.com/@eduvids-ai"
            aria-label="YouTube"
            className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <Youtube className="size-5" />
          </Link>
          <Link
            target="_blank"
            href="https://github.com/namanbnsl/eduvids"
            aria-label="GitHub"
            className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <Github className="size-5" />
          </Link>
        </div>
      </header>

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {hasMessages ? (
          <>
            {/* Messages area */}
            <div
              ref={conversationSpotlightRef}
              className="flex-1 overflow-y-auto animate-in fade-in duration-500"
            >
              <div className="mx-auto w-full max-w-7xl px-4 md:px-6 py-4">
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
        [&>pre]:bg-muted [&>pre]:text-foreground

        [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-sm
        [&_code]:bg-muted [&_code]:text-foreground

        [&>blockquote]:my-4 [&>blockquote]:pl-4 [&>blockquote]:border-l-4
        [&>blockquote]:border-border
        [&>blockquote]:italic [&>blockquote]:text-muted-foreground

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
                                  return (
                                    <div key={i}>Error: {part.errorText}</div>
                                  );
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
            </div>

            {/* Input at bottom with smooth transition */}
            <div
              className="mx-auto w-full max-w-7xl px-4 md:px-6 py-4 animate-in slide-in-from-bottom-4 fade-in duration-500"
              ref={composerSpotlightRef}
            >
              <PromptInput onSubmit={handleSubmit}>
                <PromptInputTextarea
                  onChange={(e) => setInput(e.target.value)}
                  value={input}
                  placeholder={
                    generationMode === "video"
                      ? "Describe the topic or animation you want to turn into a video"
                      : generationMode === "short"
                      ? "Describe the topic for your vertical short"
                      : "Choose a mode and describe the video you want to generate"
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
                Please avoid sharing personal data—everything submitted here
                will be uploaded to the community YouTube channel.
              </p>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center px-4 animate-in fade-in duration-700">
            <div className="w-full max-w-5xl animate-in slide-in-from-bottom-4 duration-700">
              {/* Greeting */}
              <div className="text-center mb-8 animate-in fade-in slide-in-from-top-2 duration-700">
                <h1 className="text-4xl md:text-5xl font-semibold text-foreground mb-2 leading-tight">
                  <span className="text-orange-500">📺</span> Generate Your Own
                  Video.
                </h1>
              </div>

              {/* Centered input */}
              <div
                ref={composerSpotlightRef}
                className="mb-8 animate-in fade-in slide-in-from-bottom-2 duration-700 delay-100"
              >
                <PromptInput onSubmit={handleSubmit}>
                  <PromptInputTextarea
                    onChange={(e) => setInput(e.target.value)}
                    value={input}
                    placeholder="Choose a mode and describe the video you want to generate."
                  />
                  <PromptInputToolbar>
                    <PromptInputTools>
                      <div
                        ref={videoToggleSpotlightRef}
                        className="inline-flex"
                      >
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
              </div>

              {/* Quick action cards */}
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-700 delay-200">
                <QuickActionCards 
                  onCardClick={(text) => setInput(text)} 
                  topics={topics} 
                  isLoading={isLoadingTopics}
                />
              </div>
            </div>
          </div>
        )}
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
