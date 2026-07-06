"""Call OpenRouter's async video generation API."""

from __future__ import annotations

import base64
import os
import time
from typing import Any

from src.http_client import request as http_request
from src.image_prep import crop_and_resize_image, video_dimensions
from src.text_gen import MAX_PROMPT_CHARS
from src.video_models import VIDEO_MODELS

OPENROUTER_VIDEOS_URL = "https://openrouter.ai/api/v1/videos"

# UI format keys → OpenRouter aspect_ratio values
FORMAT_ASPECT_RATIO: dict[str, str] = {
    "9-16-reel": "9:16",
    "9-16-story": "9:16",
    "1-1-square": "1:1",
    "4-5-portrait": "3:4",
    "16-9-landscape": "16:9",
    "16-9-youtube": "16:9",
}

# grok-imagine-video supports 1–15 s; clamp longer UI values
DEFAULT_MAX_DURATION_SEC = 15


def _api_key() -> str:
    key = os.environ.get("OPENROUTER_API_KEY", "").strip()
    if not key:
        raise RuntimeError("OPENROUTER_API_KEY must be set in .env")
    return key





def _video_model(model_name: str | None = None) -> str:
    """Return a valid model name: the requested one if known, else the default."""
    models = VIDEO_MODELS
    names = [m["model_name"] for m in models]
    if model_name and model_name.strip() in names:
        return model_name.strip()
    return names[0]


def _max_duration_for(model_name: str) -> int:
    allowed = _durations_for(model_name)
    if allowed:
        return allowed[-1]
    for model in VIDEO_MODELS:
        if model["model_name"] == model_name:
            value = model.get("max_duration")
            try:
                if value is not None and int(value) > 0:
                    return int(value)
            except (TypeError, ValueError):
                break
    return DEFAULT_MAX_DURATION_SEC


def _durations_for(model_name: str) -> list[int]:
    for model in VIDEO_MODELS:
        if model["model_name"] != model_name:
            continue
        raw = model.get("durations")
        if not isinstance(raw, list):
            return []
        out: list[int] = []
        for item in raw:
            try:
                sec = int(item)
            except (TypeError, ValueError):
                continue
            if sec > 0:
                out.append(sec)
        return sorted(set(out))
    return []


def resolve_duration(duration: int, model_name: str) -> int:
    """Pick an allowed duration for the model (exact match or nearest)."""
    allowed = _durations_for(model_name)
    if not allowed:
        return clamp_duration(duration, _max_duration_for(model_name))
    if duration in allowed:
        return duration
    return min(allowed, key=lambda sec: abs(sec - duration))


def _headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {_api_key()}",
        "Content-Type": "application/json",
        "HTTP-Referer": os.environ.get("OPENROUTER_HTTP_REFERER", "http://localhost:8888"),
        "X-Title": os.environ.get("OPENROUTER_APP_TITLE", "Prompt-to-Reel Lab"),
    }


def format_to_aspect_ratio(format_key: str) -> str:
    return FORMAT_ASPECT_RATIO.get(format_key, "9:16")


def clamp_duration(duration: int, maximum: int = DEFAULT_MAX_DURATION_SEC) -> int:
    return max(1, min(int(duration), maximum))


def _image_ref(filename: str, raw: bytes, mime: str) -> dict[str, Any]:
    b64 = base64.b64encode(raw).decode("ascii")
    return {
        "type": "image_url",
        "image_url": {"url": f"data:{mime};base64,{b64}"},
    }


def submit_video_job(
    *,
    prompt: str,
    duration_sec: int,
    aspect_ratio: str,
    images: list[tuple[str, bytes, str]] | None = None,
    resolution: str = "720p",
    model: str | None = None,
) -> dict[str, Any]:
    """Submit a video job; returns OpenRouter submit response (id, status, polling_url)."""
    prompt = prompt.strip()
    if not prompt:
        raise ValueError("Prompt is required for video generation")
    if len(prompt) > MAX_PROMPT_CHARS:
        raise ValueError(
            f"Prompt is too long ({len(prompt)} characters). Maximum is {MAX_PROMPT_CHARS}."
        )

    model_name = _video_model(model)

    payload: dict[str, Any] = {
        "model": model_name,
        "prompt": prompt,
        "duration": resolve_duration(duration_sec, model_name),
        "aspect_ratio": aspect_ratio,
        "resolution": resolution,
    }

    refs = images or []
    if refs:
        target_w, target_h = video_dimensions(aspect_ratio, resolution)
        payload["input_references"] = [
            _image_ref(
                filename,
                *crop_and_resize_image(raw, target_w, target_h),
            )
            for filename, raw, _mime in refs[:7]
        ]

    try:
        response = http_request(
            "POST",
            OPENROUTER_VIDEOS_URL,
            headers=_headers(),
            json=payload,
            timeout=120,
        )
    except Exception as exc:
        raise RuntimeError(f"OpenRouter video request failed: {exc}") from exc

    if response.status_code not in (200, 202):
        detail = response.text.strip()[:500] or response.reason
        raise RuntimeError(f"OpenRouter video error ({response.status_code}): {detail}")

    try:
        data = response.json()
    except ValueError as exc:
        raise RuntimeError("OpenRouter returned invalid JSON") from exc

    job_id = data.get("id")
    if not job_id:
        raise RuntimeError("OpenRouter did not return a job id")

    return data


def poll_video_job(job_id: str) -> dict[str, Any]:
    """Poll job status from OpenRouter."""
    url = f"{OPENROUTER_VIDEOS_URL}/{job_id}"
    try:
        response = http_request(
            "GET",
            url,
            headers=_headers(),
            timeout=60,
            max_attempts=5,
        )
    except Exception as exc:
        raise RuntimeError(f"OpenRouter poll failed: {exc}") from exc

    if not response.ok:
        detail = response.text.strip()[:500] or response.reason
        raise RuntimeError(f"OpenRouter poll error ({response.status_code}): {detail}")

    try:
        return response.json()
    except ValueError as exc:
        raise RuntimeError("OpenRouter poll returned invalid JSON") from exc


def content_url_for_job(job_id: str, index: int = 0) -> str:
    return f"{OPENROUTER_VIDEOS_URL}/{job_id}/content?index={index}"


def fetch_video_content(job_id: str, index: int = 0) -> tuple[bytes, str]:
    """Download generated video bytes from OpenRouter."""
    url = content_url_for_job(job_id, index)
    try:
        response = http_request(
            "GET",
            url,
            headers=_headers(),
            timeout=300,
            stream=True,
            max_attempts=5,
        )
    except Exception as exc:
        raise RuntimeError(f"OpenRouter video download failed: {exc}") from exc

    if not response.ok:
        detail = response.text.strip()[:500] or response.reason
        raise RuntimeError(f"OpenRouter download error ({response.status_code}): {detail}")

    content_type = response.headers.get("Content-Type", "video/mp4")
    return response.content, content_type


def wait_for_video_job(
    job_id: str,
    *,
    poll_interval_sec: float = 10.0,
    timeout_sec: float = 600.0,
) -> dict[str, Any]:
    """Block until the job completes or fails (used only if needed)."""
    deadline = time.monotonic() + timeout_sec
    while time.monotonic() < deadline:
        status = poll_video_job(job_id)
        state = status.get("status", "")
        if state == "completed":
            return status
        if state in ("failed", "cancelled", "expired"):
            err = status.get("error") or f"Video generation {state}"
            raise RuntimeError(str(err))
        time.sleep(poll_interval_sec)
    raise RuntimeError("Video generation timed out")
