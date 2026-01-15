"use client";

import { useState, useEffect } from "react";

const STORAGE_KEY = "eduvids_onboarding_complete";

export function useFirstVisit() {
  const [isFirstVisit, setIsFirstVisit] = useState<boolean | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const completed = localStorage.getItem(STORAGE_KEY);
    setIsFirstVisit(!completed);
  }, []);

  const completeOnboarding = () => {
    if (typeof window === "undefined") return;

    localStorage.setItem(STORAGE_KEY, "true");
    setIsFirstVisit(false);
  };

  return { isFirstVisit, completeOnboarding };
}
