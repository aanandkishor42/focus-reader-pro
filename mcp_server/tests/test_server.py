from __future__ import annotations

import asyncio
from datetime import UTC, datetime

from mcp.server.fastmcp import FastMCP
from mcp.shared.memory import create_connected_server_and_client_session
from mcp_server.server import create_server, main

from focus_reader_core.history import insert_history


def seed_entry(connection, *, title: str = "MCP article") -> None:
    insert_history(
        connection,
        title=title,
        url="https://example.com/mcp",
        domain="example.com",
        word_count=1200,
        minutes=6.0,
        visited_at=datetime.now(UTC),
    )


def test_server_exposes_only_read_only_tools():
    async def run():
        server = create_server()
        async with create_connected_server_and_client_session(server) as session:
            return await session.list_tools()

    result = asyncio.run(run())
    tools = {tool.name: tool for tool in result.tools}

    assert set(tools) == {
        "get_today_stats",
        "get_week_stats",
        "list_history",
        "search_history",
    }
    assert all(tool.annotations.readOnlyHint is True for tool in tools.values())
    assert all(tool.annotations.destructiveHint is False for tool in tools.values())


def test_server_calls_tools_over_mcp_protocol(db_connection):
    seed_entry(db_connection)

    async def run():
        server = create_server()
        async with create_connected_server_and_client_session(server) as session:
            today = await session.call_tool("get_today_stats", {})
            search = await session.call_tool("search_history", {"query": "MCP"})
            invalid = await session.call_tool("search_history", {"query": "   "})
            return today, search, invalid

    today, search, invalid = asyncio.run(run())

    assert today.isError is False
    assert today.structuredContent == {
        "date": datetime.now(UTC).date().isoformat(),
        "pages": 1,
        "minutes": 6.0,
        "words": 1200,
    }
    assert search.isError is False
    assert search.structuredContent["count"] == 1
    assert search.structuredContent["entries"][0]["title"] == "MCP article"
    assert invalid.isError is True


def test_main_runs_stdio_server(monkeypatch):
    called = {}

    def fake_run(self, transport="stdio"):
        called["transport"] = transport

    monkeypatch.setattr(FastMCP, "run", fake_run)
    main()

    assert called == {"transport": "stdio"}
