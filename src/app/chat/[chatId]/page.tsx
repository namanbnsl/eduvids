"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useChat } from "@ai-sdk/react";
import { useEffect, useState, useRef, useCallback } from "react";
import { Message, MessageAvatar, MessageContent } from "@/components/message";
import { StyledResponse } from "@/components/ui/styled-response";
import { VideoPlayer } from "@/components/video-player";
import {
  PromptInput,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
  PromptInputButton,
} from "@/components/prompt-input";
import { Monitor, Smartphone } from "lucide-react";
import { Conversation, ConversationContent } from "@/components/conversation";
import { Sidebar } from "@/components/sidebar";
import { Authenticated, Unauthenticated } from "convex/react";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SignUpButton } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { Youtube, Twitter, Github } from "lucide-react";
import { Id } from "../../../../convex/_generated/dataModel";

// Types
import type {
  ChatMessage,
  ChatMessagePart,
  GenerateVideoToolUIPart,
} from "@/lib/types";

const isGenerateVideoToolPart = (
  part: ChatMessagePart
): part is Extract<GenerateVideoToolUIPart, { type: "tool-generate_video" }> =>
  part.type === "tool-generate_video";

const chatApi = api as unknown as {
  chat: {
    getChatsByUser: any;
    createNewChat: any;
    deleteChat: any;
    updateChatTitle: any;
  };
  messages: {
    getMessages: any;
    saveMessage: any;
  };
};

export default function ChatIdPage() {
  const params = useParams();
  const chatId = params.chatId as Id<"chats">;

  const { user } = useUser();
  const userEmail = user?.primaryEmailAddress?.emailAddress ?? null;
  const isAuthenticated = !!userEmail;
  const isTemporaryChat = (chatId as string).startsWith("temp-");

  const convexMessages = useQuery(
    chatApi.messages.getMessages,
    isAuthenticated && !isTemporaryChat ? { chatId } : "skip"
  );
  const saveMessageMutation = useMutation(chatApi.messages.saveMessage);
  const deleteChatMutation = useMutation(chatApi.chat.deleteChat);

  const [input, setInput] = useState("");
  const [generationMode, setGenerationMode] = useState<
    "video" | "short" | null
  >(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [localMessages, setLocalMessages] = useState<any[]>([]);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[]>([]);
  const [sidebarError, setSidebarError] = useState<string | null>(null);

  // Convert Convex messages to AI SDK format
  // We will set these via setMessages in useEffect

  const { messages, status, setMessages, sendMessage } = useChat({
    id: chatId,
    onFinish: async (message: any) => {
      let jobId: string | undefined;
      let hasError = false;

      if (message.toolInvocations) {
        for (const toolInvocation of message.toolInvocations) {
          if (
            toolInvocation.toolName === "generate_video" &&
            toolInvocation.state === "result"
          ) {
            const result = toolInvocation.result as any;
            if (result && typeof result.jobId === "string") {
              jobId = result.jobId;
            }
          }
          // Check for errors in tool invocations
          if (toolInvocation.state === "error") {
            hasError = true;
          }
        }
      }

      // Extract content from parts if needed
      let content = message.content;
      if (!content && message.parts) {
        content = message.parts
          .filter((p: any) => p.type === "text")
          .map((p: any) => p.text)
          .join("");
      }

      // Save assistant message only if authenticated and not a temporary chat
      if (isAuthenticated && !isTemporaryChat) {
        try {
          await saveMessageMutation({
            chatId,
            content: content || (hasError ? "Something went wrong" : ""),
            role: "assistant",
            jobId,
            toolInvocations: message.toolInvocations
              ? JSON.stringify(message.toolInvocations)
              : undefined,
          });
        } catch (error) {
          console.error("Failed to save message:", error);
        }
      }
    },
  });

  const router = useRouter();
  const searchParams = useSearchParams();
  const hasRunInitRef = useRef(false);
  const lastSyncedChatIdRef = useRef<string | null>(null);

  // Sync messages from Convex database (only for authenticated non-temp chats)
  useEffect(() => {
    // Skip if not authenticated or is a temporary chat
    if (!isAuthenticated || isTemporaryChat) {
      return;
    }

    // If chatId changed, we need to sync for the new chat
    const chatIdChanged = lastSyncedChatIdRef.current !== chatId;

    if (chatIdChanged) {
      console.log("Chat changed to:", chatId);
      lastSyncedChatIdRef.current = chatId;

      // If we have messages from database for this chat, load them
      if (convexMessages && convexMessages.length > 0) {
        console.log("Syncing messages from database for chat:", chatId);

        setMessages(
          convexMessages.map((msg: any) => {
            const toolInvocations = msg.toolInvocations
              ? JSON.parse(msg.toolInvocations)
              : undefined;

            // Convert toolInvocations back to parts format for proper rendering
            let parts: any[] = [];
            if (msg.content) {
              parts.push({ type: "text", text: msg.content });
            }
            if (toolInvocations) {
              toolInvocations.forEach((invocation: any) => {
                if (invocation.toolName === "generate_video") {
                  if (invocation.state === "result") {
                    parts.push({
                      type: "tool-generate_video",
                      state: "output-available",
                      output: invocation.result,
                    });
                  } else if (invocation.state === "error") {
                    parts.push({
                      type: "tool-generate_video",
                      state: "output-error",
                      error: invocation.error,
                    });
                  } else if (invocation.state === "call") {
                    parts.push({
                      type: "tool-generate_video",
                      state: "input-available",
                      input: invocation.args,
                    });
                  }
                }
              });
            }

            return {
              id: msg._id,
              role: msg.role,
              content: msg.content,
              parts: parts.length > 0 ? parts : undefined,
              toolInvocations,
            };
          })
        );
      }
      // Otherwise, keep whatever messages AI SDK has
      // (they might be managing new messages that haven't been saved to DB yet)
    }
  }, [convexMessages, setMessages, chatId, isAuthenticated, isTemporaryChat]);

  // Handle initial message from query params
  useEffect(() => {
    if (hasRunInitRef.current) return;

    const q = searchParams.get("q");
    const mode = searchParams.get("mode") as "video" | "short" | null;

    if (q) {
      hasRunInitRef.current = true;

      const processMessage = async () => {
        // Save user message only if authenticated and not temporary
        if (isAuthenticated && !isTemporaryChat) {
          try {
            await saveMessageMutation({
              chatId,
              content: q,
              role: "user",
            });
          } catch (error) {
            console.error("Failed to save user message:", error);
          }
        }

        // Start AI generation
        sendMessage(
          {
            text: q,
          },
          {
            body: {
              forceVariant: mode,
            },
          }
        );

        // Clear query params to prevent re-submission on refresh
        router.replace(`/chat/${chatId}`);
      };

      processMessage();
    }
  }, [searchParams, chatId, saveMessageMutation, sendMessage, router]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;

    // Save user message only if authenticated and not temporary
    if (isAuthenticated && !isTemporaryChat) {
      try {
        await saveMessageMutation({
          chatId,
          content: trimmed,
          role: "user",
        });
      } catch (error) {
        console.error("Failed to save user message:", error);
      }
    }

    await sendMessage(
      {
        text: trimmed,
      },
      {
        body: {
          forceVariant: generationMode,
        },
      }
    );

    setInput("");
    setGenerationMode(null);
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

  const handleDeleteChat = useCallback(
    async (chatIdToDelete: string) => {
      if (!userEmail) {
        setSidebarError("Please sign in to delete chats.");
        return;
      }

      setPendingDeleteIds((prev) => [...prev, chatIdToDelete]);
      setSidebarError(null);

      try {
        const result = await deleteChatMutation({
          chatId: chatIdToDelete,
          userEmail,
        });
        if (!result?.success) {
          throw new Error("Delete failed");
        }

        // If we deleted the current chat, redirect to home
        if (chatId === chatIdToDelete) {
          router.push("/");
        }
      } catch (error) {
        console.error("Failed to delete chat", error);
        setSidebarError("Couldn't delete chat. Please try again.");
      } finally {
        setPendingDeleteIds((prev) =>
          prev.filter((pendingId) => pendingId !== chatIdToDelete)
        );
      }
    },
    [chatId, deleteChatMutation, router, userEmail]
  );

  // Sidebar props (simplified for now, reusing logic from main page would be better but keeping it self-contained)
  const chats = useQuery(
    chatApi.chat.getChatsByUser,
    isAuthenticated ? { userEmail } : "skip"
  );

  const formattedChats = (chats || []).map((chat: any) => ({
    id: chat.id,
    title: chat.title || "Untitled chat",
    timestamp: new Date(chat.created_at),
  }));

  return (
    <div className="relative flex h-svh bg-background">
      <Authenticated>
        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          isCollapsed={sidebarCollapsed}
          onCollapsedChange={setSidebarCollapsed}
          chatHistory={formattedChats}
          currentChatId={chatId}
          onNewChat={() => router.push("/")}
          onSelectChat={(id) => router.push(`/chat/${id}`)}
          onDeleteChat={handleDeleteChat}
          isLoadingHistory={!chats}
          canCreateChat={true}
          pendingDeleteIds={pendingDeleteIds}
          errorMessage={sidebarError}
        />
      </Authenticated>

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header/Unauthenticated view similar to main page */}
        <Unauthenticated>
          <div className="flex justify-between items-center px-6 py-4 border-b border-border/50 bg-background/50 backdrop-blur-sm">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-semibold text-foreground truncate">
                eduvids
              </span>
            </div>
            <div className="flex gap-2 items-center">
              <SignUpButton
                mode="modal"
                appearance={{
                  theme: dark,
                  variables: { fontFamily: "Geist" },
                }}
              >
                <Button size="sm">Sign Up</Button>
              </SignUpButton>
            </div>
          </div>
        </Unauthenticated>

        <div className="flex-1 overflow-y-auto animate-in fade-in duration-500">
          <div className="mx-auto w-full max-w-7xl px-4 md:px-6 py-4">
            <Conversation>
              <ConversationContent>
                {messages.map((message) => (
                  <Message from={message.role} key={message.id}>
                    <MessageContent>
                      {message.parts ? (
                        message.parts.map((part, i) => {
                          if (part.type === "text") {
                            return (
                              <StyledResponse
                                key={i}
                                text={part.text}
                                role={message.role}
                              />
                            );
                          }

                          if (isGenerateVideoToolPart(part as any)) {
                            const toolPart = part as any;
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
                                  <div
                                    key={i}
                                    className="text-muted-foreground"
                                  >
                                    Something went wrong
                                  </div>
                                );
                              default:
                                return null;
                            }
                          }

                          return null;
                        })
                      ) : (
                        <StyledResponse
                          text={(message as any).content}
                          role={message.role}
                        />
                      )}
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
              placeholder="Type a message..."
            />
            <PromptInputToolbar>
              <PromptInputTools>
                <div className="inline-flex gap-1">
                  <PromptInputButton
                    onClick={() => handleGenerationModeToggle("video")}
                    variant={generationMode === "video" ? "default" : "outline"}
                  >
                    <Monitor className="size-4" />
                    Video
                  </PromptInputButton>
                  <PromptInputButton
                    onClick={() => handleGenerationModeToggle("short")}
                    variant={generationMode === "short" ? "default" : "outline"}
                  >
                    <Smartphone className="size-4" />
                    Short
                  </PromptInputButton>
                </div>
              </PromptInputTools>
              <PromptInputSubmit disabled={!input} status={status} />
            </PromptInputToolbar>
          </PromptInput>
        </div>
      </div>
    </div>
  );
}
