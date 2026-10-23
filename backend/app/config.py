from __future__ import annotations

import os

DEFAULT_EXTENSION_ORIGIN_REGEX = r"^chrome-extension://[a-p]{32}$"


def allowed_origins() -> list[str]:
    """
    Optional exact allowlist. Set FOCUS_READER_ALLOWED_ORIGINS to the unpacked
    extension's chrome-extension:// origin for a stricter setup.
    """
    raw = os.getenv("FOCUS_READER_ALLOWED_ORIGINS", "")
    origins = []
    for value in raw.split(","):
        origin = value.strip().rstrip("/")
        if origin.startswith("chrome-extension://"):
            origins.append(origin)
    return origins


def cors_origin_regex() -> str | None:
    # Without an exact ID, only allow Chrome extension origins, never websites.
    return None if allowed_origins() else DEFAULT_EXTENSION_ORIGIN_REGEX
