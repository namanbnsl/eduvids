"use client";

// Server Actions
import { generateTopics } from "@/lib/actions/generate-topics";

// Hooks
import { useEffect, useState, useTransition } from "react";
import { useChat } from "@ai-sdk/react";
import { useFirstVisit } from "@/lib/use-first-visit";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";

// Components
import { Message, MessageAvatar, MessageContent } from "@/components/message";
import {
  PromptInput,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
  PromptInputButton,
} from "@/components/prompt-input";
import { Conversation, ConversationContent } from "@/components/conversation";
import { QuickActionCards } from "@/components/quick-action-cards";
import { StyledResponse } from "@/components/ui/styled-response";

// Icons
import { Monitor, Smartphone } from "lucide-react";

// Types
import type {
  ChatMessage,
  ChatMessagePart,
  GenerateVideoToolUIPart,
} from "@/lib/types";
import { useAuth } from "@clerk/nextjs";

const VideoPlayer = dynamic(
  () => import("@/components/video-player").then((mod) => mod.VideoPlayer),
  {
    ssr: false,
    loading: () => <div>Loading video...</div>,
  }
);

const Onboarding = dynamic(
  () => import("@/components/onboarding").then((mod) => mod.Onboarding),
  { ssr: false }
);

// Helpers
const isGenerateVideoToolPart = (
  part: ChatMessagePart
): part is Extract<GenerateVideoToolUIPart, { type: "tool-generate_video" }> =>
  part.type === "tool-generate_video";

// Page
export default function HomePage() {
  const [input, setInput] = useState("");
  const [generationMode, setGenerationMode] = useState<
    "video" | "short" | null
  >(null);
  const [topics, setTopics] = useState<string[]>([]);
  const [isLoadingTopics, setIsLoadingTopics] = useState(true);
  const [, startTransition] = useTransition();

  const router = useRouter();
  const { isSignedIn } = useAuth();
  const createChatWithMessage = useMutation(api.chats.createWithFirstMessage);

  const { messages, status, sendMessage } = useChat<ChatMessage>();
  const hasMessages = messages.length > 0;
  const { isFirstVisit, completeOnboarding } = useFirstVisit();

  const handleOnboardingComplete = async (
    message: string | null,
    mode: "video" | "short" | null
  ) => {
    completeOnboarding();
    if (message) {
      if (isSignedIn) {
        const title =
          message.length > 50 ? message.slice(0, 50) + "..." : message;

        // Single mutation creates chat + message
        const chatId = await createChatWithMessage({
          title,
          content: message,
          parts: [{ type: "text", text: message }],
        });

        // Navigate immediately after getting chatId
        startTransition(() => {
          router.push(
            `/chat/${chatId}?pending=${encodeURIComponent(message)}&mode=${mode || ""}`
          );
        });
      } else {
        sendMessage(
          { text: message },
          {
            body: {
              forceVariant: mode,
            },
          }
        );
      }
    }
  };

  const handleGenerationModeToggle = (mode: "video" | "short") => {
    const videoPrefix = "Generate a video of ";
    const shortPrefix = "Generate a short vertical video of ";

    setGenerationMode(mode);
    let newInput = input;

    if (newInput.startsWith(videoPrefix)) {
      newInput = newInput.slice(videoPrefix.length);
    } else if (newInput.startsWith(shortPrefix)) {
      newInput = newInput.slice(shortPrefix.length);
    }

    if (mode === "video") {
      setInput(videoPrefix + newInput);
    } else {
      setInput(shortPrefix + newInput);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const trimmed = input.trim();
    if (!trimmed) return;

    if (isSignedIn) {
      const title = trimmed.length > 50 ? trimmed.slice(0, 50) + "..." : trimmed;

      // Single mutation creates chat + first message
      const chatId = await createChatWithMessage({
        title,
        content: trimmed,
        parts: [{ type: "text", text: trimmed }],
      });

      // Navigate immediately
      startTransition(() => {
        router.push(
          `/chat/${chatId}?pending=${encodeURIComponent(trimmed)}&mode=${generationMode || ""}`
        );
      });
    } else {
      sendMessage(
        { text: trimmed },
        {
          body: {
            forceVariant: generationMode,
          },
        }
      );

      setInput("");
      setGenerationMode(null);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    generateTopics()
      .then(setTopics)
      .finally(() => setIsLoadingTopics(false));
  }, []);

  return (
    <>
      {isFirstVisit && <Onboarding onComplete={handleOnboardingComplete} />}

      <div className="relative flex-1 flex flex-col overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
        >
          <div className="absolute inset-0 bg-[radial-gradient(1200px_500px_at_30%_0%,color-mix(in_oklch,var(--foreground)_8%,transparent),transparent_62%),radial-gradient(1000px_420px_at_85%_100%,color-mix(in_oklch,var(--accent)_70%,transparent),transparent_70%)]" />
          <div className="absolute inset-0 opacity-[0.18] [background-image:linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [background-size:40px_40px]" />
        </div>

        {hasMessages ? (
          <>
            <div className="flex-1 overflow-y-auto animate-in fade-in duration-300">
              <div className="mx-auto w-full max-w-7xl px-4 md:px-6 py-4">
                <Conversation>
                  <ConversationContent>
                    {messages.map((message) => (
                      <Message from={message.role} key={message.id}>
                        <MessageContent>
                          {message.parts?.map((part, i) => {
                            if (part.type === "text") {
                              return (
                                <StyledResponse
                                  key={i}
                                  text={part.text}
                                  role={message.role}
                                />
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
                                  return <div key={i}>Something went wrong</div>;
                                default:
                                  return <div key={i}>Something went wrong</div>;
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

            <div className="mx-auto w-full max-w-7xl px-4 md:px-6 py-4 animate-in slide-in-from-bottom-4 fade-in duration-300">
              <PromptInput onSubmit={handleSubmit} data-onboarding="composer">
                <PromptInputTextarea
                  onChange={(e) => setInput(e.target.value)}
                  value={input}
                  placeholder="Choose a mode and describe the video you want to generate"
                />
                <PromptInputToolbar>
                  <PromptInputTools data-onboarding="mode-buttons">
                    <div className="inline-flex">
                      <div className="inline-flex gap-1">
                        <PromptInputButton
                          onClick={() => handleGenerationModeToggle("video")}
                          variant={
                            generationMode === "video" ? "default" : "outline"
                          }
                        >
                          <Monitor className="size-4" />
                          Video
                        </PromptInputButton>
                        <PromptInputButton
                          onClick={() => handleGenerationModeToggle("short")}
                          variant={
                            generationMode === "short" ? "default" : "outline"
                          }
                        >
                          <Smartphone className="size-4" />
                          Short
                        </PromptInputButton>
                      </div>
                    </div>
                  </PromptInputTools>
                  <PromptInputSubmit
                    disabled={!input}
                    status={status}
                    data-onboarding="submit"
                  />
                </PromptInputToolbar>
              </PromptInput>
              <p className="mt-2 text-center text-xs text-muted-foreground">
                Please avoid sharing personal data—everything submitted here
                will be automatically uploaded publicly to the community YouTube
                channel.
              </p>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center px-4 py-10 animate-in fade-in duration-350">
            <div className="w-full max-w-5xl animate-in slide-in-from-bottom-4 duration-350">
              <div className="text-center mb-8 animate-in fade-in slide-in-from-top-2 duration-350">
                <h1
                  data-onboarding="hero-title"
                  className="mx-auto max-w-3xl text-4xl font-semibold leading-tight tracking-tight text-foreground md:text-6xl"
                >
                  Generate Your Own Video
                </h1>
                <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground md:text-base">
                  Type one clear concept, choose a format, and publish a polished educational video in minutes.
                </p>
              </div>

              <div className="mb-8 animate-in fade-in slide-in-from-bottom-2 duration-350 delay-75">
                <PromptInput onSubmit={handleSubmit} data-onboarding="composer">
                  <PromptInputTextarea
                    onChange={(e) => setInput(e.target.value)}
                    value={input}
                    placeholder="Describe your video idea here..."
                  />
                  <PromptInputToolbar>
                    <PromptInputTools data-onboarding="mode-buttons">
                      <div className="inline-flex">
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
                            <Monitor className="size-4" />
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
                            <Smartphone className="size-4" />
                            Short
                          </PromptInputButton>
                        </div>
                      </div>
                    </PromptInputTools>
                    <PromptInputSubmit
                      disabled={!input}
                      status={status}
                      data-onboarding="submit"
                    />
                  </PromptInputToolbar>
                </PromptInput>
              </div>

              <div className="animate-in fade-in slide-in-from-bottom-2 duration-350 delay-150">
                <QuickActionCards
                  onCardClick={(text) => {
                    const videoPrefix = "Generate a video of ";
                    const shortPrefix = "Generate a short vertical video of ";

                    if (generationMode === "video") {
                      setInput(videoPrefix + text);
                    } else if (generationMode === "short") {
                      setInput(shortPrefix + text);
                    } else {
                      setInput(text);
                    }
                  }}
                  topics={topics}
                  isLoading={isLoadingTopics}
                  onboardingId="topic-suggestion"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
