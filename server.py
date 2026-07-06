#!/usr/bin/env python3
"""Serve the static UI and proxy prompt generation + reel rendering APIs."""

from __future__ import annotations

import json
import os
import socket
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, Response, jsonify, request, send_from_directory

from src.http_client import configure_ssl
from src.image_prep import normalize_image_for_chat
from src.text_gen import DEFAULT_TEXT_GEN_MODEL, MAX_PROMPT_CHARS, _mime_type, generate_product_prompt
from src.video_gen import (
    _video_model,
    resolve_duration,
    fetch_video_content,
    format_to_aspect_ratio,
    poll_video_job,
    submit_video_job,
)
from src.gallery import list_gallery_items
from src.openrouter_credits import fetch_openrouter_credits
from src.video_models import VIDEO_MODELS

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / ".env")
configure_ssl()

app = Flask(__name__, static_folder=str(ROOT), static_url_path="")


def _usd_to_inr() -> float:
    try:
        return float(os.getenv("USD_TO_INR", "83"))
    except (TypeError, ValueError):
        return 83.0


@app.get("/api/config")
def api_config():
    try:
        models = VIDEO_MODELS
        default_model = models[0]["model_name"]
    except RuntimeError:
        models = []
        default_model = ""

    return jsonify(
        {
            "textGenModel": os.getenv("TEXT_GEN_MODEL", DEFAULT_TEXT_GEN_MODEL),
            "provider": "OpenRouter",
            "videoModel": default_model,
            "videoModels": models,
            "videoProvider": "OpenRouter",
            "currency": "INR",
            "maxPromptChars": MAX_PROMPT_CHARS,
        }
    )




@app.post("/api/generate-prompt")
def api_generate_prompt():
    specs_raw = request.form.get("specs", "")
    if not specs_raw:
        return jsonify({"error": "Missing specs field"}), 400

    try:
        specs = json.loads(specs_raw)
    except json.JSONDecodeError:
        return jsonify({"error": "Invalid specs JSON"}), 400

    images: list[tuple[str, bytes, str]] = []
    for storage in request.files.getlist("images"):
        if not storage or not storage.filename:
            continue
        raw = storage.read()
        if not raw:
            continue
        mime = storage.mimetype or _mime_type(storage.filename)
        norm_raw, norm_mime = normalize_image_for_chat(raw, mime, storage.filename)
        images.append((storage.filename, norm_raw, norm_mime))

    specs["imageCount"] = len(images)

    try:
        result = generate_product_prompt(specs, images)
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 502
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 502

    return jsonify(result)


@app.post("/api/generate-reel")
def api_generate_reel():
    prompt = (request.form.get("prompt") or "").strip()
    if not prompt:
        return jsonify({"error": "Missing prompt"}), 400
    if len(prompt) > MAX_PROMPT_CHARS:
        return jsonify(
            {"error": f"Prompt is too long ({len(prompt)} characters). Maximum is {MAX_PROMPT_CHARS}."}
        ), 400

    format_key = (request.form.get("format") or "9-16-reel").strip()
    aspect_ratio = format_to_aspect_ratio(format_key)

    model = _video_model((request.form.get("model") or "").strip() or None)

    try:
        duration_raw = int(request.form.get("duration", "15"))
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid duration"}), 400

    duration = resolve_duration(duration_raw, model)
    duration_clamped = duration != duration_raw

    images: list[tuple[str, bytes, str]] = []
    for storage in request.files.getlist("images"):
        if not storage or not storage.filename:
            continue
        raw = storage.read()
        if not raw:
            continue
        mime = storage.mimetype or _mime_type(storage.filename)
        images.append((storage.filename, raw, mime))

    try:
        job = submit_video_job(
            prompt=prompt,
            duration_sec=duration,
            aspect_ratio=aspect_ratio,
            images=images or None,
            model=model,
        )
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 502

    return jsonify(
        {
            "jobId": job.get("id"),
            "status": job.get("status", "pending"),
            "model": model,
            "aspectRatio": aspect_ratio,
            "duration": duration,
            "durationClamped": duration_clamped,
            "imageCount": len(images),
        }
    ), 202


@app.get("/api/reel-status/<job_id>")
def api_reel_status(job_id: str):
    try:
        status = poll_video_job(job_id)
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 502

    payload: dict[str, object] = {
        "jobId": status.get("id", job_id),
        "status": status.get("status", "pending"),
    }
    if status.get("error"):
        payload["error"] = status["error"]
    if status.get("status") == "completed":
        payload["videoUrl"] = f"/api/reel-video/{job_id}"
        cost_usd = (status.get("usage") or {}).get("cost")
        if cost_usd is not None:
            payload["cost"] = float(cost_usd) * _usd_to_inr()
    return jsonify(payload)


@app.get("/api/gallery")
def api_gallery():
    return jsonify({"items": list_gallery_items(ROOT)})


@app.get("/api/openrouter-credits")
def api_openrouter_credits():
    try:
        credits = fetch_openrouter_credits()
    except RuntimeError as exc:
        return jsonify({"available": False, "error": str(exc)}), 502

    remaining = float(credits["remaining"])
    return jsonify(
        {
            "available": True,
            "remaining": remaining,
            "currency": "USD",
            "remainingInr": remaining * _usd_to_inr(),
            "source": credits.get("source"),
        }
    )


@app.get("/api/reel-video/<job_id>")
def api_reel_video(job_id: str):
    try:
        status = poll_video_job(job_id)
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 502

    if status.get("status") != "completed":
        return jsonify({"error": "Video is not ready yet"}), 409

    try:
        data, content_type = fetch_video_content(job_id)
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 502

    return Response(data, mimetype=content_type)


@app.get("/")
def index():
    return send_from_directory(ROOT, "index.html")


@app.get("/<path:asset_path>")
def assets(asset_path: str):
    return send_from_directory(ROOT, asset_path)


def find_available_port(preferred: int, host: str = "0.0.0.0", attempts: int = 20) -> int:
    """Use preferred port, or the next free port if it is already taken."""
    for offset in range(attempts):
        port = preferred + offset
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                sock.bind((host, port))
            except OSError:
                continue
            return port
    raise RuntimeError(
        f"No free port found in range {preferred}-{preferred + attempts - 1}"
    )


if __name__ == "__main__":
    preferred = int(os.getenv("PORT", "8888"))
    host = os.getenv("HOST", "0.0.0.0")
    port = find_available_port(preferred, host=host)
    if port != preferred:
        print(f"Port {preferred} is in use — starting on http://localhost:{port}/")
    else:
        print(f"Starting on http://localhost:{port}/")
    app.run(host=host, port=port, debug=True)
