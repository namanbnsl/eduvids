"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  PromptInput,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
  PromptInputButton,
} from "@/components/prompt-input";
import {
  Monitor,
  Smartphone,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Play,
  Youtube,
  Twitter,
  Share2,
} from "lucide-react";
import Image from "next/image";

interface OnboardingProps {
  onComplete: (message: string | null, mode: "video" | "short" | null) => void;
}

const EXAMPLES = [
  {
    prompt: "Explain the Pythagorean theorem with a visual proof",
    category: "Math",
  },
  {
    prompt: "How does photosynthesis convert sunlight to energy?",
    category: "Science",
  },
  {
    prompt: "Visualize a bubble sort algorithm step by step",
    category: "Programming",
  },
  {
    prompt: "Explain how black holes form and why they're invisible",
    category: "Physics",
  },
];

export function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState(0);
  const [input, setInput] = useState("");
  const [generationMode, setGenerationMode] = useState<
    "video" | "short" | null
  >(null);

  const handleSkip = () => {
    onComplete(null, null);
  };

  const handleNext = () => {
    setStep((s) => s + 1);
  };

  const handleBack = () => {
    setStep((s) => Math.max(0, s - 1));
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    onComplete(trimmed, generationMode);
  };

  const handleExampleClick = (prompt: string) => {
    setInput(prompt);
    setStep(4);
  };

  const totalSteps = 5;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-xl animate-in fade-in duration-500">
      {/* Subtle decorative elements - minimalistic */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-foreground/[0.02] rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-foreground/[0.03] rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-2xl mx-4">
        {/* Card */}
        <div className="relative rounded-2xl border border-border bg-card/95 backdrop-blur-xl shadow-2xl overflow-hidden">
          <div className="relative p-8">
            {/* Top bar with back and skip */}
            <div className="absolute top-4 left-4 right-4 flex justify-between items-center">
              {step > 0 ? (
                <button
                  onClick={handleBack}
                  className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Back
                </button>
              ) : (
                <div />
              )}
              <button
                onClick={handleSkip}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Skip
              </button>
            </div>

            {/* Step 0: Welcome */}
            {step === 0 && (
              <div className="text-center animate-in fade-in slide-in-from-bottom-4 duration-700 pt-6">
                <div className="inline-flex items-center justify-center w-24 h-24 mb-6">
                  {/* <Sparkles className="w-8 h-8 text-foreground" /> */}
                  <Image
                    src="/favicon.png"
                    alt="eduvids logo"
                    width={80}
                    height={80}
                    className="w-22 h-22"
                  />
                </div>
                <h1 className="text-4xl font-bold text-foreground mb-3">
                  Welcome to eduvids
                </h1>
                <p className="text-lg text-muted-foreground mb-8 max-w-md mx-auto">
                  Create stunning educational videos with AI. Just describe what
                  you want to explain, and we'll generate it for you.
                </p>
                <Button onClick={handleNext} size="lg" className="gap-2">
                  See what's possible
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            )}

            {/* Step 1: Example video showcase */}
            {step === 1 && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 pt-6">
                <div className="text-center mb-4">
                  <h2 className="text-2xl font-semibold mb-2">
                    Here's what we can create
                  </h2>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto">
                    Einstein's Relativity Explained: From E=mc² to Gravitational
                    Lensing
                  </p>
                </div>

                {/* YouTube video embed */}
                <div className="relative rounded-xl overflow-hidden bg-muted mb-6 aspect-video">
                  <iframe
                    src="https://www.youtube.com/embed/WlrzQBjRy_c?autoplay=0&rel=0"
                    title="Einstein's Relativity Explained"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="absolute inset-0 w-full h-full"
                  />
                </div>

                <div className="flex justify-center">
                  <Button onClick={handleNext} size="lg" className="gap-2">
                    Continue
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* Step 2: Social sharing showcase */}
            {step === 2 && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 pt-6">
                <div className="text-center mb-6">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-foreground/10 mb-4">
                    <Share2 className="w-7 h-7 text-foreground" />
                  </div>
                  <h2 className="text-2xl font-semibold mb-2">
                    Auto-published everywhere
                  </h2>
                  <p className="text-muted-foreground max-w-sm mx-auto">
                    Every video you create is automatically uploaded to our
                    community channels
                  </p>
                </div>

                <div className="space-y-3 mb-8">
                  {/* YouTube */}
                  <Link
                    href="https://youtube.com/@eduvids-ai"
                    target="_blank"
                    className="flex items-center gap-4 p-4 rounded-xl border border-border bg-background/50 hover:bg-accent/50 transition-colors group"
                  >
                    <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-foreground/10 flex items-center justify-center">
                      <Youtube className="w-6 h-6 text-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground">YouTube</p>
                      <p className="text-sm text-muted-foreground">
                        @eduvids-ai
                      </p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                  </Link>

                  {/* X/Twitter */}
                  <Link
                    href="https://x.com/eduvidsai"
                    target="_blank"
                    className="flex items-center gap-4 p-4 rounded-xl border border-border bg-background/50 hover:bg-accent/50 transition-colors group"
                  >
                    <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-foreground/10 flex items-center justify-center">
                      <Twitter className="w-6 h-6 text-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground">X (Twitter)</p>
                      <p className="text-sm text-muted-foreground">
                        @eduvidsai
                      </p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                  </Link>
                </div>

                <div className="flex justify-center">
                  <Button onClick={handleNext} size="lg" className="gap-2">
                    See example prompts
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* Step 3: Examples showcase */}
            {step === 3 && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 pt-6">
                <div className="text-center mb-6">
                  <h2 className="text-2xl font-semibold mb-2">
                    Try an example
                  </h2>
                  <p className="text-muted-foreground">
                    Click any example to try it, or write your own
                  </p>
                </div>

                <div className="grid gap-3 mb-6">
                  {EXAMPLES.map((example, i) => (
                    <button
                      key={i}
                      onClick={() => handleExampleClick(example.prompt)}
                      className="group relative flex items-center gap-4 p-4 rounded-xl border border-border bg-background/50 hover:bg-accent/50 transition-all duration-200 text-left"
                    >
                      <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-foreground/10 flex items-center justify-center">
                        <Play className="w-4 h-4 text-foreground/70 group-hover:text-foreground transition-colors" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {example.prompt}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {example.category}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
                    </button>
                  ))}
                </div>

                <div className="flex justify-center">
                  <Button onClick={handleNext} size="lg" className="gap-2">
                    Write my own
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* Step 4: Create first video */}
            {step === 4 && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 pt-6">
                <div className="text-center mb-6">
                  <h2 className="text-2xl font-semibold mb-2">
                    Create your first video
                  </h2>
                  <p className="text-muted-foreground">
                    Describe what you want to explain and we'll generate a video
                  </p>
                </div>

                <PromptInput onSubmit={handleSubmit}>
                  <PromptInputTextarea
                    onChange={(e) => setInput(e.target.value)}
                    value={input}
                    placeholder="Describe your video idea here..."
                    className="min-h-[100px]"
                  />
                  <PromptInputToolbar>
                    <PromptInputTools>
                      <div className="inline-flex gap-1">
                        <PromptInputButton
                          onClick={() =>
                            setGenerationMode((mode) =>
                              mode === "video" ? null : "video"
                            )
                          }
                          variant={
                            generationMode === "video" ? "default" : "outline"
                          }
                        >
                          <Monitor className="size-4" />
                          Video
                        </PromptInputButton>
                        <PromptInputButton
                          onClick={() =>
                            setGenerationMode((mode) =>
                              mode === "short" ? null : "short"
                            )
                          }
                          variant={
                            generationMode === "short" ? "default" : "outline"
                          }
                        >
                          <Smartphone className="size-4" />
                          Short
                        </PromptInputButton>
                      </div>
                    </PromptInputTools>
                    <PromptInputSubmit disabled={!input.trim()} />
                  </PromptInputToolbar>
                </PromptInput>
              </div>
            )}

            {/* Progress dots */}
            <div className="flex justify-center gap-2 mt-8">
              {Array.from({ length: totalSteps }).map((_, s) => (
                <button
                  key={s}
                  onClick={() => setStep(s)}
                  className={`h-2 rounded-full transition-all duration-300 ${
                    step === s
                      ? "w-6 bg-foreground"
                      : "w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
