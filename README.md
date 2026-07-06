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

---

## Setup

These steps work on **Windows**, **macOS**, and **Linux**. Open a terminal in the project folder when commands are shown:

| OS | Terminal |
|----|----------|
| **Windows** | [PowerShell](https://learn.microsoft.com/en-us/powershell/) or [WSL](https://learn.microsoft.com/en-us/windows/wsl/) (recommended with Docker Desktop) |
| **macOS** | Terminal or iTerm |
| **Linux** | Your distro’s default terminal |

### 1. Install Docker

You need Docker with Compose v2 (`docker compose`). Install for your OS, then confirm it works (see below).

**Windows**

1. Install [Docker Desktop for Windows](https://docs.docker.com/desktop/setup/install/windows-install/).
2. Use the **WSL 2** backend when prompted (recommended).
3. Launch **Docker Desktop** and wait until it reports the engine is running.

**macOS**

1. Install [Docker Desktop for Mac](https://docs.docker.com/desktop/setup/install/mac-install/) — pick **Apple Silicon** or **Intel** to match your Mac.
2. Open **Docker Desktop** and wait until the engine is running.

**Linux**

1. Follow the [Docker Engine install guide](https://docs.docker.com/engine/install/) for your distribution.
2. Start Docker and allow your user to run it without `sudo`:

```bash
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
# log out and back in (or run: newgrp docker) so the group change applies
```

**All platforms** — confirm Docker is working:

```bash
docker --version
docker compose version
docker run --rm hello-world
```

### 2. Clone the repo

```bash
git clone https://github.com/bfrs/Frames video_interface
cd video_interface
```

([Git for Windows](https://git-scm.com/download/win) includes Git Bash if you don’t have `git` yet.)

### 3. Add your API key

Create `.env` from the example:

```bash
# macOS, Linux, Git Bash, WSL
cp .env.example .env
```

```powershell
# Windows PowerShell
Copy-Item .env.example .env
```

Edit `.env` in any text editor (Notepad, VS Code, nano, etc.) and set your key:

```env
OPENROUTER_API_KEY=sk-or-v1-...
```

Other variables in `.env.example` are optional and have sensible defaults.

> Never commit `.env`. The browser never sees your API key — all OpenRouter calls go through the Flask backend.

### 4. Build and run

From the project root:

```bash
docker compose up --build -d
```

The first build may take a few minutes. When the container is healthy, open **http://localhost:7860/** in your browser.

Check status:

```bash
docker compose ps
```

Verify the API (any one of these):

```bash
# macOS, Linux, WSL, Git Bash — also Windows 10+ PowerShell/cmd
curl http://localhost:7860/api/config
```

```powershell
# Windows PowerShell (if curl is unavailable)
Invoke-WebRequest http://localhost:7860/api/config
```

Or open **http://localhost:7860/api/config** in your browser — you should see JSON.

Useful commands:

```bash
docker compose logs -f    # follow logs
docker compose down       # stop and remove containers
docker compose up --build -d   # rebuild after code or .env changes
```

To use a different host port, add `PORT=8080` to `.env` and restart (`docker compose down` then `docker compose up --build -d`). The app inside the container always listens on **7860**; Compose maps your host port to that.

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
| `Cannot connect to the Docker daemon` | **Windows / macOS:** open Docker Desktop and wait until it is running. **Linux:** `sudo systemctl start docker` |
| `permission denied` on `docker` | **Linux:** `sudo usermod -aG docker $USER`, then log out and back in. **Windows / macOS:** restart Docker Desktop |
| WSL / virtualization errors (Windows) | Enable [WSL 2](https://learn.microsoft.com/en-us/windows/wsl/install) and virtualization in BIOS; reinstall Docker Desktop with the WSL 2 backend |
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
