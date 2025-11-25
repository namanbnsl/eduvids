// "use client";

// import { useState } from "react";
// import Link from "next/link";
// import { Plus, Menu, X, Trash2, MoreVertical } from "lucide-react";

// interface ChatItem {
//   id: string;
//   title: string;
//   timestamp: Date;
// }

// const FAKE_CHAT_HISTORY: ChatItem[] = [
//   {
//     id: "1",
//     title: "Quantum Physics Basics",
//     timestamp: new Date(Date.now() - 1 * 60 * 60 * 1000), // 1 hour ago
//   },
//   {
//     id: "2",
//     title: "Calculus: Derivatives Explained",
//     timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000), // 3 hours ago
//   },
//   {
//     id: "3",
//     title: "Photosynthesis Process Animation",
//     timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
//   },
//   {
//     id: "4",
//     title: "Linear Algebra: Matrix Operations",
//     timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
//   },
//   {
//     id: "5",
//     title: "Cellular Biology Short Video",
//     timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
//   },
//   {
//     id: "6",
//     title: "Newton's Laws of Motion",
//     timestamp: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
//   },
//   {
//     id: "7",
//     title: "Chemistry: Periodic Table",
//     timestamp: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000), // 14 days ago
//   },
//   {
//     id: "8",
//     title: "Trigonometry Functions",
//     timestamp: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000), // 21 days ago
//   },
// ];

// const formatTime = (date: Date): string => {
//   const now = new Date();
//   const diffMs = now.getTime() - date.getTime();
//   const diffMins = Math.floor(diffMs / 60000);
//   const diffHours = Math.floor(diffMs / 3600000);
//   const diffDays = Math.floor(diffMs / 86400000);

//   if (diffMins < 60) {
//     return `${diffMins}m ago`;
//   } else if (diffHours < 24) {
//     return `${diffHours}h ago`;
//   } else if (diffDays < 7) {
//     return `${diffDays}d ago`;
//   } else {
//     return date.toLocaleDateString();
//   }
// };

// export function Sidebar() {
//   const [isOpen, setIsOpen] = useState(false);
//   const [hoveredId, setHoveredId] = useState<string | null>(null);

//   return (
//     <>
//       {/* Mobile menu button */}
//       <button
//         onClick={() => setIsOpen(!isOpen)}
//         className="fixed bottom-6 left-6 z-40 md:hidden p-2 rounded-lg bg-accent hover:bg-accent/90 text-accent-foreground transition-colors"
//         aria-label="Toggle sidebar"
//       >
//         {isOpen ? <X className="size-6" /> : <Menu className="size-6" />}
//       </button>

//       {/* Overlay for mobile */}
//       {isOpen && (
//         <div
//           className="fixed inset-0 z-30 md:hidden bg-black/50"
//           onClick={() => setIsOpen(false)}
//         />
//       )}

//       {/* Sidebar */}
//       <aside
//         className={`fixed left-0 top-0 h-svh w-64 bg-muted border-r border-border flex flex-col z-40 transition-transform duration-300 ease-in-out md:relative md:translate-x-0 ${
//           isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
//         }`}
//       >
//         {/* Header */}
//         <div className="flex items-center justify-between gap-2 p-4 border-b border-border">
//           <h2 className="text-sm font-semibold text-foreground">History</h2>
//           <Link
//             href="/"
//             className="inline-flex items-center justify-center rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
//             title="New chat"
//           >
//             <Plus className="size-5" />
//           </Link>
//         </div>

//         {/* Chat history */}
//         <div className="flex-1 overflow-y-auto">
//           <div className="p-3 space-y-2">
//             {FAKE_CHAT_HISTORY.map((chat) => (
//               <div
//                 key={chat.id}
//                 onMouseEnter={() => setHoveredId(chat.id)}
//                 onMouseLeave={() => setHoveredId(null)}
//                 className="group relative"
//               >
//                 <button
//                   onClick={() => setIsOpen(false)}
//                   className="w-full text-left px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors truncate"
//                 >
//                   <div className="truncate">{chat.title}</div>
//                   <div className="text-xs text-muted-foreground/70">
//                     {formatTime(chat.timestamp)}
//                   </div>
//                 </button>

//                 {/* Action menu for desktop */}
//                 {hoveredId === chat.id && (
//                   <button
//                     className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-muted-foreground hover:bg-background transition-colors opacity-0 group-hover:opacity-100"
//                     title="Delete chat"
//                   >
//                     <Trash2 className="size-4" />
//                   </button>
//                 )}
//               </div>
//             ))}
//           </div>
//         </div>

//         {/* Footer */}
//         <div className="border-t border-border p-4 space-y-2">
//           <button className="w-full px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors text-left">
//             Settings
//           </button>
//           <button className="w-full px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors text-left">
//             Help & Feedback
//           </button>
//         </div>
//       </aside>
//     </>
//   );
// }

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
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface ChatHistory {
  id: string;
  title: string;
  timestamp: Date;
}

interface ChatSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  chatHistory: ChatHistory[];
  currentChatId?: string;
  onNewChat: () => void;
  onSelectChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
}

export function Sidebar({
  isOpen,
  onClose,
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
          "fixed lg:relative inset-y-0 left-0 z-50 flex flex-col w-80 bg-sidebar border-r border-sidebar-border transition-transform duration-300 ease-in-out",
          isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-sidebar-border">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center size-8 rounded-lg bg-primary/10">
              <Sparkles className="size-4 text-primary" />
            </div>
            <span className="font-semibold text-sidebar-foreground">
              eduvids
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden text-sidebar-foreground"
            onClick={onClose}
          >
            <X className="size-5" />
          </Button>
        </div>

        {/* New Chat Button */}
        <div className="p-3">
          <Button
            onClick={onNewChat}
            className="w-full justify-start gap-2 bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            <Plus className="size-4" />
            New Chat
          </Button>
        </div>

        {/* Chat History */}
        <div className="flex-1 overflow-y-auto px-3 pb-3">
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
                >
                  <MessageSquare className="size-4 shrink-0" />
                  <span className="flex-1 truncate">{chat.title}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteChat(chat.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 text-sidebar-foreground/50 hover:text-destructive transition-all"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-sidebar-border">
          <button className="flex items-center gap-2 w-full rounded-lg px-3 py-2.5 text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors">
            <Settings className="size-4" />
            Settings
          </button>
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
