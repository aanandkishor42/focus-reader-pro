from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Annotated

from pydantic import Field

from focus_reader_core.db import connect, get_db_path, init_db
from focus_reader_core.history import (
    list_history as list_history_entries,
)
from focus_reader_core.history import (
    search_history as search_history_entries,
)
from focus_reader_core.models import HistoryEntry
from focus_reader_core.stats import get_today_stats as read_today_stats
from focus_reader_core.stats import get_week_stats as read_week_stats
from focus_reader_core.time_utils import datetime_to_storage

Limit = Annotated[int, Field(ge=1, le=200)]
Offset = Annotated[int, Field(ge=0)]
Domain = Annotated[str | None, Field(min_length=1, max_length=255)]
SearchQuery = Annotated[str, Field(min_length=1, max_length=200)]


@contextmanager
def _reading_connection() -> Iterator[sqlite3.Connection]:
    path = get_db_path()
    init_db(path)
    connection = connect(path)
    try:
        connection.execute("PRAGMA query_only = ON")
        yield connection
    finally:
        connection.close()


def _entry_to_dict(entry: HistoryEntry) -> dict[str, object]:
    return {
        "id": entry.id,
        "title": entry.title,
        "url": entry.url,
        "domain": entry.domain,
        "word_count": entry.word_count,
        "minutes": entry.minutes,
        "visited_at": datetime_to_storage(entry.visited_at),
    }


def _clean_domain(domain: str | None) -> str | None:
    if domain is None:
        return None
    cleaned = domain.strip()
    if not cleaned:
        raise ValueError("domain must not be blank")
    return cleaned


def get_today_stats() -> dict[str, object]:
    """Return pages, reading minutes, and words recorded today."""
    with _reading_connection() as connection:
        stats = read_today_stats(connection)

    return {
        "date": stats.date,
        "pages": stats.pages,
        "minutes": stats.minutes,
        "words": stats.words,
    }


def get_week_stats() -> dict[str, object]:
    """Return totals and daily activity for the last seven local days."""
    with _reading_connection() as connection:
        stats = read_week_stats(connection)

    return {
        "start_date": stats.start_date,
        "end_date": stats.end_date,
        "pages": stats.pages,
        "minutes": stats.minutes,
        "words": stats.words,
        "days": [
            {
                "date": day.date,
                "pages": day.pages,
                "minutes": day.minutes,
                "words": day.words,
            }
            for day in stats.days
        ],
        "top_domains": [
            {
                "domain": domain.domain,
                "pages": domain.pages,
                "minutes": domain.minutes,
            }
            for domain in stats.top_domains
        ],
    }


def list_history(
    limit: Limit = 20,
    offset: Offset = 0,
    domain: Domain = None,
) -> dict[str, object]:
    """List stored reading sessions, newest first, with optional domain filtering."""
    clean_domain = _clean_domain(domain)
    with _reading_connection() as connection:
        entries = list_history_entries(
            connection,
            limit=limit,
            offset=offset,
            domain=clean_domain,
        )

    return {
        "count": len(entries),
        "limit": limit,
        "offset": offset,
        "entries": [_entry_to_dict(entry) for entry in entries],
    }


def search_history(
    query: SearchQuery,
    limit: Limit = 20,
    offset: Offset = 0,
    domain: Domain = None,
) -> dict[str, object]:
    """Search reading history by title or URL, optionally within one domain."""
    term = query.strip()
    if not term:
        raise ValueError("query must contain at least one non-space character")

    clean_domain = _clean_domain(domain)
    with _reading_connection() as connection:
        entries = search_history_entries(
            connection,
            query=term,
            limit=limit,
            offset=offset,
            domain=clean_domain,
        )

    return {
        "query": term,
        "count": len(entries),
        "limit": limit,
        "offset": offset,
        "entries": [_entry_to_dict(entry) for entry in entries],
    }
