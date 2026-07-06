"""Crop and resize reference images to match video frame dimensions."""

from __future__ import annotations

import io

from PIL import Image

_FORMAT_TO_MIME = {
    "JPEG": "image/jpeg",
    "PNG": "image/png",
    "WEBP": "image/webp",
    "GIF": "image/gif",
}


def normalize_image_for_chat(raw: bytes, mime: str = "", filename: str = "") -> tuple[bytes, str]:
    """Ensure image bytes use a format accepted by OpenRouter vision APIs."""
    with Image.open(io.BytesIO(raw)) as img:
        fmt = (img.format or "").upper()
        if fmt in _FORMAT_TO_MIME:
            return raw, _FORMAT_TO_MIME[fmt]

        has_alpha = img.mode in ("RGBA", "LA") or (
            img.mode == "P" and "transparency" in img.info
        )
        out = io.BytesIO()
        if has_alpha:
            img.convert("RGBA").save(out, format="PNG", optimize=True)
            return out.getvalue(), "image/png"

        img.convert("RGB").save(out, format="JPEG", quality=92, optimize=True)
        return out.getvalue(), "image/jpeg"


_RESOLUTION_BASE: dict[str, int] = {
    "480p": 480,
    "720p": 720,
    "1080p": 1080,
}


def video_dimensions(aspect_ratio: str, resolution: str = "720p") -> tuple[int, int]:
    """Map aspect ratio + resolution to output width/height in pixels."""
    parts = aspect_ratio.strip().split(":")
    if len(parts) != 2:
        raise ValueError(f"Invalid aspect ratio: {aspect_ratio!r}")

    ar_w, ar_h = int(parts[0]), int(parts[1])
    if ar_w <= 0 or ar_h <= 0:
        raise ValueError(f"Invalid aspect ratio: {aspect_ratio!r}")

    base = _RESOLUTION_BASE.get(resolution.strip(), 720)
    if ar_w >= ar_h:
        height = base
        width = round(base * ar_w / ar_h)
    else:
        width = base
        height = round(base * ar_h / ar_w)

    width -= width % 2
    height -= height % 2
    return width, height


def crop_and_resize_image(raw: bytes, target_w: int, target_h: int) -> tuple[bytes, str]:
    """Center-crop to aspect ratio, then resize to exact target dimensions."""
    if target_w <= 0 or target_h <= 0:
        raise ValueError("Target dimensions must be positive")

    with Image.open(io.BytesIO(raw)) as img:
        img = img.convert("RGB")
        src_w, src_h = img.size
        target_ar = target_w / target_h
        src_ar = src_w / src_h

        if src_ar > target_ar:
            new_w = int(src_h * target_ar)
            left = (src_w - new_w) // 2
            img = img.crop((left, 0, left + new_w, src_h))
        elif src_ar < target_ar:
            new_h = int(src_w / target_ar)
            top = (src_h - new_h) // 2
            img = img.crop((0, top, src_w, top + new_h))

        if img.size != (target_w, target_h):
            img = img.resize((target_w, target_h), Image.Resampling.LANCZOS)

        out = io.BytesIO()
        img.save(out, format="JPEG", quality=92, optimize=True)
        return out.getvalue(), "image/jpeg"
