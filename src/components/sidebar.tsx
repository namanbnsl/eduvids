"use client";

import Link from "next/link";
import Image from "next/image";
import {
  Plus,
  MessageSquare,
  Github,
  Twitter,
  Youtube,
  ChevronsUpDown,
  PanelLeftClose,
} from "lucide-react";

import {
  Sidebar as ShadcnSidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  useSidebar,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";

// Dummy data for chats
const dummyChats: { id: string; title: string; createdAt: Date }[] = [
  { id: "1", title: "Chat about React", createdAt: new Date() },
  { id: "2", title: "Next.js Questions", createdAt: new Date() },
  { id: "3", title: "UI/UX Design Tips", createdAt: new Date() },
  { id: "4", title: "JavaScript Fundamentals", createdAt: new Date() },
  { id: "5", title: "TypeScript Basics", createdAt: new Date() },
  { id: "6", title: "CSS Grid vs Flexbox", createdAt: new Date() },
  { id: "7", title: "State Management in React", createdAt: new Date() },
  { id: "8", title: "Deploying Next.js Apps", createdAt: new Date() },
  { id: "9", title: "Accessibility Best Practices", createdAt: new Date() },
  { id: "10", title: "Performance Optimization", createdAt: new Date() },
  { id: "1", title: "Chat about React", createdAt: new Date() },
  { id: "2", title: "Next.js Questions", createdAt: new Date() },
  { id: "3", title: "UI/UX Design Tips", createdAt: new Date() },
  { id: "4", title: "JavaScript Fundamentals", createdAt: new Date() },
  { id: "5", title: "TypeScript Basics", createdAt: new Date() },
  { id: "6", title: "CSS Grid vs Flexbox", createdAt: new Date() },
  { id: "7", title: "State Management in React", createdAt: new Date() },
  { id: "8", title: "Deploying Next.js Apps", createdAt: new Date() },
  { id: "9", title: "Accessibility Best Practices", createdAt: new Date() },
  { id: "10", title: "Performance Optimization", createdAt: new Date() },
  { id: "1", title: "Chat about React", createdAt: new Date() },
  { id: "2", title: "Next.js Questions", createdAt: new Date() },
  { id: "3", title: "UI/UX Design Tips", createdAt: new Date() },
  { id: "4", title: "JavaScript Fundamentals", createdAt: new Date() },
  { id: "5", title: "TypeScript Basics", createdAt: new Date() },
  { id: "6", title: "CSS Grid vs Flexbox", createdAt: new Date() },
  { id: "7", title: "State Management in React", createdAt: new Date() },
  { id: "8", title: "Deploying Next.js Apps", createdAt: new Date() },
  { id: "9", title: "Accessibility Best Practices", createdAt: new Date() },
  { id: "10", title: "Performance Optimization", createdAt: new Date() },
  { id: "1", title: "Chat about React", createdAt: new Date() },
  { id: "2", title: "Next.js Questions", createdAt: new Date() },
  { id: "3", title: "UI/UX Design Tips", createdAt: new Date() },
  { id: "4", title: "JavaScript Fundamentals", createdAt: new Date() },
  { id: "5", title: "TypeScript Basics", createdAt: new Date() },
  { id: "6", title: "CSS Grid vs Flexbox", createdAt: new Date() },
  { id: "7", title: "State Management in React", createdAt: new Date() },
  { id: "8", title: "Deploying Next.js Apps", createdAt: new Date() },
  { id: "9", title: "Accessibility Best Practices", createdAt: new Date() },
  { id: "10", title: "Performance Optimization", createdAt: new Date() },
  { id: "1", title: "Chat about React", createdAt: new Date() },
  { id: "2", title: "Next.js Questions", createdAt: new Date() },
  { id: "3", title: "UI/UX Design Tips", createdAt: new Date() },
  { id: "4", title: "JavaScript Fundamentals", createdAt: new Date() },
  { id: "5", title: "TypeScript Basics", createdAt: new Date() },
  { id: "6", title: "CSS Grid vs Flexbox", createdAt: new Date() },
  { id: "7", title: "State Management in React", createdAt: new Date() },
  { id: "8", title: "Deploying Next.js Apps", createdAt: new Date() },
  { id: "9", title: "Accessibility Best Practices", createdAt: new Date() },
  { id: "10", title: "Performance Optimization", createdAt: new Date() },
];

// Dummy user data
const dummyUser = {
  name: "John Doe",
  email: "john@example.com",
  avatar: "",
};

const LogoWithToggle = () => {
  const { toggleSidebar, state } = useSidebar();
  const isCollapsed = state === "collapsed";

  return (
    <div className="flex items-center justify-between gap-2">
      {isCollapsed ? (
        <HoverCard openDelay={5} closeDelay={5}>
          <HoverCardTrigger>
            <button
              onClick={toggleSidebar}
              className="flex cursor-pointer aspect-square size-9 items-center justify-center rounded-lg shrink-0 hover:bg-sidebar-accent transition-colors"
            >
              <Image src="/favicon.png" alt="eduvids" width={36} height={36} />
            </button>
          </HoverCardTrigger>
          <HoverCardContent side="right" className="text-xs w-fit">
            Expand Sidebar
          </HoverCardContent>
        </HoverCard>
      ) : (
        <>
          <Link href="/" className="flex items-center gap-2 min-w-0">
            <div className="flex aspect-square size-9 items-center justify-center rounded-lg shrink-0">
              <Image src="/favicon.png" alt="eduvids" width={36} height={36} />
            </div>
            <span className="font-semibold truncate">eduvids</span>
          </Link>
          <HoverCard openDelay={5} closeDelay={5}>
            <HoverCardTrigger>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleSidebar}
                className="size-8 shrink-0 cursor-w-resize"
              >
                <PanelLeftClose className="size-4 " />
                <span className="sr-only">Collapse Sidebar</span>
              </Button>
            </HoverCardTrigger>
            <HoverCardContent side="right" className="text-xs w-fit">
              Collapse Sidebar
            </HoverCardContent>
          </HoverCard>
        </>
      )}
    </div>
  );
};

const AppSidebar = () => {
  return (
    <ShadcnSidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="p-3 gap-3">
        <LogoWithToggle />

        <Button
          asChild
          className="w-full justify-start gap-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
        >
          <Link href="/">
            <Plus className="size-4" />
            <span className="group-data-[collapsible=icon]:hidden">
              New Chat
            </span>
          </Link>
        </Button>
      </SidebarHeader>

      <SidebarContent className="px-2">
        <SidebarGroup className="flex-1 p-0">
          <SidebarGroupLabel className="px-2 text-xs text-muted-foreground">
            Recent Chats
          </SidebarGroupLabel>
          <SidebarGroupContent className="overflow-y-auto [scrollbar-width:thin] [scrollbar-color:hsl(var(--muted))_transparent]">
            <SidebarMenu className="gap-2">
              {dummyChats.length === 0 ? (
                <div className="px-2 py-8 text-center text-sm text-muted-foreground group-data-[collapsible=icon]:hidden">
                  <MessageSquare className="size-8 mx-auto mb-2 opacity-50" />
                  <p>No chats yet</p>
                  <p className="text-xs">Start a new chat to get going</p>
                </div>
              ) : (
                dummyChats.map((chat) => (
                  <SidebarMenuItem key={chat.id}>
                    <SidebarMenuButton asChild tooltip={chat.title}>
                      <Link href={`/chat/${chat.id}`}>
                        <MessageSquare className="size-4" />
                        <span className="truncate">{chat.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3 gap-2">
        <Separator />

        <SidebarMenu className="gap-0.5">
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="GitHub" size="sm">
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Github className="size-4" />
                <span>GitHub</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Twitter" size="sm">
              <a
                href="https://twitter.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Twitter className="size-4" />
                <span>Twitter</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="YouTube" size="sm">
              <a
                href="https://youtube.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Youtube className="size-4" />
                <span>YouTube</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        <Separator />

        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              tooltip={dummyUser.name}
            >
              <Avatar className="size-8 rounded-lg">
                <AvatarImage src={dummyUser.avatar} alt={dummyUser.name} />
                <AvatarFallback className="rounded-lg">
                  {dummyUser.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{dummyUser.name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {dummyUser.email}
                </span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </ShadcnSidebar>
  );
};

interface SidebarLayoutProps {
  children: React.ReactNode;
}

const SidebarLayoutContent = ({ children }: SidebarLayoutProps) => {
  return (
    <SidebarInset className="flex flex-col h-svh">
      <div className="flex-1 flex flex-col overflow-auto">{children}</div>
    </SidebarInset>
  );
};

const SidebarLayout = ({ children }: SidebarLayoutProps) => {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarLayoutContent>{children}</SidebarLayoutContent>
    </SidebarProvider>
  );
};

export { AppSidebar, SidebarLayout };
