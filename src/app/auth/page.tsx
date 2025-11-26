"use client";

import { Authenticated, Unauthenticated } from "convex/react";
import { SignInButton, UserButton } from "@clerk/nextjs";

export default function Home() {
  return (
    <>
      <Authenticated>
        <UserButton />
        <Content />
      </Authenticated>
      <Unauthenticated>
        <SignInButton />
      </Unauthenticated>
    </>
  );
}

function Content() {
  return <div>Authenticated content</div>;
}
