"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  Plus,
  MessageSquare,
  Github,
  Twitter,
  Youtube,
  ChevronsUpDown,
  PanelLeftClose,
  Trash2,
  LogOut,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useUser, useClerk } from "@clerk/nextjs";
import { Id } from "../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";

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

const ChatList = () => {
  const chats = useQuery(api.chats.list);
  const removeChat = useMutation(api.chats.remove);
  const pathname = usePathname();

  const router = useRouter();

  const handleDelete = async (e: React.MouseEvent, chatId: Id<"chats">) => {
    e.preventDefault();
    e.stopPropagation();

    const isCurrentChat = pathname === `/chat/${chatId}`;
    await removeChat({ id: chatId });

    if (isCurrentChat) {
      router.push("/");
    }
  };

  if (chats === undefined) {
    return (
      <div className="space-y-2 px-2">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  }

  if (chats.length === 0) {
    return (
      <div className="px-2 py-8 text-center text-sm text-muted-foreground group-data-[collapsible=icon]:hidden">
        <MessageSquare className="size-8 mx-auto mb-2 opacity-50" />
        <p>No chats yet</p>
        <p className="text-xs">Start a new chat to get going</p>
      </div>
    );
  }

  return (
    <SidebarMenu className="gap-1">
      {chats.map((chat) => {
        const isActive = pathname === `/chat/${chat._id}`;
        return (
          <SidebarMenuItem key={chat._id} className="group/item relative">
            <SidebarMenuButton
              asChild
              tooltip={chat.title}
              isActive={isActive}
              className={cn("pr-8", isActive && "bg-sidebar-accent")}
            >
              <Link href={`/chat/${chat._id}`}>
                <MessageSquare className="size-4 shrink-0" />
                <span className="truncate">{chat.title}</span>
              </Link>
            </SidebarMenuButton>
            <Button
              variant="destructive"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 size-6 opacity-0 group-hover/item:opacity-100 transition-opacity cursor-pointer"
              onClick={(e) => handleDelete(e, chat._id)}
            >
              <Trash2 className="size-3" />
            </Button>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
};

const UserMenuSkeleton = () => {
  return (
    <SidebarMenuButton size="lg" className="cursor-default">
      <Skeleton className="size-8 rounded-lg" />
      <div className="grid flex-1 gap-1">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-3 w-32" />
      </div>
    </SidebarMenuButton>
  );
};

const UserMenu = () => {
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();

  if (!isLoaded) {
    return <UserMenuSkeleton />;
  }

  if (!user) return null;

  const fullName = user.fullName || user.username || "User";
  const email = user.primaryEmailAddress?.emailAddress || "";
  const initials = fullName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton
          size="lg"
          className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground cursor-pointer"
          tooltip={fullName}
        >
          <Avatar className="size-8 rounded-lg">
            <AvatarImage src={user.imageUrl} alt={fullName} />
            <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
          </Avatar>
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-semibold">{fullName}</span>
            <span className="truncate text-xs text-muted-foreground">
              {email}
            </span>
          </div>
          <ChevronsUpDown className="ml-auto size-4" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onClick={() => signOut()} className="cursor-pointer">
          <LogOut className="mr-2 size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const AppSidebar = () => {
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  return (
    <ShadcnSidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="p-3 gap-3">
        <LogoWithToggle />

        <HoverCard openDelay={5} closeDelay={5}>
          <HoverCardTrigger asChild>
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
          </HoverCardTrigger>
          <HoverCardContent side="right" className="text-xs w-fit">
            Start a New Chat
          </HoverCardContent>
        </HoverCard>
      </SidebarHeader>

      <SidebarContent className="px-2">
        <SidebarGroup className="flex-1 p-0">
          <SidebarGroupLabel className="px-2 text-xs text-muted-foreground">
            Recent Chats
          </SidebarGroupLabel>
          {!isCollapsed && (
            <SidebarGroupContent className="overflow-y-auto [scrollbar-width:thin] [scrollbar-color:hsl(var(--muted))_transparent]">
              <ChatList />
            </SidebarGroupContent>
          )}
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3 gap-2">
        <Separator />

        <SidebarMenu className="gap-0.5">
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="GitHub" size="sm">
              <Link
                href="https://github.com/namanbnsl/eduvids"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Github className="size-4" />
                <span>GitHub</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Twitter" size="sm">
              <Link
                href="https://x.com/eduvidsai"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Twitter className="size-4" />
                <span>Twitter</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="YouTube" size="sm">
              <Link
                href="https://youtube.com/@eduvids-ai"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Youtube className="size-4" />
                <span>YouTube</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        <Separator />

        <SidebarMenu>
          <SidebarMenuItem>
            <UserMenu />
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

const SIDEBAR_STORAGE_KEY = "sidebar_collapsed";

const SidebarLayout = ({ children }: SidebarLayoutProps) => {
  const [open, setOpen] = useState(true);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (stored !== null) {
      setOpen(stored !== "true");
    }
    setIsHydrated(true);
  }, []);

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(!newOpen));
  };

  if (!isHydrated) {
    return null;
  }

  return (
    <SidebarProvider open={open} onOpenChange={handleOpenChange}>
      <AppSidebar />
      <SidebarLayoutContent>{children}</SidebarLayoutContent>
    </SidebarProvider>
  );
};

export { AppSidebar, SidebarLayout };
