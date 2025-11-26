"use client";

import { ClerkProvider, useAuth } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";

const convex = new ConvexReactClient(
  process.env.NEXT_PUBLIC_CONVEX_URL as string
);

const ConvexClerkAuthProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  return (
    <div>
      <ClerkProvider
        appearance={{ theme: dark, variables: { fontFamily: "--sans-serif" } }}
      >
        <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
          {children}
        </ConvexProviderWithClerk>
      </ClerkProvider>
    </div>
  );
};

export { ConvexClerkAuthProvider };
