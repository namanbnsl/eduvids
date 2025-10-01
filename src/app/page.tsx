import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="relative min-h-screen">
      {/* Subtle grid background */}
      <div className="pointer-events-none absolute inset-0 -z-10" />
      <div className="pointer-events-none absolute inset-0 -z-10 " />

      <header className="flex items-center justify-between px-6 md:px-10 py-6">
        <Link
          href="/"
          className="font-mono text-sm md:text-base text-zinc-500 hover:text-foreground transition-colors"
        >
          <span className="rounded-md border b\order-zinc-200/60 dark:border-zinc-800/60 px-2 py-1">
            brain.open()
          </span>
        </Link>
        <nav className="flex items-center gap-2">
          <Link href="/chat">
            <Button variant="outline">Open the brain</Button>
          </Link>
        </nav>
      </header>

      <main className="flex flex-col items-center justify-center mx-auto max-w-8xl px-6 md:px-10 min-h-[70vh]">
        <div className="flex flex-col items-center text-center gap-8">
          <p className="font-mono text-xs tracking-widest text-zinc-500">
            THE FUTURE OF EDUCATION WITH AI
          </p>
          <h1 className="text-4xl md:text-6xl font-semibold leading-tight">
            Learn faster with
            <span className="ml-2 inline-block rounded-lg border border-zinc-200/60 px-3 py-1 font-mono text-3xl md:text-5xl align-middle dark:border-zinc-800/60">
              brain.open()
            </span>
          </h1>
          <p className="max-w-2xl text-zinc-600 dark:text-zinc-300">
            An AI‑native learning OS: minimal, calm, and personal. <br />
            Ask. Explore. Master.
          </p>
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <Link href="/chat">
              <Button size="lg">Start chatting</Button>
            </Link>
            <Link
              href="#about"
              className="text-sm text-zinc-600 hover:text-foreground transition-colors"
            >
              Learn more →
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
