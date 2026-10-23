from __future__ import annotations

import sqlite3
from datetime import datetime

from .models import HistoryEntry
from .time_utils import datetime_from_storage, datetime_to_storage


def _row_to_entry(row: sqlite3.Row) -> HistoryEntry:
    return HistoryEntry(
        id=int(row["id"]),
        title=str(row["title"]),
        url=str(row["url"]),
        domain=str(row["domain"]),
        word_count=int(row["word_count"]),
        minutes=float(row["minutes"]),
        visited_at=datetime_from_storage(str(row["visited_at"])),
    )


def _normalize_domain(domain: str) -> str:
    return domain.strip().lower().removeprefix("www.")


def _escape_like(value: str) -> str:
    return value.replace("!", "!!").replace("%", "!%").replace("_", "!_")


def insert_history(
    connection: sqlite3.Connection,
    *,
    title: str,
    url: str,
    domain: str,
    word_count: int,
    minutes: float,
    visited_at: datetime,
) -> HistoryEntry:
    stored_visit = datetime_to_storage(visited_at)

    with connection:
        cursor = connection.execute(
            """
            INSERT INTO history (title, url, domain, word_count, minutes, visited_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (title, url, domain, word_count, round(float(minutes), 2), stored_visit),
        )

    entry_id = cursor.lastrowid
    if entry_id is None:  # pragma: no cover - SQLite always returns this for inserts
        raise RuntimeError("The database did not return an inserted row id.")

    row = connection.execute(
        "SELECT * FROM history WHERE id = ?",
        (entry_id,),
    ).fetchone()
    if row is None:  # pragma: no cover - defensive guard
        raise RuntimeError("The inserted history entry could not be read back.")
    return _row_to_entry(row)


def list_history(
    connection: sqlite3.Connection,
    *,
    limit: int = 100,
    offset: int = 0,
    domain: str | None = None,
) -> list[HistoryEntry]:
    query = "SELECT * FROM history"
    params: list[object] = []

    if domain:
        query += " WHERE domain = ?"
        params.append(_normalize_domain(domain))

    query += " ORDER BY visited_at DESC, id DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    rows = connection.execute(query, params).fetchall()
    return [_row_to_entry(row) for row in rows]


def search_history(
    connection: sqlite3.Connection,
    *,
    query: str,
    limit: int = 100,
    offset: int = 0,
    domain: str | None = None,
) -> list[HistoryEntry]:
    term = query.strip()
    if not term:
        return list_history(connection, limit=limit, offset=offset, domain=domain)

    pattern = f"%{_escape_like(term.lower())}%"
    sql = """
        SELECT * FROM history
        WHERE (LOWER(title) LIKE ? ESCAPE '!' OR LOWER(url) LIKE ? ESCAPE '!')
    """
    params: list[object] = [pattern, pattern]

    if domain:
        sql += " AND domain = ?"
        params.append(_normalize_domain(domain))

    sql += " ORDER BY visited_at DESC, id DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    rows = connection.execute(sql, params).fetchall()
    return [_row_to_entry(row) for row in rows]


def delete_all_history(connection: sqlite3.Connection) -> int:
    with connection:
        cursor = connection.execute("DELETE FROM history")
    return max(cursor.rowcount, 0)
