from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from mcp_server.tools import (
    get_today_stats,
    get_week_stats,
    list_history,
    search_history,
)

from focus_reader_core.history import insert_history


def add_entry(
    connection,
    *,
    title: str = "Example article",
    url: str = "https://example.com/article",
    domain: str = "example.com",
    word_count: int = 1000,
    minutes: float = 5.0,
    visited_at: datetime | None = None,
):
    return insert_history(
        connection,
        title=title,
        url=url,
        domain=domain,
        word_count=word_count,
        minutes=minutes,
        visited_at=visited_at or datetime.now(UTC),
    )


def test_get_today_stats_returns_database_totals(db_connection):
    add_entry(db_connection, word_count=600, minutes=2.5)
    add_entry(db_connection, word_count=900, minutes=4.5)

    result = get_today_stats()

    assert result["pages"] == 2
    assert result["minutes"] == 7.0
    assert result["words"] == 1500
    assert result["date"] == datetime.now(UTC).date().isoformat()


def test_get_week_stats_returns_days_and_top_domains(db_connection):
    now = datetime.now(UTC)
    add_entry(
        db_connection,
        domain="example.com",
        word_count=500,
        minutes=2.0,
        visited_at=now,
    )
    add_entry(
        db_connection,
        domain="example.com",
        word_count=700,
        minutes=3.0,
        visited_at=now - timedelta(days=1),
    )
    add_entry(
        db_connection,
        domain="news.example",
        word_count=300,
        minutes=1.0,
        visited_at=now,
    )

    result = get_week_stats()

    assert result["pages"] == 3
    assert result["minutes"] == 6.0
    assert result["words"] == 1500
    assert len(result["days"]) == 7
    assert result["top_domains"][0] == {
        "domain": "example.com",
        "pages": 2,
        "minutes": 5.0,
    }


def test_list_history_returns_serialized_paginated_entries(db_connection):
    newer = add_entry(
        db_connection,
        title="Newer",
        domain="news.example",
        visited_at=datetime(2026, 10, 23, 10, tzinfo=UTC),
    )
    add_entry(
        db_connection,
        title="Older",
        domain="example.com",
        visited_at=datetime(2026, 10, 21, 10, tzinfo=UTC),
    )

    first_page = list_history(limit=1)
    second_page = list_history(limit=1, offset=1)
    filtered = list_history(domain="www.News.Example")

    assert first_page["count"] == 1
    assert first_page["entries"][0]["id"] == newer.id
    assert first_page["entries"][0]["visited_at"] == "2026-10-23T10:00:00Z"
    assert second_page["entries"][0]["title"] == "Older"
    assert filtered["entries"][0]["title"] == "Newer"


def test_search_history_matches_titles_urls_and_domains(db_connection):
    add_entry(
        db_connection,
        title="Learning Rust",
        url="https://example.com/rust",
        domain="example.com",
    )
    add_entry(
        db_connection,
        title="Python patterns",
        url="https://news.example/python-patterns",
        domain="news.example",
    )

    title_match = search_history("rust")
    url_match = search_history("python-patterns")
    domain_filtered = search_history("example", domain="news.example")

    assert title_match["entries"][0]["title"] == "Learning Rust"
    assert url_match["entries"][0]["title"] == "Python patterns"
    assert domain_filtered["count"] == 1
    assert domain_filtered["entries"][0]["domain"] == "news.example"


def test_search_history_rejects_blank_values():
    with pytest.raises(ValueError, match="query"):
        search_history("   ")

    with pytest.raises(ValueError, match="domain"):
        list_history(domain="   ")
