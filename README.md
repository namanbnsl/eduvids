To run this prototype:

1. Install dependencies:
```bash
pnpm install
```

2. Set up environment variables according to `.env.example`:

3. Run the local `inngest` server:
```bash
pnpx inngest-cli dev
```

4. Run the Next.js server:
```bash
pnpm run dev
```

5. Open `http://localhost:3000` in your browser.
6. Open `http://localhost:8288` in your browser to view the Inngest UI.

To setup Vercel KV, create an Upstash on Vercel Storage. 