from __future__ import annotations

import sqlite3

import pytest

from focus_reader_core.db import connect, init_db


@pytest.fixture()
def mcp_database(tmp_path, monkeypatch):
    database_path = tmp_path / "history.db"
    monkeypatch.setenv("FOCUS_READER_DB", str(database_path))
    monkeypatch.setenv("FOCUS_READER_TIMEZONE", "UTC")
    init_db(database_path)
    return database_path


@pytest.fixture()
def db_connection(mcp_database) -> sqlite3.Connection:
    connection = connect(mcp_database)
    try:
        yield connection
    finally:
        connection.close()
