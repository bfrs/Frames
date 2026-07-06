# All-in-one image: static UI, Flask API, sample catalogue assets, and Python deps.
FROM python:3.12-slim

# Runtime libs for Pillow (JPEG/PNG/WebP) and HTTPS API calls to OpenRouter.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        libjpeg62-turbo \
        libpng16-16t64 \
        libwebp7 \
        zlib1g \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -m -u 1000 user

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app
RUN chown user:user /app

# Install locked dependencies before copying the full app (better layer cache).
COPY --chown=user pyproject.toml uv.lock ./
USER user
ENV UV_PYTHON=/usr/local/bin/python3 \
    UV_PYTHON_PREFERENCE=only-system
RUN uv sync --frozen --no-dev --no-install-project

# App source, static UI, and bundled sample reel catalogue.
COPY --chown=user . .

ENV HOME=/home/user \
    PATH=/app/.venv/bin:/home/user/.local/bin:$PATH \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    HOST=0.0.0.0 \
    PORT=7860

EXPOSE 7860

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:7860/api/config', timeout=5)"

# Long timeout for OpenRouter video job polling and large MP4 responses
CMD ["sh", "-c", "exec gunicorn --bind 0.0.0.0:${PORT} --workers 1 --timeout 300 --graceful-timeout 60 --access-logfile - --error-logfile - server:app"]
