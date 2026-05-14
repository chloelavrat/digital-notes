# Digital Notes

Transform any document or image into clean, structured Markdown — powered by Claude.

## What it does

Drop a PDF, image, DOCX, or text file (up to 10 at once). The app extracts all content using Claude and returns:

- A structured **Markdown** document with YAML frontmatter (title, description, date, tags)
- A styled **PDF** preview (A4, system font)
- A live **HTML** rendering with Mermaid diagrams
- An **editable** raw Markdown source

Results can be copied, downloaded as `.md`, or sent directly to **Apple Notes** as embedded text.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19, Vite 8, Tailwind CSS 4, DaisyUI 5 |
| Backend | Express 5, Multer, Anthropic SDK |
| AI | `claude-opus-4-7` (extraction) · `claude-haiku-4-5` (metadata) |
| Diagrams | Mermaid.js (lazy-loaded) |
| PDF thumbnails | pdf.js (canvas, no iframe) |
| Deployment | Docker → GCP Cloud Run |
| Font | Sligoil Micro |

## Local development

```bash
# 1. Install dependencies
npm install

# 2. Set your Anthropic API key
cp .env.example .env
# edit .env → ANTHROPIC_API_KEY=sk-ant-...

# 3. Start (Vite + Express in parallel)
npm run dev
```

Vite runs on `http://localhost:5173` and proxies `/api` to the Express server on port `3001`.

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | ✅ | Your Anthropic API key |
| `PORT` | — | Server port (`3001` for local dev, Cloud Run sets it automatically) |
| `AUTH_ENABLED` | — | Set to `true` to enable the login gate (default: `false`) |
| `AUTH_USERS` | — | Comma-separated `user:password` pairs — e.g. `alice:pass1,bob:pass2` |
| `AUTH_SECRET` | — | Secret used to sign session cookies — **change this in production** |

### Login protection

The login gate is **off by default**. To enable it:

```bash
AUTH_ENABLED=true
AUTH_USERS=alice:secret1,bob:secret2
AUTH_SECRET=a-long-random-string-change-me
```

- Users see the home page freely; the login screen appears when they first try to upload
- After signing in, a `httpOnly` cookie (7-day expiry) keeps them authenticated
- Multiple users with different credentials are supported via `AUTH_USERS`
- Legacy single-user format (`AUTH_USERNAME` / `AUTH_PASSWORD`) is still supported

> **Production tip:** generate `AUTH_SECRET` with `openssl rand -hex 32` and store it as a Cloud Run secret env var.

## Supported file types

| Type | Preview in queue |
|---|---|
| JPEG · PNG · WEBP · GIF | Image thumbnail |
| PDF | First-page canvas thumbnail (pdf.js) |
| TXT · CSV · HTML | Text preview |
| DOCX | File icon |

## Production build

```bash
npm run build          # builds frontend to dist/
node server.js         # serves dist/ + /api on $PORT
```

## Docker

```bash
docker build -t digital-notes .
docker run -p 8080:8080 -e ANTHROPIC_API_KEY=sk-ant-... digital-notes
```

The multi-stage Dockerfile produces a minimal `node:alpine` image. Compatible with GCP Cloud Run (`$PORT` env var).

## Regenerate app icon

```bash
npm run generate:icons   # writes public/apple-touch-icon.png (180×180, no deps)
```

## Features

- **Multi-file** — queue up to 10 files, processed in parallel
- **Streaming** — text appears as Claude writes it; results available as each file finishes
- **Split view** — original document on the left, extracted content on the right
- **Scan animation** — visual feedback while a file is being processed
- **Mermaid** — diagrams physically drawn in the source are converted to Mermaid syntax and rendered
- **Digital twin** — faithful 1-to-1 extraction; nothing invented, nothing paraphrased
- **Light / dark** — theme toggle, preference saved in `localStorage`
- **PWA** — installable on iPhone via Safari → Add to Home Screen

## Author

[Chloé Lavrat](https://chloelavrat.com)
