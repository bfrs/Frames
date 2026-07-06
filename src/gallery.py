"""Load reel gallery entries from paired MP4 + generation-record TXT files."""

from __future__ import annotations

from pathlib import Path
from typing import Any

GALLERY_REL_DIR = Path("assets") / "videos" / "new  videos"

MODEL_DISPLAY: dict[str, str] = {
    "x-ai/grok-imagine-video": "Grok Video",
    "google/veo-3.1": "Veo 3.1",
    "bytedance/seedance-2.0": "Seedance 2.0",
    "alibaba/wan-2.7": "Wan 2.7",
}

_PROMPT_SECTION = "VIDEO GENERATION PROMPT"
_MANUAL_EDIT_NOTE = "Note: This prompt was edited manually after the last API-generated version."


def _display_name(model_id: str) -> str:
    model_id = model_id.strip()
    if not model_id:
        return "Unknown"
    return MODEL_DISPLAY.get(model_id, model_id)


def parse_generation_record(text: str) -> dict[str, str]:
    """Extract model, prompt, and timestamp from a generation-record TXT file."""
    model_id = ""
    generated_at = ""
    prompt = ""
    product_name = ""

    for line in text.splitlines():
        if line.startswith("Generated at:"):
            generated_at = line.split(":", 1)[1].strip()
        elif line.startswith("Video model:"):
            model_id = line.split(":", 1)[1].strip()
        elif line.startswith("Product name:"):
            product_name = line.split(":", 1)[1].strip()

    marker_idx = text.find(_PROMPT_SECTION)
    if marker_idx >= 0:
        after = text[marker_idx + len(_PROMPT_SECTION) :]
        lines = after.lstrip("\n").splitlines()
        if lines and set(lines[0].strip()) == {"="}:
            lines = lines[1:]
        prompt_lines: list[str] = []
        for line in lines:
            stripped = line.strip()
            if stripped == _MANUAL_EDIT_NOTE:
                break
            prompt_lines.append(line)
        while prompt_lines and not prompt_lines[-1].strip():
            prompt_lines.pop()
        prompt = "\n".join(prompt_lines).strip()

    return {
        "modelId": model_id,
        "model": _display_name(model_id),
        "prompt": prompt,
        "generatedAt": generated_at,
        "productName": product_name,
    }


def list_gallery_items(root: Path) -> list[dict[str, Any]]:
    """Scan the gallery folder for MP4 files with a matching .txt sidecar."""
    gallery_dir = root / GALLERY_REL_DIR
    if not gallery_dir.is_dir():
        return []

    items: list[dict[str, Any]] = []
    for mp4 in sorted(gallery_dir.glob("*.mp4")):
        txt_path = mp4.with_suffix(".txt")
        if not txt_path.is_file():
            continue

        try:
            record = parse_generation_record(txt_path.read_text(encoding="utf-8"))
        except OSError:
            continue

        rel_src = f"{GALLERY_REL_DIR.as_posix()}/{mp4.name}"
        items.append(
            {
                "id": mp4.stem,
                "src": rel_src,
                "modelId": record["modelId"],
                "model": record["model"],
                "prompt": record["prompt"] or None,
                "generatedAt": record["generatedAt"] or None,
                "productName": record["productName"] or None,
            }
        )

    def sort_key(entry: dict[str, Any]) -> tuple[int, str]:
        ts = entry.get("generatedAt") or ""
        return (0 if ts else 1, ts)

    items.sort(key=sort_key, reverse=True)
    return items
