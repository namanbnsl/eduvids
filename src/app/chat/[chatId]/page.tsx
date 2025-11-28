"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useChat } from "@ai-sdk/react";
import { useEffect, useState, useRef } from "react";
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

  const convexMessages = useQuery(chatApi.messages.getMessages, { chatId });
  const saveMessageMutation = useMutation(chatApi.messages.saveMessage);

  const [input, setInput] = useState("");
  const [generationMode, setGenerationMode] = useState<
    "video" | "short" | null
  >(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Convert Convex messages to AI SDK format
  // We will set these via setMessages in useEffect

  const { messages, status, setMessages, sendMessage } = useChat({
    id: chatId,
    onFinish: async (message: any) => {
      let jobId: string | undefined;

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

      // Save assistant message
      await saveMessageMutation({
        chatId,
        content: content || "",
        role: "assistant",
        jobId,
      });
    },
  });

  const router = useRouter();
  const searchParams = useSearchParams();
  const hasRunInitRef = useRef(false);

  // Sync initial messages when they load from Convex
  useEffect(() => {
    if (convexMessages && messages.length === 0 && convexMessages.length > 0) {
      setMessages(
        convexMessages.map((msg: any) => ({
          id: msg._id,
          role: msg.role,
          content: msg.content,
        }))
      );
    }
  }, [convexMessages, setMessages, messages.length]);

  // Handle initial message from query params
  useEffect(() => {
    if (hasRunInitRef.current) return;

    const q = searchParams.get("q");
    const mode = searchParams.get("mode") as "video" | "short" | null;

    if (q) {
      hasRunInitRef.current = true;

      // Save user message
      saveMessageMutation({
        chatId,
        content: q,
        role: "user",
      }).then(() => {
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
      });
    }
  }, [searchParams, chatId, saveMessageMutation, sendMessage, router]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;

    // Save user message
    await saveMessageMutation({
      chatId,
      content: trimmed,
      role: "user",
    });

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

  // Sidebar props (simplified for now, reusing logic from main page would be better but keeping it self-contained)
  const chats = useQuery(
    chatApi.chat.getChatsByUser,
    userEmail ? { userEmail } : undefined
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
          onNewChat={() => (window.location.href = "/")} // Simple redirect for now
          onSelectChat={(id) => (window.location.href = `/chat/${id}`)}
          onDeleteChat={() => {}} // Implement delete if needed
          isLoadingHistory={!chats}
          canCreateChat={true}
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
                                return <div key={i}>Something went wrong</div>;
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
