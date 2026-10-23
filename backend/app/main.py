from __future__ import annotations

import logging
import sqlite3
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from focus_reader_core.db import init_db

from .config import allowed_origins, cors_origin_regex
from .routes import history, stats

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Creating the database at startup keeps the first request simple and makes
    # a fresh checkout work without a separate migration command.
    init_db()
    yield


def create_app() -> FastAPI:
    application = FastAPI(
        title="Focus Reader Pro API",
        version="0.1.0",
        description=(
            "Local-only API for reading history. The server binds to 127.0.0.1 "
            "and only accepts browser origins belonging to Chrome extensions."
        ),
        lifespan=lifespan,
    )

    exact_origins = allowed_origins()
    application.add_middleware(
        CORSMiddleware,
        allow_origins=exact_origins,
        allow_origin_regex=None if exact_origins else cors_origin_regex(),
        allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type"],
        allow_credentials=False,
        max_age=600,
    )

    application.include_router(history.router)
    application.include_router(stats.router)

    @application.get("/health", tags=["system"], summary="Check whether the API is running")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @application.exception_handler(sqlite3.Error)
    async def handle_database_error(request: Request, error: sqlite3.Error) -> JSONResponse:
        logger.exception("SQLite error while handling %s", request.url.path)
        return JSONResponse(
            status_code=503,
            content={"detail": "The local reading database is unavailable."},
        )

    @application.exception_handler(Exception)
    async def handle_unexpected_error(request: Request, error: Exception) -> JSONResponse:
        logger.exception("Unexpected error while handling %s", request.url.path)
        return JSONResponse(
            status_code=500,
            content={"detail": "An unexpected local server error occurred."},
        )

    return application


app = create_app()
