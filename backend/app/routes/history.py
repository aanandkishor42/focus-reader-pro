from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Query, status

from focus_reader_core.history import (
    delete_all_history,
    insert_history,
    list_history,
)
from focus_reader_core.time_utils import UTC

from ..dependencies import ConnectionDep
from ..schemas import (
    DeleteHistoryResponse,
    HistoryCreate,
    HistoryEntryResponse,
    domain_from_url,
)

router = APIRouter(prefix="/history", tags=["history"])


@router.post(
    "",
    response_model=HistoryEntryResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Store one reading session",
)
def create_history(payload: HistoryCreate, connection: ConnectionDep) -> Any:
    return insert_history(
        connection,
        title=payload.title,
        url=str(payload.url),
        domain=domain_from_url(payload.url),
        word_count=payload.word_count,
        minutes=payload.minutes,
        visited_at=payload.visited_at or datetime.now(UTC),
    )


@router.get(
    "",
    response_model=list[HistoryEntryResponse],
    summary="List stored reading sessions",
)
def read_history(
    connection: ConnectionDep,
    limit: Annotated[int, Query(ge=1, le=1000)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
    domain: Annotated[str | None, Query(min_length=1, max_length=255)] = None,
) -> Any:
    return list_history(connection, limit=limit, offset=offset, domain=domain)


@router.delete(
    "",
    response_model=DeleteHistoryResponse,
    summary="Delete all local reading history",
)
def clear_history(connection: ConnectionDep) -> DeleteHistoryResponse:
    return DeleteHistoryResponse(deleted=delete_all_history(connection))
