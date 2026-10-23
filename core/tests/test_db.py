from __future__ import annotations

from datetime import datetime

from focus_reader_core.history import (
    delete_all_history,
    insert_history,
    list_history,
    search_history,
)
from focus_reader_core.time_utils import UTC


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
        visited_at=visited_at or datetime(2026, 10, 23, 10, tzinfo=UTC),
    )


def test_init_db_creates_history_table(db_connection):
    tables = {
        row["name"]
        for row in db_connection.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table'"
        ).fetchall()
    }
    assert "history" in tables


def test_insert_and_read_history(db_connection):
    entry = add_entry(
        db_connection,
        title="A useful article",
        word_count=1200,
        minutes=12.345,
    )

    assert entry.id > 0
    assert entry.title == "A useful article"
    assert entry.domain == "example.com"
    assert entry.minutes == 12.35
    assert entry.visited_at == datetime(2026, 10, 23, 10, tzinfo=UTC)


def test_list_history_orders_and_paginates(db_connection):
    add_entry(
        db_connection,
        title="Oldest",
        visited_at=datetime(2026, 10, 21, 10, tzinfo=UTC),
    )
    add_entry(
        db_connection,
        title="Newest",
        visited_at=datetime(2026, 10, 23, 10, tzinfo=UTC),
    )
    add_entry(
        db_connection,
        title="Middle",
        visited_at=datetime(2026, 10, 22, 10, tzinfo=UTC),
    )

    first_page = list_history(db_connection, limit=2)
    second_page = list_history(db_connection, limit=2, offset=2)

    assert [entry.title for entry in first_page] == ["Newest", "Middle"]
    assert [entry.title for entry in second_page] == ["Oldest"]


def test_list_history_filters_by_domain(db_connection):
    add_entry(db_connection, domain="example.com")
    add_entry(db_connection, domain="news.example")

    results = list_history(db_connection, domain="www.News.Example")

    assert len(results) == 1
    assert results[0].domain == "news.example"


def test_search_history_matches_titles_and_urls(db_connection):
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

    title_results = search_history(db_connection, query="RUST")
    url_results = search_history(db_connection, query="python-patterns")

    assert [entry.title for entry in title_results] == ["Learning Rust"]
    assert [entry.title for entry in url_results] == ["Python patterns"]


def test_search_history_filters_by_domain(db_connection):
    add_entry(db_connection, title="Shared topic", domain="example.com")
    add_entry(db_connection, title="Shared topic", domain="news.example")

    results = search_history(db_connection, query="shared", domain="www.News.Example")

    assert len(results) == 1
    assert results[0].domain == "news.example"


def test_search_history_treats_like_wildcards_literally(db_connection):
    add_entry(db_connection, title="100% coverage")
    add_entry(db_connection, title="100 percent coverage")
    add_entry(db_connection, title="snake_case guide")
    add_entry(db_connection, title="snakeXcase guide")

    percent_results = search_history(db_connection, query="100%")
    underscore_results = search_history(db_connection, query="snake_")

    assert [entry.title for entry in percent_results] == ["100% coverage"]
    assert [entry.title for entry in underscore_results] == ["snake_case guide"]


def test_search_history_with_blank_query_lists_recent_entries(db_connection):
    add_entry(
        db_connection,
        title="Older",
        visited_at=datetime(2026, 10, 21, 10, tzinfo=UTC),
    )
    add_entry(
        db_connection,
        title="Newer",
        visited_at=datetime(2026, 10, 23, 10, tzinfo=UTC),
    )

    results = search_history(db_connection, query="   ", limit=1)

    assert [entry.title for entry in results] == ["Newer"]


def test_delete_all_history_returns_count(db_connection):
    add_entry(db_connection)
    add_entry(db_connection)

    deleted = delete_all_history(db_connection)

    assert deleted == 2
    assert list_history(db_connection) == []
