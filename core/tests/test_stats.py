from __future__ import annotations

from datetime import datetime, timedelta, timezone

from focus_reader_core.history import delete_all_history, insert_history
from focus_reader_core.stats import get_today_stats, get_week_stats
from focus_reader_core.time_utils import UTC


def add_entry(
    connection,
    *,
    domain: str = "example.com",
    word_count: int = 1000,
    minutes: float = 5.0,
    visited_at: datetime,
):
    return insert_history(
        connection,
        title="Article",
        url=f"https://{domain}/article",
        domain=domain,
        word_count=word_count,
        minutes=minutes,
        visited_at=visited_at,
    )


def test_today_stats_use_local_day_boundaries(db_connection):
    now = datetime(2026, 10, 23, 12, tzinfo=UTC)

    add_entry(
        db_connection,
        domain="example.com",
        word_count=1000,
        minutes=5.5,
        visited_at=datetime(2026, 10, 23, 9, tzinfo=UTC),
    )
    add_entry(
        db_connection,
        domain="news.example",
        word_count=2000,
        minutes=10.25,
        visited_at=datetime(2026, 10, 23, 11, tzinfo=UTC),
    )
    add_entry(
        db_connection,
        minutes=99,
        visited_at=datetime(2026, 10, 22, 9, tzinfo=UTC),
    )

    stats = get_today_stats(db_connection, now=now, local_tz=UTC)

    assert stats.date == "2026-10-23"
    assert stats.pages == 2
    assert stats.minutes == 15.75
    assert stats.words == 3000


def test_today_stats_handle_timezone_offsets(db_connection):
    local_tz = timezone(timedelta(hours=-4))
    now = datetime(2026, 10, 23, 12, tzinfo=UTC)

    add_entry(
        db_connection,
        minutes=4,
        visited_at=datetime(2026, 10, 23, 1, tzinfo=UTC),
    )
    add_entry(
        db_connection,
        minutes=6,
        visited_at=datetime(2026, 10, 23, 12, tzinfo=UTC),
    )

    today = get_today_stats(db_connection, now=now, local_tz=local_tz)

    assert today.pages == 1
    assert today.minutes == 6


def test_week_stats_group_days_and_top_domains(db_connection):
    now = datetime(2026, 10, 23, 12, tzinfo=UTC)

    add_entry(
        db_connection,
        domain="example.com",
        word_count=1000,
        minutes=5,
        visited_at=datetime(2026, 10, 23, 9, tzinfo=UTC),
    )
    add_entry(
        db_connection,
        domain="news.example",
        word_count=2000,
        minutes=10,
        visited_at=datetime(2026, 10, 23, 10, tzinfo=UTC),
    )
    add_entry(
        db_connection,
        domain="example.com",
        word_count=500,
        minutes=2.5,
        visited_at=datetime(2026, 10, 22, 9, tzinfo=UTC),
    )
    add_entry(
        db_connection,
        domain="old.example",
        word_count=100,
        minutes=1,
        visited_at=datetime(2026, 10, 17, 9, tzinfo=UTC),
    )
    add_entry(
        db_connection,
        domain="outside.example",
        word_count=100,
        minutes=100,
        visited_at=datetime(2026, 10, 16, 9, tzinfo=UTC),
    )

    stats = get_week_stats(db_connection, now=now, local_tz=UTC)

    assert stats.start_date == "2026-10-17"
    assert stats.end_date == "2026-10-23"
    assert stats.pages == 4
    assert stats.minutes == 18.5
    assert stats.words == 3600
    assert len(stats.days) == 7
    assert stats.days[0].date == "2026-10-17"
    assert stats.days[-1].date == "2026-10-23"
    assert stats.days[-1].pages == 2
    assert [domain.domain for domain in stats.top_domains] == [
        "news.example",
        "example.com",
        "old.example",
    ]
    assert stats.top_domains[0].minutes == 10
    assert stats.top_domains[1].pages == 2


def test_empty_stats_return_zeros(db_connection):
    now = datetime(2026, 10, 23, 12, tzinfo=UTC)

    today = get_today_stats(db_connection, now=now, local_tz=UTC)
    week = get_week_stats(db_connection, now=now, local_tz=UTC)

    assert today.pages == 0
    assert today.minutes == 0
    assert today.words == 0
    assert week.pages == 0
    assert week.minutes == 0
    assert len(week.days) == 7
    assert all(day.pages == 0 and day.minutes == 0 for day in week.days)
    assert week.top_domains == []


def test_delete_all_history_empties_stats(db_connection):
    now = datetime(2026, 10, 23, 12, tzinfo=UTC)
    add_entry(db_connection, visited_at=now)

    delete_all_history(db_connection)

    assert get_today_stats(db_connection, now=now, local_tz=UTC).pages == 0
    assert get_week_stats(db_connection, now=now, local_tz=UTC).pages == 0
