"use client";

// Server Actions
import { generateTopics } from "@/lib/actions/generate-topics";

// Hooks
import { useCallback, useEffect, useMemo, useState } from "react";
import { useChat } from "@ai-sdk/react";

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
import { VideoPlayer } from "@/components/video-player";
import { QuickActionCards } from "@/components/quick-action-cards";
import { StyledResponse } from "@/components/ui/styled-response";
import { Sidebar } from "@/components/sidebar";

// Icons
import { Monitor, Smartphone, Youtube, Twitter, Github } from "lucide-react";

import { dark } from "@clerk/themes";
import Link from "next/link";

// Types
import type {
  ChatMessage,
  ChatMessagePart,
  GenerateVideoToolUIPart,
} from "@/lib/types";
import {
  Authenticated,
  Unauthenticated,
  useMutation,
  useQuery,
} from "convex/react";
import { Button } from "@/components/ui/button";
import { SignUpButton, useUser } from "@clerk/nextjs";
import { api } from "../../convex/_generated/api";

// Helpers
const isGenerateVideoToolPart = (
  part: ChatMessagePart
): part is Extract<GenerateVideoToolUIPart, { type: "tool-generate_video" }> =>
  part.type === "tool-generate_video";

type SidebarChat = {
  id: string;
  title: string;
  timestamp: Date;
  optimistic?: boolean;
};

type ConvexChatRecord = {
  id: string;
  title?: string | null;
  created_at: number;
  updated_at: number;
};

const chatApi = api as unknown as {
  chat: {
    getChatsByUser: any;
    createNewChat: any;
    deleteChat: any;
    updateChatTitle: any;
  };
};

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
  const [optimisticChats, setOptimisticChats] = useState<SidebarChat[]>([]);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[]>([]);
  const [sidebarError, setSidebarError] = useState<string | null>(null);
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);

  const { messages, status, sendMessage } = useChat<ChatMessage>();
  const hasMessages = messages.length > 0;

  const { user } = useUser();
  const userEmail = user?.primaryEmailAddress?.emailAddress ?? null;
  const userId = user?.id ?? null;

  const chats = useQuery(
    chatApi.chat.getChatsByUser,
    userEmail ? { userEmail } : undefined
  ) as ConvexChatRecord[] | undefined;
  const createChatMutation = useMutation(chatApi.chat.createNewChat);
  const deleteChatMutation = useMutation(chatApi.chat.deleteChat);
  const updateChatTitleMutation = useMutation(chatApi.chat.updateChatTitle);
  const isLoadingChats = !!userEmail && chats === undefined;

  const createChatIfNeeded = useCallback(
    async (title: string) => {
      if (currentChatId) {
        return currentChatId;
      }

      if (!userEmail || !userId) {
        setSidebarError("Please sign in to create a new chat.");
        return null;
      }

      const normalizedTitle = title.trim() || "Untitled chat";
      const now = Date.now();
      const clientId = crypto.randomUUID?.() ?? `temp-${now}`;
      const optimisticChat: SidebarChat = {
        id: clientId,
        title: normalizedTitle,
        timestamp: new Date(now),
        optimistic: true,
      };

      setOptimisticChats((prev) => [optimisticChat, ...prev]);

      try {
        const createdChat = (await createChatMutation({
          userEmail,
          userId,
          title: normalizedTitle,
          created_at: now,
          updated_at: now,
        })) as ConvexChatRecord | null;

        if (createdChat?.id) {
          setOptimisticChats((prev) =>
            prev.map((chat) =>
              chat.id === clientId
                ? {
                  ...chat,
                  id: createdChat.id,
                  timestamp: new Date(createdChat.created_at),
                  optimistic: false,
                }
                : chat
            )
          );
          setCurrentChatId(createdChat.id);
          return createdChat.id;
        }
      } catch (error) {
        console.error("Failed to create chat", error);
        setSidebarError("Couldn't create chat. Please try again.");
        setOptimisticChats((prev) =>
          prev.filter((chat) => chat.id !== clientId)
        );
        return null;
      }

      return clientId;
    },
    [createChatMutation, currentChatId, userEmail, userId]
  );

  useEffect(() => {
    if (!chats) {
      return;
    }
    setOptimisticChats((prev) =>
      prev.filter((optimisticChat) =>
        !chats.some((chat) => chat.id === optimisticChat.id)
      )
    );
  }, [chats]);

  const formattedChats = useMemo<SidebarChat[]>(() => {
    if (!chats) return [];
    return chats.map((chat) => ({
      id: chat.id,
      title: chat.title || "Untitled chat",
      timestamp: new Date(chat.created_at),
    }));
  }, [chats]);

  const combinedChats = useMemo<SidebarChat[]>(() => {
    const seen = new Set<string>();
    const merged: SidebarChat[] = [];

    for (const chat of [...optimisticChats, ...formattedChats]) {
      if (seen.has(chat.id)) {
        continue;
      }
      seen.add(chat.id);
      merged.push(chat);
    }

    return merged.sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
    );
  }, [formattedChats, optimisticChats]);

  const updateChatTitleForCurrentChat = useCallback(
    async (title: string) => {
      if (!currentChatId || !userEmail) {
        return;
      }

      const normalizedTitle = title.trim();
      if (!normalizedTitle) {
        return;
      }

      setOptimisticChats((prev) =>
        prev.map((chat) =>
          chat.id === currentChatId ? { ...chat, title: normalizedTitle } : chat
        )
      );

      try {
        await updateChatTitleMutation({
          userEmail,
          chatId: currentChatId,
          title: normalizedTitle,
        });
      } catch (error) {
        console.error("Failed to update chat title", error);
        setSidebarError("Couldn't update chat title. Please try again.");
      }
    },
    [currentChatId, updateChatTitleMutation, userEmail]
  );

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

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();

      const trimmed = input.trim();
      if (!trimmed) return;

      const chatId = await createChatIfNeeded(trimmed);
      if (!chatId) {
        return;
      }

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

      void updateChatTitleForCurrentChat(trimmed);
    },
    [createChatIfNeeded, generationMode, input, sendMessage, updateChatTitleForCurrentChat]
  );

  const handleNewChat = useCallback(async () => {
    if (!userEmail || !userId) {
      setSidebarError("Please sign in to create a new chat.");
      return;
    }

    setSidebarError(null);
    const clientId = crypto.randomUUID?.() ?? `temp-${Date.now()}`;
    const now = Date.now();
    const optimisticChat: SidebarChat = {
      id: clientId,
      title: "Untitled chat",
      timestamp: new Date(now),
      optimistic: true,
    };

    setOptimisticChats((prev) => [optimisticChat, ...prev]);
    setIsCreatingChat(true);

    try {
      const createdChat = (await createChatMutation({
        userEmail,
        userId,
        title: optimisticChat.title,
        created_at: now,
        updated_at: now,
      })) as ConvexChatRecord | null;

      if (createdChat?.id) {
        setOptimisticChats((prev) =>
          prev.map((chat) =>
            chat.id === clientId
              ? {
                ...chat,
                id: createdChat.id,
                timestamp: new Date(createdChat.created_at),
              }
              : chat
          )
        );
        setCurrentChatId((prev) =>
          prev === clientId || prev === null ? createdChat.id : prev
        );
      }
    } catch (error) {
      console.error("Failed to create chat", error);
      setSidebarError("Couldn't create chat. Please try again.");
      setOptimisticChats((prev) => prev.filter((chat) => chat.id !== clientId));
    } finally {
      setIsCreatingChat(false);
    }
  }, [createChatMutation, userEmail, userId]);

  const handleSelectChat = useCallback((chatId: string) => {
    setCurrentChatId(chatId);
    setSidebarOpen(false);
  }, []);

  const handleDeleteChat = useCallback(
    async (chatId: string) => {
      if (!userEmail) {
        setSidebarError("Please sign in to delete chats.");
        return;
      }

      let removedOptimistic: SidebarChat | null = null;
      setOptimisticChats((prev) => {
        const match = prev.find((chat) => chat.id === chatId);
        if (match) {
          removedOptimistic = match;
          return prev.filter((chat) => chat.id !== chatId);
        }
        return prev;
      });

      if (removedOptimistic) {
        return;
      }

      setPendingDeleteIds((prev) => [...prev, chatId]);
      setSidebarError(null);

      try {
        const result = await deleteChatMutation({ chatId, userEmail });
        if (!result?.success) {
          throw new Error("Delete failed");
        }
        if (currentChatId === chatId) {
          setCurrentChatId(null);
        }
      } catch (error) {
        console.error("Failed to delete chat", error);
        setSidebarError("Couldn't delete chat. Please try again.");
      } finally {
        setPendingDeleteIds((prev) =>
          prev.filter((pendingId) => pendingId !== chatId)
        );
      }
    },
    [currentChatId, deleteChatMutation, userEmail]
  );

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

  return (
    <div className="relative flex h-svh bg-background">
      <Authenticated>
        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          isCollapsed={sidebarCollapsed}
          onCollapsedChange={setSidebarCollapsed}
          chatHistory={combinedChats}
          currentChatId={currentChatId ?? undefined}
          onNewChat={handleNewChat}
          onSelectChat={handleSelectChat}
          onDeleteChat={handleDeleteChat}
          isLoadingHistory={isLoadingChats}
          isCreatingChat={isCreatingChat}
          pendingDeleteIds={pendingDeleteIds}
          errorMessage={sidebarError}
          canCreateChat={hasMessages}
        />
      </Authenticated>
      <div className="flex-1 flex flex-col overflow-hidden">
        <Unauthenticated>
          <div className="flex justify-between items-center px-6 py-4 border-b border-border/50 bg-background/50 backdrop-blur-sm">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-semibold text-foreground truncate">
                eduvids
              </span>
            </div>
            <div className="flex gap-2 items-center">
              <Link
                target="_blank"
                href="https://www.youtube.com/@eduvids-ai"
                aria-label="YouTube"
              >
                <button className="p-2 rounded-lg text-foreground/70 hover:bg-accent/50 hover:text-foreground transition-colors cursor-pointer">
                  <Youtube className="size-5" />
                </button>
              </Link>
              <Link
                target="_blank"
                href="https://www.x.com/eduvidsai"
                aria-label="X"
              >
                <button className="p-2 rounded-lg text-foreground/70 hover:bg-accent/50 hover:text-foreground transition-colors cursor-pointer">
                  <Twitter className="size-5" />
                </button>
              </Link>
              <Link
                target="_blank"
                href="https://github.com/namanbnsl/eduvids"
                aria-label="GitHub"
              >
                <button className="p-2 rounded-lg text-foreground/70 hover:bg-accent/50 hover:text-foreground transition-colors cursor-pointer">
                  <Github className="size-5" />
                </button>
              </Link>
              <div className="w-px h-6 bg-border/30" />
              <SignUpButton
                mode="modal"
                appearance={{
                  theme: dark,
                  variables: { fontFamily: "Geist" },
                }}
              >
                <Button size="sm">Sign Up for Advanced Features</Button>
              </SignUpButton>
            </div>
          </div>
        </Unauthenticated>

        <div className="flex-1 flex flex-col overflow-hidden">
          {hasMessages ? (
            <>
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
                                    return null;
                                }
                              }

                              return null;
                            })}
                          </MessageContent>
                          <MessageAvatar
                            src=""
                            name={message.role === "assistant" ? "AI" : "ME"}
                          />
                        </Message>
                      ))}
                    </ConversationContent>
                  </Conversation>
                </div>
              </div>

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
                    Generate Your Own Video
                  </h1>
                  <p className="text-md text-muted-foreground font-light">
                    Transform your ideas into stunning animated videos powered
                    by AI for free.
                  </p>
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
