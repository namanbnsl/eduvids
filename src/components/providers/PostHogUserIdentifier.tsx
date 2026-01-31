"use client";

import { useEffect } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import posthog from "posthog-js";

export function PostHogUserIdentifier() {
  const { isSignedIn, userId } = useAuth();
  const { user } = useUser();

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      return;
    }

    if (isSignedIn && userId && user && !posthog._isIdentified()) {
      posthog.identify(userId, {
        email: user.primaryEmailAddress?.emailAddress,
        name: user.fullName,
        firstName: user.firstName,
        lastName: user.lastName,
        imageUrl: user.imageUrl,
        createdAt: user.createdAt,
      });
    }

    if (!isSignedIn && posthog._isIdentified()) {
      posthog.reset();
    }
  }, [isSignedIn, userId, user]);

  return null;
}
