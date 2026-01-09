# AGENTS.md

## Commands

- `bun dev` - Start dev server with Turbopack
- `bun build` - Production build
- `bun check` - Run ESLint + TypeScript typecheck
- `bun lint` / `bun lint:fix` - Lint with ESLint
- `bun typecheck` - TypeScript type checking only
- `bun format:write` / `bun format:check` - Prettier formatting

- ALWAYS use 'bun' as the package manager.

## Architecture

- **Next.js 16** app with App Router, React 19, Tailwind CSS 4
- **src/app/** - Pages and API routes (chat, jobs, inngest, health)
- **src/components/** - React components; UI primitives in `ui/` (shadcn/ui new-york style)
- **src/lib/** - Core logic: LLM providers (OpenAI, Google, Groq, Cerebras), E2B sandbox, Inngest background jobs, YouTube integration, Manim layout engine
- **Vercel KV** for job storage; **Uploadthing** for file uploads; **Inngest** for async jobs

## Code Style

- TypeScript strict mode; use `@/*` path aliases (maps to `src/*`)
- Use `cn()` from `@/lib/utils` for className merging
- Functional components with explicit types; Zod for validation
- Prefer named exports; imports: external libs first, then `@/` aliases
