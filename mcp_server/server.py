from __future__ import annotations

from mcp.server.fastmcp import FastMCP
from mcp.types import ToolAnnotations

from . import tools

INSTRUCTIONS = """
Focus Reader Pro provides read-only access to the user's local reading history.
History is recorded by the Chrome extension only when the user enables logging.
Data comes directly from the local SQLite database; no network requests are made.
Use these tools to answer questions about reading activity, recent articles,
domains, word counts, and estimated reading time.
""".strip()


def create_server() -> FastMCP:
    server = FastMCP("Focus Reader Pro", instructions=INSTRUCTIONS)
    read_only = ToolAnnotations(
        readOnlyHint=True,
        destructiveHint=False,
        idempotentHint=True,
        openWorldHint=False,
    )

    server.add_tool(
        tools.get_today_stats,
        title="Get today's reading stats",
        description=(
            "Return today's page count, total reading minutes, and total words "
            "in the user's local timezone."
        ),
        annotations=read_only,
    )
    server.add_tool(
        tools.get_week_stats,
        title="Get weekly reading stats",
        description=(
            "Return totals for the last seven local calendar days, including a "
            "daily breakdown and the top five domains."
        ),
        annotations=read_only,
    )
    server.add_tool(
        tools.list_history,
        title="List reading history",
        description=(
            "List stored reading sessions newest first. Supports pagination and "
            "optional exact-domain filtering."
        ),
        annotations=read_only,
    )
    server.add_tool(
        tools.search_history,
        title="Search reading history",
        description=(
            "Search article titles and URLs within reading history. Supports "
            "pagination and optional exact-domain filtering."
        ),
        annotations=read_only,
    )

    return server


def main() -> None:
    create_server().run(transport="stdio")


if __name__ == "__main__":  # pragma: no cover
    main()
