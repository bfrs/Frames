"""Fetch remaining OpenRouter account / key credits."""

from __future__ import annotations

import os
from typing import Any

from src.http_client import request as http_request

OPENROUTER_CREDITS_URL = "https://openrouter.ai/api/v1/credits"
OPENROUTER_KEY_URL = "https://openrouter.ai/api/v1/key"


def _api_key() -> str:
    key = os.environ.get("OPENROUTER_API_KEY", "").strip()
    if not key:
        raise RuntimeError("OPENROUTER_API_KEY must be set in .env")
    return key


def _headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {_api_key()}",
        "HTTP-Referer": os.environ.get("OPENROUTER_HTTP_REFERER", "http://localhost:8888"),
        "X-Title": os.environ.get("OPENROUTER_APP_TITLE", "Prompt-to-Reel Lab"),
    }


def _as_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def fetch_openrouter_credits() -> dict[str, Any]:
    """Return remaining USD credits from OpenRouter.

  Tries the account credits endpoint first, then per-key limit_remaining.
    """
    headers = _headers()
    errors: list[str] = []

    try:
        response = http_request(
            "GET",
            OPENROUTER_CREDITS_URL,
            headers=headers,
            timeout=30,
        )
        if response.ok:
            payload = response.json()
            data = payload.get("data") if isinstance(payload, dict) else None
            if isinstance(data, dict):
                total = _as_float(data.get("total_credits"))
                used = _as_float(data.get("total_usage"))
                if total is not None and used is not None:
                    return {
                        "remaining": max(0.0, total - used),
                        "totalCredits": total,
                        "totalUsage": used,
                        "source": "account",
                    }
        elif response.status_code not in (401, 403):
            detail = response.text.strip()[:200] or response.reason
            errors.append(f"credits ({response.status_code}): {detail}")
    except Exception as exc:
        errors.append(f"credits: {exc}")

    try:
        response = http_request(
            "GET",
            OPENROUTER_KEY_URL,
            headers=headers,
            timeout=30,
        )
        if response.ok:
            payload = response.json()
            data = payload.get("data") if isinstance(payload, dict) else None
            if isinstance(data, dict):
                remaining = _as_float(data.get("limit_remaining"))
                if remaining is not None:
                    limit = _as_float(data.get("limit"))
                    return {
                        "remaining": max(0.0, remaining),
                        "keyLimit": limit,
                        "source": "key_limit",
                    }
                errors.append("key: no limit_remaining on this API key")
        else:
            detail = response.text.strip()[:200] or response.reason
            errors.append(f"key ({response.status_code}): {detail}")
    except Exception as exc:
        errors.append(f"key: {exc}")

    message = "; ".join(errors) if errors else "Unable to read OpenRouter credits"
    raise RuntimeError(message)
