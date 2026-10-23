# Focus Reader Pro

Focus Reader Pro estimates how long an article will take to read, provides a
distraction-free reading mode, and keeps an opt-in local reading history that an
AI assistant can query through MCP.

> Status: Phase 6. Portfolio-ready. The Chrome MV3 extension, local FastAPI +
> SQLite service, and read-only stdio MCP server are tested, linted, and
> covered by CI.

## What works now

- Word count and reading-time estimate in the popup
- Distraction-free Focus Mode with adjustable text size and line width
- Per-domain Focus Mode persistence via `chrome.storage.local`
- Keyboard shortcut: `Alt+Shift+F`
- Opt-in automatic reading-history logging
- Blocked-domain list and 30-minute duplicate protection
- Today's pages and minutes loaded from the local API
- Local FastAPI service with SQLite storage
- API online/offline indicators in the popup and settings page
- Clear-all-history action in settings
- Restricted CORS, request validation, and generated OpenAPI docs
- Read-only MCP tools for today's stats, weekly stats, history, and search

## Architecture

```text
Chrome extension (MV3)
        |
        | fetch to 127.0.0.1:5000
        v
FastAPI  ──►  SQLite: backend/data/history.db
                ^
                | read-only
                |
            MCP server (stdio)
                ^
                |
            AI assistant / MCP client
```

## Set up and run the API

Use Python 3.11 or newer:

```powershell
cd "C:\Users\Aanand\OneDrive\Desktop\OneDrive\Documents\Default Project\focus-reader-pro"
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-dev.txt
python -m uvicorn backend.app.main:app --reload --port 5000
```

Open:

- Swagger UI: http://127.0.0.1:5000/docs
- Health check: http://127.0.0.1:5000/health

The database is created automatically at `backend/data/history.db`. The database
file is ignored by git.

## Load or reload the extension

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select `focus-reader-pro/extension`, or click
   **Reload** if the extension is already installed.
4. Reload any article tabs that were open before the extension was reloaded.

## Enable logging and test the full flow

1. Start the API and leave it running.
2. Open the extension **Settings** page.
3. Turn on **Log reading history** and click **Save settings**.
   The data section should say **Local API online.**
4. Open a normal `http` or `https` article with at least 50 readable words.
5. Keep the tab visible for roughly two seconds.
6. Open the extension popup.
   - The footer should show **Logging on** and **API online**.
   - Today should show at least `1` page and the article's reading minutes.
7. Confirm the saved row with Swagger `GET /history`, or run:

```powershell
Invoke-RestMethod "http://127.0.0.1:5000/stats/today"
```

## Logging behavior

- Logging is off by default.
- Only `http` and `https` pages with at least 50 readable words are logged.
- Blocked domains and their subdomains are never logged.
- The same URL is not logged again within 30 minutes.
- Pages are logged after they become visible for about 1.2 seconds, or when the
  popup is opened on an eligible page.
- If the API is offline, the extension does not invent local history. The popup
  and settings page show **API offline** until the server is running.
- Clearing history from Settings also clears the extension's duplicate cache.

## API endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/history` | Store one reading session |
| `GET` | `/history` | List history with `limit`, `offset`, optional `domain` |
| `DELETE` | `/history` | Delete all local history |
| `GET` | `/stats/today` | Pages, minutes, and words for the local day |
| `GET` | `/stats/week` | Last seven local days and top domains |
| `GET` | `/health` | Check whether the local API is running |

The API derives and stores the domain from the submitted URL. It accepts only
`http` and `https` URLs.

### Example API request

```powershell
$body = @{
  title = "The Art of Reading"
  url = "https://www.example.com/the-art-of-reading"
  word_count = 2400
  minutes = 12
  visited_at = (Get-Date).ToUniversalTime().ToString("o")
} | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:5000/history" `
  -ContentType "application/json" `
  -Body $body
```

```powershell
Invoke-RestMethod "http://127.0.0.1:5000/history"
Invoke-RestMethod "http://127.0.0.1:5000/stats/today"
Invoke-RestMethod "http://127.0.0.1:5000/stats/week"
Invoke-RestMethod -Method Delete "http://127.0.0.1:5000/history"
```

## MCP server

Phase 4 adds a local, read-only MCP server over stdio. It reads the same SQLite
file directly, so the FastAPI service does not need to be running for MCP tools.
There are no tools that modify or delete history.

| Tool | Purpose |
| --- | --- |
| `get_today_stats` | Today's pages, minutes, and words |
| `get_week_stats` | Seven-day totals, daily activity, and top domains |
| `list_history` | Newest-first history with pagination and domain filtering |
| `search_history` | Search titles and URLs, optionally within one domain |

The server is installed as a console command:

```powershell
.\.venv\Scripts\focus-reader-mcp.exe
```

Run directly, it waits silently for MCP protocol messages on standard input. It
is normally launched by an MCP client instead.

Find the absolute command path:

```powershell
(Resolve-Path .\.venv\Scripts\focus-reader-mcp.exe).Path
```

Example MCP client configuration:

```json
{
  "mcpServers": {
    "focus-reader": {
      "command": "C:\\Users\\Aanand\\OneDrive\\Desktop\\OneDrive\\Documents\\Default Project\\focus-reader-pro\\.venv\\Scripts\\focus-reader-mcp.exe"
    }
  }
}
```

For an opencode project config, the equivalent entry is:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "focus-reader": {
      "type": "local",
      "command": [
        "C:\\Users\\Aanand\\OneDrive\\Desktop\\OneDrive\\Documents\\Default Project\\focus-reader-pro\\.venv\\Scripts\\focus-reader-mcp.exe"
      ],
      "enabled": true
    }
  }
}
```

Restart the MCP client after changing its configuration, then try prompts such
as:

- "What did I read today?"
- "Show my reading stats for this week."
- "Search my reading history for Python."
- "What have I read from wikipedia.org?"

The server inherits `FOCUS_READER_DB` and `FOCUS_READER_TIMEZONE`. Set
`FOCUS_READER_DB` in the client environment only if you use a custom database
path.

## Configuration

Copy values from `.env.example` into your shell environment as needed. The app
reads environment variables directly; it does not load `.env` automatically.

| Variable | Default | Meaning |
| --- | --- | --- |
| `FOCUS_READER_DB` | `backend/data/history.db` | SQLite database path |
| `FOCUS_READER_TIMEZONE` | machine timezone | Timezone used for day and week boundaries |
| `FOCUS_READER_ALLOWED_ORIGINS` | any `chrome-extension://` origin | Exact CORS allowlist |

For a stricter CORS setup, copy the extension ID from `chrome://extensions` and
set it before starting the API:

```powershell
$env:FOCUS_READER_ALLOWED_ORIGINS = "chrome-extension://YOUR_EXTENSION_ID"
```

CORS is not authentication. The important protection is that the API binds to
`127.0.0.1`, not the public network.

## Troubleshooting

- **API offline:** Start uvicorn on port `5000`, then reopen the popup.
- **A page was not logged:** It may be under 50 words, on the blocklist, already
  logged within 30 minutes, or in a tab that was not reloaded after updating the
  extension.
- **Settings say logging is on but nothing appears:** Confirm the tab is an
  `http`/`https` article, keep it visible briefly, and check that the API online
  indicator is green.
- **Clear history is disabled:** The local API is offline.

## Tests and linting

```powershell
# Extension
npm install
npm test
npm run check

# Backend, shared core, and MCP server
.\.venv\Scripts\python.exe -m pytest --cov --cov-report=term-missing
.\.venv\Scripts\python.exe -m ruff check backend core mcp_server
.\.venv\Scripts\python.exe -m black --check backend core mcp_server
```

Continuous integration runs the same checks on GitHub Actions for pushes and
pull requests (see `.github/workflows/ci.yml`).

The pytest configuration enforces a minimum of 80% coverage across the API,
shared core, and MCP server. The MCP suite includes a real subprocess stdio test.

## Privacy

- Reading-history logging is off by default.
- Settings, Focus Mode state, and duplicate timestamps stay in
  `chrome.storage.local`.
- The extension requests the `storage` permission plus host access only for
  `http://127.0.0.1/*`, so it can call the local API. It cannot read remote pages
  through that permission.
- Content scripts run only on `http`/`https` pages and cannot run on `chrome://`
  pages.
- The API stores data only in the local SQLite file.
- The MCP server is local and read-only; it cannot add, change, or delete history.
- No data is sent to a remote service.
