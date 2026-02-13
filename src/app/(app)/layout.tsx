import { SignedIn, SignedOut } from "@clerk/nextjs";
import { SidebarLayout } from "@/components/sidebar";
import Navbar from "@/components/navbar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SignedIn>
        <SidebarLayout>{children}</SidebarLayout>
      </SignedIn>

      <SignedOut>
        <div className="relative flex flex-col h-full bg-background">
          <Navbar />
          <div className="flex-1 flex flex-col overflow-auto">{children}</div>
        </div>
      </SignedOut>
    </>
  );
}
