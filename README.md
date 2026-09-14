# 📚 eduvids

![Vercel Deploy](https://img.shields.io/badge/deploy-vercel-black?logo=vercel)  
![Manim](https://img.shields.io/badge/made%20with-manim-blue?logo=python)  
![Stars](https://img.shields.io/github/stars/namanbnsl/eduvids?style=social)  
![Issues](https://img.shields.io/github/issues/namanbnsl/eduvids)

**eduvids** lets you create educational videos using just text prompts.

- 🌐 Try it here (no sign-in required): [https://eduvids.app](https://eduvids.app)
- ▶️ Watch community creations: [eduvids on YouTube](https://www.youtube.com/channel/UCws8TdWGs-Fo4UsBay3GtFA)
- X: [https://x.com/eduvidsai](https://x.com/eduvidsai)

---

## 🚀 Using the Online Version

1. Open [eduvids](https://eduvids.app).
2. Enter any topic you'd like explained as a video, or press **Video** and enter the same. (you can also generate vertical YouTube Shorts)
3. Wait while the servers render your video. (You can switch tabs, but don’t close it.)
4. Once ready, the video will appear on the page, and you’ll get a notification.

💡 **Tip:** If you accidentally close the tab or want to revisit your video, check the [eduvids YouTube Channel](https://www.youtube.com/@eduvids-ai)—your video will be uploaded there automatically. Links to all videos will also be available on the [eduvids X account](https://x.com/eduvidsai)

---

## 🛠️ Running Locally

1. Clone the repository:

```bash
# Clone the repository
git clone https://github.com/namanbnsl/eduvids
cd eduvids

# Install dependencies (any of the following)
npm install
pnpm install
yarn install
bun install

```

2. Install the E2B CLI from here: [https://e2b.dev/docs/cli](https://e2b.dev/docs/cli)

3. Build the E2B sandbox (requires Docker):

```bash
cd sandbox-templates/manim-ffmpeg-latex-voiceover-watermark # This is the latest template
e2b template build --name manim-ffmpeg-latex-voiceover-watermark
```

4. Get your `GOOGLE_GENERATIVE_AI_API_KEY` from [https://aistudio.google.com/](https://aistudio.google.com/)
5. Get your `E2B_API_KEY` from [https://e2b.dev](https://e2b.dev) or the `e2b.toml` file created after building the sandbox.
6. Get your `KV_****` API KEYS from [https://vercel.com](https://vercel.com) by creating an Upstash storage service.
7. Get your `UPLOADTHING_****` API KEYS from [https://uploadthing.com](https://uploadthing.com) by creating a new project.
8. Rename `.env.example` to `.env` and fill in with your environment variables. (YouTube keys are optional)

9. Run the server:

```bash
# Start the development server
npm run dev
```

10. Visit [http://localhost:3000](http://localhost:3000) and start using the app.

---

## 📺 Setting up automatic YouTube uploads (optional)

1. Visit Google Cloud Console and create an **OAuth desktop service**. Your `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` will be available here.
2. Edit `helper/get_google_refresh_token.mjs` with your `CLIENT_ID` and `CLIENT_SECRET` at the given places.
3. Getting your `GOOGLE_REFRESH_TOKEN`:

```bash
# Visit the auth screen and allow permissions for your YouTube channel. The REFRESH_TOKEN will be visible on the console after that.
node helper/get_google_refresh_token.mjs
```

4. Edit your `YOUTUBE_PRIVACY_STATUS` in `.env` based on what you want as the visibility for your videos `(public | unlisted | private)`. Default is `public`. If your refresh token predates previous-video linking, run the helper again so the new token includes channel and comment access.

## 📺 Setting up automatic X uploads (optional)

1. Visit the X developer API console and fill in the required values in `.env`
