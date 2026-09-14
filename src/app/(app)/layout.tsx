import { SignedIn, SignedOut } from "@clerk/nextjs";
import { SidebarLayout } from "@/components/sidebar";
import Navbar from "@/components/navbar";
import ConvexClientProvider from "@/components/providers/ConvexClientProvider";
import { PostHogUserIdentifier } from "@/components/providers/PostHogUserIdentifier";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ConvexClientProvider>
      <PostHogUserIdentifier />
      <SignedIn>
        <SidebarLayout>{children}</SidebarLayout>
      </SignedIn>

      <SignedOut>
        <div className="relative flex flex-col h-full bg-background">
          <Navbar />
          <div className="flex-1 flex flex-col overflow-auto">{children}</div>
        </div>
      </SignedOut>
    </ConvexClientProvider>
  );
}
