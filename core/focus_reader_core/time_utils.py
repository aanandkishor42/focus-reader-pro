from __future__ import annotations

import os
from datetime import UTC, date, datetime, time, timedelta, tzinfo
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


def ensure_utc(value: datetime) -> datetime:
    """Treat naive timestamps as UTC and convert aware timestamps to UTC."""
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def datetime_to_storage(value: datetime) -> str:
    """Store timestamps in one sortable, timezone-safe format."""
    normalized = ensure_utc(value).replace(microsecond=0)
    return normalized.isoformat().replace("+00:00", "Z")


def datetime_from_storage(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return ensure_utc(parsed)


def _system_timezone() -> tzinfo:
    return datetime.now().astimezone().tzinfo or UTC


def server_timezone() -> tzinfo:
    """
    Use the machine timezone by default. Tests and users can set
    FOCUS_READER_TIMEZONE (for example "UTC" or "Asia/Kolkata") for stable
    "today" and "week" boundaries.
    """
    name = os.getenv("FOCUS_READER_TIMEZONE", "").strip()
    if not name:
        return _system_timezone()

    if name.upper() in {"UTC", "Z"}:
        return UTC

    try:
        return ZoneInfo(name)
    except ZoneInfoNotFoundError:
        return _system_timezone()


def day_window(day: date, tz: tzinfo) -> tuple[datetime, datetime]:
    """Return the UTC start and exclusive end of a local calendar day."""
    start = datetime.combine(day, time.min, tzinfo=tz)
    end = start + timedelta(days=1)
    return start.astimezone(UTC), end.astimezone(UTC)
