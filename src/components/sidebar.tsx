"use client";

import { cn } from "@/lib/utils";
import {
  MessageSquare,
  Plus,
  Settings,
  Trash2,
  Menu,
  X,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Youtube,
  Twitter,
  Github,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface ChatHistory {
  id: string;
  title: string;
  timestamp: Date;
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
}: ChatSidebarProps) {
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
              className="hidden lg:flex text-sidebar-foreground hover:bg-sidebar-accent h-8 w-8"
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
              className="w-full justify-start gap-2 bg-primary hover:bg-primary/90 text-primary-foreground"
              title="New Chat"
            >
              <Plus className="size-4 shrink-0" />
              New Chat
            </Button>
          </div>
        )}
        {isCollapsed && (
          <div className="p-3 shrink-0">
            <Button
              onClick={onNewChat}
              size="icon"
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
              title="New Chat"
            >
              <Plus className="size-4" />
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
                {chatHistory.length === 0 ? (
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
                          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
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
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 text-sidebar-foreground/50 hover:text-destructive transition-all shrink-0"
                      >
                        <Trash2 className="size-3.5" />
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
                    "flex items-center justify-center rounded-lg p-2.5 transition-colors w-full cursor-pointer",
                    currentChatId === chat.id
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                  )}
                  onClick={() => onSelectChat(chat.id)}
                  title={chat.title}
                >
                  <MessageSquare className="size-4" />
                </button>
              ))}
            </div>
          )}
        </div>
        {/* Footer */}
        <div className="p-3 border-t border-sidebar-border shrink-0">
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
