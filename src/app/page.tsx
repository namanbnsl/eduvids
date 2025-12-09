"use client";

// Server Actions
import { generateTopics } from "@/lib/actions/generate-topics";

// Hooks
import { useEffect, useState } from "react";
import { useChat } from "@ai-sdk/react";

// Components
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
import { Conversation, ConversationContent } from "@/components/conversation";
import { VideoPlayer } from "@/components/video-player";
import { QuickActionCards } from "@/components/quick-action-cards";
import { StyledResponse } from "@/components/ui/styled-response";
import { Sidebar } from "@/components/sidebar";

// Icons
import {
  Github,
  Youtube,
  Moon,
  Sun,
  Monitor,
  Smartphone,
  Video,
  TwitterIcon,
} from "lucide-react";

// Types
import type {
  ChatMessage,
  ChatMessagePart,
  GenerateVideoToolUIPart,
} from "@/lib/types";

// Helpers
const isGenerateVideoToolPart = (
  part: ChatMessagePart
): part is Extract<GenerateVideoToolUIPart, { type: "tool-generate_video" }> =>
  part.type === "tool-generate_video";

// Page
export default function ChatPage() {
  const [input, setInput] = useState("");
  const [generationMode, setGenerationMode] = useState<
    "video" | "short" | null
  >(null);
  const [isDark, setIsDark] = useState(false);
  const [topics, setTopics] = useState<string[]>([]);
  const [isLoadingTopics, setIsLoadingTopics] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const { messages, status, sendMessage } = useChat<ChatMessage>();
  const hasMessages = messages.length > 0;

  const handleGenerationModeToggle = (mode: "video" | "short") => {
    const videoPrefix = "Generate a video of ";
    const shortPrefix = "Generate a short vertical video of ";

    setGenerationMode(mode);
    let newInput = input;

    // Remove old prefix if exists
    if (newInput.startsWith(videoPrefix)) {
      newInput = newInput.slice(videoPrefix.length);
    } else if (newInput.startsWith(shortPrefix)) {
      newInput = newInput.slice(shortPrefix.length);
    }

    // Add new prefix
    if (mode === "video") {
      setInput(videoPrefix + newInput);
    } else {
      setInput(shortPrefix + newInput);
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const trimmed = input.trim();
    if (!trimmed) return;

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
  };

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    // Sync theme state
    const isDarkMode = document.documentElement.classList.contains("dark");
    setIsDark(isDarkMode);

    generateTopics()
      .then(setTopics)
      .finally(() => setIsLoadingTopics(false));
  }, []);

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

  return (
    <div className="relative flex h-svh bg-background">
      {/* <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        isCollapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
        chatHistory={[]}
        onNewChat={() => {}}
        onSelectChat={() => {}}
        onDeleteChat={() => {}}
      /> */}
      <div className="flex-1 flex flex-col overflow-hidden">
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
              {isDark ? (
                <Sun className="size-5" />
              ) : (
                <Moon className="size-5" />
              )}
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
              href="https://www.x.com/eduvidsai"
              aria-label="YouTube"
              className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <TwitterIcon className="size-5" />
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
              <div className="flex-1 overflow-y-auto animate-in fade-in duration-500">
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
                                return (
                                  <div key={i}>
                                    We are working to fix a few issues in the
                                    app. Please try after a few days.{" "}
                                  </div>
                                );
                                // switch (part.state) {
                                //   case "input-available":
                                //     return <div key={i}>Loading video...</div>;
                                //   case "output-available":
                                //     return (
                                //       <div key={i}>
                                //         <VideoPlayer {...part.output} />
                                //       </div>
                                //     );
                                //   case "output-error":
                                //     return (
                                //       <div key={i}>Something went wrong</div>
                                //     );
                                //   default:
                                //     return null;
                                // }
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

              {/* Input at bottom */}
              <div className="mx-auto w-full max-w-7xl px-4 md:px-6 py-4 animate-in slide-in-from-bottom-4 fade-in duration-500">
                <PromptInput onSubmit={handleSubmit}>
                  <PromptInputTextarea
                    onChange={(e) => setInput(e.target.value)}
                    value={input}
                    placeholder="Choose a mode and describe the video you want to generate"
                  />
                  <PromptInputToolbar>
                    <PromptInputTools>
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
                    <PromptInputSubmit disabled={!input} status={status} />
                  </PromptInputToolbar>
                </PromptInput>
                <p className="mt-2 text-center text-xs text-muted-foreground">
                  Please avoid sharing personal data—everything submitted here
                  will be automatically uploaded publicly to the community
                  YouTube channel.
                </p>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center px-4 animate-in fade-in duration-700">
              <div className="w-full max-w-5xl animate-in slide-in-from-bottom-4 duration-700">
                <div className="text-center mb-8 animate-in fade-in slide-in-from-top-2 duration-700">
                  <h1 className="text-4xl md:text-5xl font-semibold text-foreground mb-2 leading-tight">
                    <span className="text-cyan-400">
                      <Video className="inline-block size-12 mb-1" />
                    </span>{" "}
                    Generate Your Own Video.
                  </h1>
                </div>

                <div className="mb-8 animate-in fade-in slide-in-from-bottom-2 duration-700 delay-100">
                  <PromptInput onSubmit={handleSubmit}>
                    <PromptInputTextarea
                      onChange={(e) => setInput(e.target.value)}
                      value={input}
                      placeholder="Choose a mode (Video or Short) and describe your topic"
                    />
                    <PromptInputToolbar>
                      <PromptInputTools>
                        <div className="inline-flex">
                          <div className="inline-flex gap-1">
                            <PromptInputButton
                              onClick={() =>
                                setGenerationMode((mode) =>
                                  mode === "video" ? null : "video"
                                )
                              }
                              variant={
                                generationMode === "video"
                                  ? "default"
                                  : "outline"
                              }
                            >
                              {" "}
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
                                generationMode === "short"
                                  ? "default"
                                  : "outline"
                              }
                            >
                              <Smartphone className="size-4" />
                              Short
                            </PromptInputButton>
                          </div>
                        </div>
                      </PromptInputTools>
                      <PromptInputSubmit disabled={!input} status={status} />
                    </PromptInputToolbar>
                  </PromptInput>
                </div>

                <div className="animate-in fade-in slide-in-from-bottom-2 duration-700 delay-200">
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
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
