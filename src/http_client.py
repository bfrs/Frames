"""Reliable HTTPS client for outbound API calls."""

from __future__ import annotations

import os
import time
from pathlib import Path
from typing import Any

import certifi
import requests

_CA_BUNDLE = certifi.where()
_CONFIGURED = False

_TRANSIENT_EXCEPTIONS = (
    requests.exceptions.SSLError,
    requests.exceptions.ConnectionError,
    requests.exceptions.Timeout,
)


def configure_ssl() -> None:
    """Use certifi's CA bundle when system/env certs are missing or invalid."""
    global _CONFIGURED
    if _CONFIGURED:
        return
    for name in ("SSL_CERT_FILE", "REQUESTS_CA_BUNDLE", "CURL_CA_BUNDLE"):
        current = os.environ.get(name, "").strip()
        if current and Path(current).is_file():
            continue
        os.environ[name] = _CA_BUNDLE
    _CONFIGURED = True


def request(
    method: str,
    url: str,
    *,
    max_attempts: int = 3,
    retry_backoff_sec: float = 0.5,
    **kwargs: Any,
) -> requests.Response:
    """Issue an HTTPS request with certifi verification and transient-error retries."""
    configure_ssl()
    kwargs.setdefault("verify", _CA_BUNDLE)
    last_exc: BaseException | None = None
    for attempt in range(max_attempts):
        try:
            return requests.request(method, url, **kwargs)
        except _TRANSIENT_EXCEPTIONS as exc:
            last_exc = exc
            if attempt + 1 >= max_attempts:
                break
            time.sleep(retry_backoff_sec * (2**attempt))
    assert last_exc is not None
    raise last_exc
