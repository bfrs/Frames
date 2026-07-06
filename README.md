---
title: Frames
emoji: 🎬
colorFrom: blue
colorTo: purple
sdk: docker
app_port: 7860
---

# Frames — Product-to-Reel Walkthrough

**Frames** turns product photos and campaign settings into short AI video ad drafts. Upload images, describe your product, generate a model-specific video prompt, then render a reel — all from one page. Your OpenRouter API key stays on the server.

Follow this guide top to bottom — no other docs required.

---

## Prerequisites

- [OpenRouter](https://openrouter.ai) account and API key (powers both prompt writing and video rendering)
- [Docker](https://docs.docker.com/get-docker/) with Docker Compose v2
- A modern browser

---

## Setup

### 1. Clone the repo

```bash
git clone https://github.com/bfrs/Frames video_interface
cd video_interface
```

### 2. Add your API key

```bash
cp .env.example .env
```

Edit `.env` and set your key:

```env
OPENROUTER_API_KEY=sk-or-v1-...
```

Other variables in `.env.example` are optional and have sensible defaults.

> Never commit `.env`. The browser never sees your API key — all OpenRouter calls go through the Flask backend.

### 3. Start with Docker

```bash
docker compose up --build -d
```

Open **http://localhost:7860/**

Useful commands:

```bash
docker compose logs -f    # follow logs
docker compose down       # stop
```

To use a different host port, set `PORT` in `.env` (e.g. `PORT=8080`) and restart.

Verify the backend:

```bash
curl http://localhost:7860/api/config
```

---

## Create your first reel

1. Click **Create Your Reel** on the landing page.
2. **Product setup** (left panel) — upload product images, fill in name, format, duration, key message, style, and video model.
3. **Generate Prompt** (center panel) — the server writes a model-specific prompt from your specs. Edit it if you like.
4. **Generate Reel** (right panel) — submit the job, wait for processing (often 1–5 minutes), then preview and download the MP4 plus a generation record (TXT).

Scroll down to the **Gallery** to browse bundled sample reels.

---

## Supported video models

| Model | Durations |
|-------|-----------|
| Seedance 2.0 | 4–15s |
| Grok Video | 1–10s |
| Veo 3.1 | 8s fixed |
| Wan 2.7 | 2–10s |

One OpenRouter key routes to all models — no separate provider accounts needed.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `OPENROUTER_API_KEY must be set` | Add your key to `.env` and run `docker compose up --build -d` again |
| Prompt generation fails | Check `TEXT_GEN_MODEL` exists on OpenRouter and you have credits |
| Reel stuck on "processing" | Wait; check `docker compose logs -f` |
| Port already in use | Set `PORT=8080` in `.env` and restart |

---

## Deploy to Hugging Face Spaces

1. Create a Space with **Docker** as the SDK.
2. Add `OPENROUTER_API_KEY` (and any other vars) under **Settings → Secrets**.
3. Push this repo to the Space.

The image listens on port **7860** (configured in the YAML front matter above).

Test the image locally before pushing:

```bash
docker build -t frames .
docker run -p 7860:7860 --env-file .env frames
```

---

## Notes

- Prototype for demonstration — not production-ready.
- Estimated reel cost comes from the model catalog; actual cost appears after OpenRouter reports usage.
- API routes: `/api/config`, `/api/generate-prompt`, `/api/generate-reel`, `/api/reel-status/<id>`, `/api/reel-video/<id>`, `/api/gallery`, `/api/openrouter-credits`.
