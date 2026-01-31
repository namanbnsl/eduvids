"use client";

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
        <div className="flex flex-col h-full">
          <Navbar />
          <div className="flex-1 overflow-hidden">{children}</div>
        </div>
      </SignedOut>
    </>
  );
}
