from __future__ import annotations

import sqlite3
from collections import defaultdict
from datetime import datetime, timedelta, tzinfo

from .models import DayStats, DomainStats, TodayStats, WeekStats
from .time_utils import (
    UTC,
    datetime_from_storage,
    datetime_to_storage,
    day_window,
    server_timezone,
)


def get_today_stats(
    connection: sqlite3.Connection,
    *,
    now: datetime | None = None,
    local_tz: tzinfo | None = None,
) -> TodayStats:
    tz = local_tz or server_timezone()
    current = now or datetime.now(UTC)
    if current.tzinfo is None:
        current = current.replace(tzinfo=UTC)

    local_day = current.astimezone(tz).date()
    start, end = day_window(local_day, tz)

    row = connection.execute(
        """
        SELECT COUNT(*) AS pages,
               COALESCE(SUM(minutes), 0) AS minutes,
               COALESCE(SUM(word_count), 0) AS words
        FROM history
        WHERE visited_at >= ? AND visited_at < ?
        """,
        (datetime_to_storage(start), datetime_to_storage(end)),
    ).fetchone()

    pages = int(row["pages"]) if row else 0
    minutes = float(row["minutes"]) if row else 0.0
    words = int(row["words"]) if row else 0

    return TodayStats(
        date=local_day.isoformat(),
        pages=pages,
        minutes=round(minutes, 2),
        words=words,
    )


def get_week_stats(
    connection: sqlite3.Connection,
    *,
    now: datetime | None = None,
    local_tz: tzinfo | None = None,
) -> WeekStats:
    """Return the last seven local calendar days, including today."""
    tz = local_tz or server_timezone()
    current = now or datetime.now(UTC)
    if current.tzinfo is None:
        current = current.replace(tzinfo=UTC)

    end_day = current.astimezone(tz).date()
    start_day = end_day - timedelta(days=6)
    start_at, _ = day_window(start_day, tz)
    _, end_at = day_window(end_day, tz)

    rows = connection.execute(
        """
        SELECT domain, word_count, minutes, visited_at
        FROM history
        WHERE visited_at >= ? AND visited_at < ?
        ORDER BY visited_at ASC
        """,
        (datetime_to_storage(start_at), datetime_to_storage(end_at)),
    ).fetchall()

    day_totals: dict[object, dict[str, object]] = {
        start_day
        + timedelta(days=offset): {
            "pages": 0,
            "minutes": 0.0,
            "words": 0,
        }
        for offset in range(7)
    }
    domain_pages: dict[str, int] = defaultdict(int)
    domain_minutes: dict[str, float] = defaultdict(float)

    for row in rows:
        visited = datetime_from_storage(str(row["visited_at"])).astimezone(tz)
        bucket = day_totals.get(visited.date())
        if bucket is None:
            continue

        bucket["pages"] = int(bucket["pages"]) + 1
        bucket["minutes"] = float(bucket["minutes"]) + float(row["minutes"])
        bucket["words"] = int(bucket["words"]) + int(row["word_count"])

        domain = str(row["domain"])
        domain_pages[domain] += 1
        domain_minutes[domain] += float(row["minutes"])

    days = [
        DayStats(
            date=day.isoformat(),
            pages=int(values["pages"]),
            minutes=round(float(values["minutes"]), 2),
            words=int(values["words"]),
        )
        for day, values in day_totals.items()
    ]

    top_domains = [
        DomainStats(
            domain=domain,
            pages=domain_pages[domain],
            minutes=round(domain_minutes[domain], 2),
        )
        for domain in sorted(
            domain_minutes,
            key=lambda value: (-domain_minutes[value], -domain_pages[value], value),
        )[:5]
    ]

    return WeekStats(
        start_date=start_day.isoformat(),
        end_date=end_day.isoformat(),
        pages=sum(day.pages for day in days),
        minutes=round(sum(day.minutes for day in days), 2),
        words=sum(day.words for day in days),
        days=days,
        top_domains=top_domains,
    )
