from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from focus_reader_core.stats import get_today_stats, get_week_stats
from focus_reader_core.time_utils import server_timezone

from ..dependencies import ConnectionDep
from ..schemas import TodayStatsResponse, WeekStatsResponse

router = APIRouter(prefix="/stats", tags=["stats"])


@router.get(
    "/today",
    response_model=TodayStatsResponse,
    summary="Reading totals for the current local day",
)
def read_today(connection: ConnectionDep) -> Any:
    return get_today_stats(connection, local_tz=server_timezone())


@router.get(
    "/week",
    response_model=WeekStatsResponse,
    summary="Last seven local days with per-day and top-domain totals",
)
def read_week(connection: ConnectionDep) -> Any:
    return get_week_stats(connection, local_tz=server_timezone())
