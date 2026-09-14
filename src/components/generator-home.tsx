"use client";

// Hooks
import { useEffect, useState, useTransition } from "react";
import { useChat } from "@ai-sdk/react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useConvexAuth, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

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
import { StyledResponse } from "@/components/ui/styled-response";

// Icons
import { Monitor, Smartphone } from "lucide-react";
import { QuickActionCards } from "@/components/quick-action-cards";
import { generateTopics } from "@/lib/actions/generate-topics";

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
  },
);

// Helpers
const isGenerateVideoToolPart = (
  part: ChatMessagePart,
): part is Extract<GenerateVideoToolUIPart, { type: "tool-generate_video" }> =>
  part.type === "tool-generate_video";

const TOPIC_HISTORY_KEY = "eduvids-recent-topics";

export function GeneratorHome() {
  const [input, setInput] = useState("");
  const [suggestedTopics, setSuggestedTopics] = useState<string[]>([]);
  const [areTopicsLoading, setAreTopicsLoading] = useState(true);
  const [generationMode, setGenerationMode] = useState<
    "video" | "short" | null
  >(null);
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const router = useRouter();
  const { isSignedIn } = useAuth();
  const {
    isAuthenticated: isConvexAuthenticated,
    isLoading: isConvexAuthLoading,
  } = useConvexAuth();
  const createChatWithMessage = useMutation(api.chats.createWithFirstMessage);

  const { messages, status, sendMessage } = useChat<ChatMessage>();
  const hasMessages = messages.length > 0;

  useEffect(() => {
    let isActive = true;

    async function loadTopics() {
      let recentTopics: string[] = [];

      try {
        const storedTopics = JSON.parse(
          window.sessionStorage.getItem(TOPIC_HISTORY_KEY) ?? "[]",
        );
        if (Array.isArray(storedTopics)) {
          recentTopics = storedTopics.filter(
            (topic): topic is string => typeof topic === "string",
          );
        }
      } catch {
        // A malformed or unavailable session store should not block suggestions.
      }

      try {
        const topics = await generateTopics(recentTopics);
        if (!isActive) return;

        setSuggestedTopics(topics);
        window.sessionStorage.setItem(
          TOPIC_HISTORY_KEY,
          JSON.stringify([...recentTopics, ...topics].slice(-12)),
        );
      } catch (error) {
        console.error("Failed to load suggested topics", error);
      } finally {
        if (isActive) setAreTopicsLoading(false);
      }
    }

    void loadTopics();

    return () => {
      isActive = false;
    };
  }, []);

  const handleGenerationModeToggle = (mode: "video" | "short") => {
    setGenerationMode((current) => (current === mode ? null : mode));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const trimmed = input.trim();
    if (!trimmed || isCreatingChat) return;

    setSubmitError(null);

    if (isSignedIn) {
      if (!isConvexAuthenticated) {
        setSubmitError(
          "Your signed-in session is still connecting. Please refresh and try again.",
        );
        return;
      }

      const title =
        trimmed.length > 50 ? trimmed.slice(0, 50) + "..." : trimmed;

      setIsCreatingChat(true);

      try {
        // Single mutation creates chat + first message
        const chatId = await createChatWithMessage({
          title,
          content: trimmed,
          parts: [{ type: "text", text: trimmed }],
        });

        startTransition(() => {
          router.push(
            `/chat/${chatId}?pending=${encodeURIComponent(trimmed)}&mode=${generationMode || ""}`,
          );
        });
      } catch (error) {
        console.error("Failed to create chat", error);
        setSubmitError(
          "We couldn't start this chat. Please refresh and try again.",
        );
        setIsCreatingChat(false);
      }
    } else {
      sendMessage(
        { text: trimmed },
        {
          body: {
            forceVariant: generationMode,
          },
        },
      );

      setInput("");
      setGenerationMode(null);
    }
  };

  return (
    <>
      <div className="relative flex-1 flex flex-col overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
        >
          <div className="absolute inset-0 bg-[radial-gradient(1200px_500px_at_30%_0%,color-mix(in_oklch,var(--foreground)_8%,transparent),transparent_62%),radial-gradient(1000px_420px_at_85%_100%,color-mix(in_oklch,var(--accent)_70%,transparent),transparent_70%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-size-[40px_40px] opacity-[0.18]" />
        </div>

        {hasMessages ? (
          <>
            <div className="flex-1 overflow-y-auto">
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
                                  return (
                                    <div key={i}>Something went wrong</div>
                                  );
                                default:
                                  return (
                                    <div key={i}>Something went wrong</div>
                                  );
                              }
                            }
                            return null;
                          })}
                        </MessageContent>
                        <MessageAvatar
                          src=""
                          name={message.role == "assistant" ? "EV" : "ME"}
                        />
                      </Message>
                    ))}
                  </ConversationContent>
                </Conversation>
              </div>
            </div>

            <div className="mx-auto w-full max-w-7xl px-4 md:px-6 py-4">
              <PromptInput onSubmit={handleSubmit} data-onboarding="composer">
                <PromptInputTextarea
                  onChange={(e) => {
                    setInput(e.target.value);
                    setSubmitError(null);
                  }}
                  value={input}
                  placeholder="Choose a mode and describe the video you want to generate"
                />
                <PromptInputToolbar>
                  <PromptInputTools>
                    <div className="inline-flex" data-onboarding="mode-buttons">
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
                  <div data-onboarding="submit">
                    <PromptInputSubmit
                      disabled={
                        !input.trim() ||
                        isCreatingChat ||
                        (isSignedIn && isConvexAuthLoading)
                      }
                      status={isCreatingChat ? "submitted" : status}
                    />
                  </div>
                </PromptInputToolbar>
              </PromptInput>
              {submitError && (
                <p
                  className="mt-2 text-center text-xs text-destructive"
                  role="alert"
                >
                  {submitError}
                </p>
              )}
              <p className="mt-2 text-center text-xs text-muted-foreground">
                Please avoid sharing personal data—everything submitted here
                will be automatically uploaded publicly to the community YouTube
                channel and X account.
              </p>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center px-4 py-10">
            <div className="w-full max-w-5xl">
              <div className="mb-8 text-center">
                <h1
                  data-onboarding="hero-title"
                  className="mx-auto max-w-3xl text-4xl font-semibold leading-tight tracking-tight text-foreground md:text-6xl"
                >
                  Generate Your Own Video
                </h1>
                <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground md:text-base">
                  Type one clear concept, choose a format, and publish a
                  polished educational video in minutes.
                </p>
              </div>

              <div className="mb-8">
                <PromptInput onSubmit={handleSubmit} data-onboarding="composer">
                  <PromptInputTextarea
                    onChange={(e) => {
                      setInput(e.target.value);
                      setSubmitError(null);
                    }}
                    value={input}
                    placeholder="Describe your video idea here..."
                  />
                  <PromptInputToolbar>
                    <PromptInputTools>
                      <div
                        className="inline-flex"
                        data-onboarding="mode-buttons"
                      >
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
                    <div data-onboarding="submit">
                      <PromptInputSubmit
                        disabled={
                          !input.trim() ||
                          isCreatingChat ||
                          (isSignedIn && isConvexAuthLoading)
                        }
                        status={isCreatingChat ? "submitted" : status}
                      />
                    </div>
                  </PromptInputToolbar>
                </PromptInput>
                {submitError && (
                  <p
                    className="mt-2 text-center text-xs text-destructive"
                    role="alert"
                  >
                    {submitError}
                  </p>
                )}
              </div>

              <div data-onboarding="topic-suggestion">
                <QuickActionCards
                  onCardClick={(text) => {
                    setInput(text);
                  }}
                  topics={suggestedTopics}
                  isLoading={areTopicsLoading}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
