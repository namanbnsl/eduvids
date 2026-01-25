"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, use, useRef } from "react";
import { useChat } from "@ai-sdk/react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";

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
import { StyledResponse } from "@/components/ui/styled-response";
import { SidebarLayout } from "@/components/sidebar";
import { Skeleton } from "@/components/ui/skeleton";

import { Monitor, Smartphone } from "lucide-react";

import type {
  ChatMessage,
  ChatMessagePart,
  GenerateVideoToolUIPart,
} from "@/lib/types";

const isGenerateVideoToolPart = (
  part: ChatMessagePart
): part is Extract<GenerateVideoToolUIPart, { type: "tool-generate_video" }> =>
  part.type === "tool-generate_video";

interface ChatPageContentProps {
  chatId: Id<"chats">;
}

function ChatPageContent({ chatId }: ChatPageContentProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [input, setInput] = useState("");
  const [generationMode, setGenerationMode] = useState<
    "video" | "short" | null
  >(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const hasSentPendingMessage = useRef(false);

  const chat = useQuery(api.chats.get, { id: chatId });
  const storedMessages = useQuery(api.messages.list, { chatId });
  const createMessage = useMutation(api.messages.create);

  const { messages, status, sendMessage, setMessages, regenerate } =
    useChat<ChatMessage>({
      id: chatId,
      onFinish: async ({ message }) => {
        // Save assistant message to Convex
        const textParts = message.parts?.filter(
          (p): p is { type: "text"; text: string } => p.type === "text"
        );
        const textContent = textParts?.map((p) => p.text).join("") || "";

        await createMessage({
          chatId,
          role: "assistant",
          content: textContent,
          parts: message.parts,
        });
      },
    });

  // Load messages from Convex on mount
  useEffect(() => {
    if (storedMessages && !isInitialized) {
      const loadedMessages: ChatMessage[] = storedMessages.map((msg) => ({
        id: msg._id,
        role: msg.role,
        content: msg.content,
        parts: msg.parts || [{ type: "text" as const, text: msg.content }],
      }));
      setMessages(loadedMessages);
      setIsInitialized(true);
    }
  }, [storedMessages, isInitialized, setMessages]);

  // Redirect if chat not found
  useEffect(() => {
    if (chat === null) {
      router.push("/");
    }
  }, [chat, router]);

  // Handle pending message from new chat creation
  useEffect(() => {
    if (isInitialized && !hasSentPendingMessage.current) {
      const pendingMessage = searchParams.get("pending");
      const mode = searchParams.get("mode");

      if (pendingMessage) {
        hasSentPendingMessage.current = true;
        const forceVariant =
          mode === "video" || mode === "short" ? mode : null;

        // Use regenerate instead of sendMessage - message is already in state from Convex
        regenerate({
          body: {
            forceVariant,
          },
        });

        // Clean up URL
        router.replace(`/chat/${chatId}`);
      }
    }
  }, [isInitialized, searchParams, regenerate, router, chatId]);

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

    // Save user message to Convex
    await createMessage({
      chatId,
      role: "user",
      content: trimmed,
      parts: [{ type: "text", text: trimmed }],
    });

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

  if (chat === undefined || storedMessages === undefined) {
    return (
      <SidebarLayout>
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Messages skeleton */}
          <div className="flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-7xl px-4 md:px-6 py-4 space-y-6">
              {/* User message skeleton */}
              <div className="flex gap-3 justify-end">
                <div className="space-y-2 max-w-[70%]">
                  <Skeleton className="h-4 w-48 ml-auto" />
                  <Skeleton className="h-4 w-32 ml-auto" />
                </div>
                <Skeleton className="size-8 rounded-full shrink-0" />
              </div>
              {/* Assistant message skeleton */}
              <div className="flex gap-3">
                <Skeleton className="size-8 rounded-full shrink-0" />
                <div className="space-y-2 max-w-[70%]">
                  <Skeleton className="h-4 w-64" />
                  <Skeleton className="h-4 w-80" />
                  <Skeleton className="h-4 w-56" />
                </div>
              </div>
            </div>
          </div>
          {/* Input skeleton */}
          <div className="mx-auto w-full max-w-7xl px-4 md:px-6 py-4">
            <Skeleton className="h-24 w-full rounded-xl" />
          </div>
        </div>
      </SidebarLayout>
    );
  }

  if (chat === null) {
    return null;
  }

  return (
    <SidebarLayout>
      <div className="flex-1 flex flex-col overflow-hidden">
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
            Please avoid sharing personal data—everything submitted here will be
            automatically uploaded publicly to the community YouTube channel.
          </p>
        </div>
      </div>
    </SidebarLayout>
  );
}

export default function ChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  return <ChatPageContent chatId={resolvedParams.id as Id<"chats">} />;
}
