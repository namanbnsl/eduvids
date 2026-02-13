# AGENTS.md

## Project Overview

**eduvids** - An AI-powered educational video generator that creates Manim-based videos from text prompts. Uses E2B sandboxes to render videos with LaTeX, voiceovers, and watermarks.

## Tech Stack

- **Framework**: Next.js 16 (App Router, Turbopack)
- **Language**: TypeScript (strict mode)
- **Package Manager**: Always use bun
- **Styling**: Tailwind CSS v4
- **UI Components**: Radix UI, shadcn/ui patterns
- **AI**: Vercel AI SDK with Google Gemini, Groq
- **Video Rendering**: E2B sandboxes running Manim + FFmpeg
- **Storage**: Vercel KV (for job updates), Uploadthing, Upstash Vector (RAG)
- **Workflows**: Upstash QStash workflows
- **Analytics**: Posthog (both web and AI analytics)

## Commands

```bash
# Development
bun run dev              # Start dev server + QStash CLI

# Type checking & linting
bun run typecheck        # TypeScript check (tsc --noEmit)
bun run lint             # ESLint
bun run check            # Both lint + typecheck

# Build
bun run build            # Production build

# Formatting
bun run format:write     # Format with Prettier
bun run format:check     # Check formatting

# RAG indexing
bun run rag:index        # Index RAG documents
bun run rag:reset        # Reset and reindex RAG
```

## Project Structure

```
src/
├── app/                 # Next.js App Router pages and API routes
├── components/          # React components
├── lib/
│   ├── actions/         # Server actions
│   ├── rag/             # RAG/vector search utilities
│   ├── workflow/        # Upstash workflow definitions
│   ├── e2b.ts           # E2B sandbox utilities
│   ├── llm.ts           # LLM configuration
│   └── youtube.ts       # YouTube upload integration
├── types/               # TypeScript type definitions
└── prompt.ts            # AI prompt templates
```

## Code Conventions

- Use `@/*` path alias for imports from `src/`
- Follow existing shadcn/ui component patterns in `src/components/ui/`
- Server components by default; use `"use client"` only when needed
- Use Zod for schema validation
- Environment variables defined in `.env` (see `.env.example`)

## E2B Sandbox (this is only built once, only build if specified.)

Sandbox templates are in `sandbox-templates/`. The main template is `manim-ffmpeg-latex-voiceover-watermark`. Build with E2B CLI:

```bash
cd sandbox-templates/manim-ffmpeg-latex-voiceover-watermark
e2b template build --name manim-ffmpeg-latex-voiceover-watermark
```

## Note for Agents

- Do not run the dev server on your own unless specified.
- Do not run other scripts by yourself unless specified. (eg. youtube tokens, RAG)
- Do not hallucinate layout engine functions.
- Do not to commit to git unless specified.
- Do not delete and remove anything unless given permission to run the command.
- You may run linting and type checking scripts
