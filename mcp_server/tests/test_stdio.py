from __future__ import annotations

import asyncio
import os
import sys
import tempfile
from datetime import UTC, datetime
from pathlib import Path

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

from focus_reader_core.db import connect
from focus_reader_core.history import insert_history

PROJECT_ROOT = Path(__file__).resolve().parents[2]


def test_stdio_server_works_as_a_subprocess(mcp_database):
    connection = connect(mcp_database)
    try:
        insert_history(
            connection,
            title="Started from stdio",
            url="https://example.com/stdio",
            domain="example.com",
            word_count=900,
            minutes=4.5,
            visited_at=datetime.now(UTC),
        )
    finally:
        connection.close()

    env = os.environ.copy()
    env["FOCUS_READER_DB"] = str(mcp_database)
    env["FOCUS_READER_TIMEZONE"] = "UTC"

    async def run():
        params = StdioServerParameters(
            command=sys.executable,
            args=["-m", "mcp_server"],
            cwd=PROJECT_ROOT,
            env=env,
        )
        with tempfile.TemporaryFile(mode="w+", encoding="utf-8") as log:
            async with (
                stdio_client(params, errlog=log) as (read_stream, write_stream),
                ClientSession(read_stream, write_stream) as session,
            ):
                await session.initialize()
                tools = await session.list_tools()
                result = await session.call_tool("search_history", {"query": "stdio"})
                return tools, result

    tools, result = asyncio.run(run())

    assert {tool.name for tool in tools.tools} == {
        "get_today_stats",
        "get_week_stats",
        "list_history",
        "search_history",
    }
    assert result.isError is False
    assert result.structuredContent["count"] == 1
    assert result.structuredContent["entries"][0]["title"] == "Started from stdio"
