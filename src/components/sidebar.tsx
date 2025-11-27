"use client";

import { cn } from "@/lib/utils";
import {
  MessageSquare,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Youtube,
  Twitter,
  Github,
  Menu,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { UserButton, useUser } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import { dark } from "@clerk/themes";

interface ChatHistory {
  id: string;
  title: string;
  timestamp: Date;
  optimistic?: boolean;
}

interface ChatSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  isCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  chatHistory: ChatHistory[];
  currentChatId?: string;
  onNewChat: () => void;
  onSelectChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
  isLoadingHistory?: boolean;
  isCreatingChat?: boolean;
  pendingDeleteIds?: string[];
  errorMessage?: string | null;
  canCreateChat?: boolean;
}

export function Sidebar({
  isOpen,
  onClose,
  isCollapsed = false,
  onCollapsedChange,
  chatHistory = [],
  currentChatId,
  onNewChat,
  onSelectChat,
  onDeleteChat,
  isLoadingHistory = false,
  isCreatingChat = false,
  pendingDeleteIds = [],
  errorMessage = null,
  canCreateChat = true,
}: ChatSidebarProps) {
  const { user } = useUser();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed lg:relative inset-y-0 left-0 z-50 flex flex-col bg-sidebar border-r border-sidebar-border transition-all duration-300 ease-in-out",
          isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          isCollapsed ? "w-20 lg:w-20" : "w-80 lg:w-80"
        )}
      >
        {!isCollapsed && errorMessage && (
          <div className="px-4 pt-4">
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert">
              {errorMessage}
            </div>
          </div>
        )}
        {/* Header */}
        <div
          className={cn(
            "flex items-center h-16 px-4 border-b border-sidebar-border shrink-0",
            isCollapsed ? "justify-center" : "justify-between"
          )}
        >
          {!isCollapsed && (
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-semibold text-sidebar-foreground truncate">
                eduvids
              </span>
            </div>
          )}
          <div className="flex justify-center items-center">
            <Button
              variant="ghost"
              size="icon"
              className="hidden lg:flex text-sidebar-foreground hover:bg-sidebar-accent h-8 w-8 cursor-pointer"
              onClick={() => onCollapsedChange?.(!isCollapsed)}
              title={isCollapsed ? "Expand" : "Collapse"}
            >
              {isCollapsed ? (
                <ChevronRight className="size-4" />
              ) : (
                <ChevronLeft className="size-4" />
              )}
            </Button>
          </div>
        </div>
        {/* New Chat Button */}
        {!isCollapsed && (
          <div className="p-3 shrink-0">
            <Button
              onClick={onNewChat}
              className="w-full justify-start gap-2 bg-primary hover:bg-primary/90 text-primary-foreground cursor-pointer"
              disabled={isCreatingChat || !canCreateChat}
              title="New Chat"
            >
              {isCreatingChat ? (
                <Loader2 className="size-4 shrink-0 animate-spin" />
              ) : (
                <Plus className="size-4 shrink-0" />
              )}
              <span>{isCreatingChat ? "Creating..." : "New Chat"}</span>
            </Button>
          </div>
        )}
        {isCollapsed && (
          <div className="p-3 shrink-0">
            <Button
              onClick={onNewChat}
              size="icon"
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground cursor-pointer"
              disabled={isCreatingChat || !canCreateChat}
              title="New Chat"
            >
              {isCreatingChat ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
            </Button>
          </div>
        )}
        {/* Chat History */}
        <div className="flex-1 overflow-y-auto px-3 pb-3 min-w-0">
          {!isCollapsed && (
            <>
              <div className="mb-2">
                <span className="px-2 text-xs font-medium text-sidebar-foreground/50 uppercase tracking-wider">
                  Recent
                </span>
              </div>
              <div className="space-y-1">
                {isLoadingHistory ? (
                  <div className="px-2 py-8 text-center text-sm text-sidebar-foreground/50">
                    Loading chats...
                  </div>
                ) : chatHistory.length === 0 ? (
                  <div className="px-2 py-8 text-center text-sm text-sidebar-foreground/50">
                    No conversations yet
                  </div>
                ) : (
                  chatHistory.map((chat) => (
                    <div
                      key={chat.id}
                      className={cn(
                        "group flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm cursor-pointer transition-colors",
                        currentChatId === chat.id
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                        chat.optimistic && "opacity-70"
                      )}
                      onClick={() => onSelectChat(chat.id)}
                      title={chat.title}
                    >
                      <MessageSquare className="size-4 shrink-0" />
                      <span className="flex-1 truncate">{chat.title}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteChat(chat.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 text-sidebar-foreground/50 hover:text-destructive transition-all shrink-0 disabled:opacity-50"
                        disabled={pendingDeleteIds.includes(chat.id) || chat.optimistic}
                      >
                        {pendingDeleteIds.includes(chat.id) ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="size-3.5" />
                        )}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
          {isCollapsed && chatHistory.length > 0 && (
            <div className="space-y-2">
              {chatHistory.map((chat) => (
                <button
                  key={chat.id}
                  className={cn(
                    "flex items-center justify-center rounded-lg p-2.5 transition-colors w-full",
                    currentChatId === chat.id
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                    chat.optimistic && "opacity-70"
                  )}
                  onClick={() => onSelectChat(chat.id)}
                  title={chat.title}
                  disabled={chat.optimistic}
                >
                  <MessageSquare className="size-4" />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="p-3 border-sidebar-border shrink-0 space-y-2">
          {/* User Profile Section */}
          {mounted && user && !isCollapsed && (
            <div className="flex items-center justify-between gap-4 p-2 rounded-lg bg-sidebar-accent/30 border border-sidebar-border/50">
              <div className="shrink-0">
                <UserButton
                  appearance={{
                    theme: dark,
                    variables: { fontFamily: "Geist" },
                    elements: {
                      userButtonAvatarBox: "size-16",
                    },
                  }}
                />
              </div>
              <span className="text-sm font-medium text-sidebar-foreground truncate flex-1">
                {user.fullName ||
                  user.primaryEmailAddress?.emailAddress ||
                  "User"}{" "}
                (Signed In)
              </span>
            </div>
          )}
          {mounted && user && isCollapsed && (
            <div className="flex justify-center">
              <UserButton
                appearance={{
                  theme: dark,
                  variables: { fontFamily: "Geist" },
                  elements: {
                    userButtonAvatarBox: "size-16",
                  },
                }}
              />
            </div>
          )}
        </div>
        {/* Footer */}
        <div className="p-3 border-t border-sidebar-border shrink-0 space-y-2">
          {!isCollapsed && (
            <Link
              target="_blank"
              href="https://www.youtube.com/@eduvids-ai"
              aria-label="YouTube"
            >
              <button className="flex items-center gap-2 w-full rounded-lg px-3 py-2.5 text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors cursor-pointer">
                <Youtube className="size-4 shrink-0" />
                YouTube
              </button>
            </Link>
          )}
          {isCollapsed && (
            <Link
              target="_blank"
              href="https://www.youtube.com/@eduvids-ai"
              aria-label="YouTube"
            >
              <button className="flex items-center justify-center w-full rounded-lg p-2.5 text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors cursor-pointer">
                <Youtube className="size-5" />
              </button>
            </Link>
          )}
          {!isCollapsed && (
            <Link
              target="_blank"
              href="https://www.x.com/eduvidsai"
              aria-label="YouTube"
            >
              <button className="flex items-center gap-2 w-full rounded-lg px-3 py-2.5 text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors cursor-pointer">
                <Twitter className="size-4 shrink-0" />
                X/Twitter
              </button>
            </Link>
          )}
          {isCollapsed && (
            <Link
              target="_blank"
              href="https://www.x.com/eduvidsai"
              aria-label="YouTube"
            >
              <button className="flex items-center justify-center w-full rounded-lg p-2.5 text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors cursor-pointer">
                <Twitter className="size-5" />
              </button>
            </Link>
          )}
          {!isCollapsed && (
            <Link
              target="_blank"
              href="https://github.com/namanbnsl/eduvids"
              aria-label="GitHub"
            >
              <button className="flex items-center gap-2 w-full rounded-lg px-3 py-2.5 text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors cursor-pointer">
                <Github className="size-4 shrink-0" />
                Github
              </button>
            </Link>
          )}
          {isCollapsed && (
            <Link
              target="_blank"
              href="https://github.com/namanbnsl/eduvids"
              aria-label="GitHub"
            >
              <button className="flex items-center justify-center w-full rounded-lg p-2.5 text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors cursor-pointer">
                <Github className="size-5" />
              </button>
            </Link>
          )}
        </div>
      </aside>
    </>
  );
}

export function SidebarToggle({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" size="icon" onClick={onClick} className="shrink-0">
      <Menu className="size-5" />
    </Button>
  );
}
