from __future__ import annotations

from datetime import date, datetime

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    HttpUrl,
    field_validator,
)


class HistoryCreate(BaseModel):
    """Validated payload accepted from the browser extension."""

    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=500)
    url: HttpUrl
    word_count: int = Field(ge=0, le=10_000_000)
    minutes: float = Field(ge=0, le=1440)
    visited_at: datetime | None = None

    @field_validator("title")
    @classmethod
    def clean_title(cls, value: str) -> str:
        # Collapse whitespace first, then remove non-printable control characters.
        cleaned = " ".join(value.split())
        cleaned = "".join(char for char in cleaned if char.isprintable())
        if not cleaned:
            raise ValueError("title must contain visible characters")
        return cleaned


class HistoryEntryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    url: str
    domain: str
    word_count: int
    minutes: float
    visited_at: datetime


class DeleteHistoryResponse(BaseModel):
    deleted: int


class TodayStatsResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    date: date
    pages: int
    minutes: float
    words: int


class DayStatsResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    date: date
    pages: int
    minutes: float
    words: int


class DomainStatsResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    domain: str
    pages: int
    minutes: float


class WeekStatsResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    start_date: date
    end_date: date
    pages: int
    minutes: float
    words: int
    days: list[DayStatsResponse]
    top_domains: list[DomainStatsResponse]


class HealthResponse(BaseModel):
    status: str


def domain_from_url(url: HttpUrl) -> str:
    """Keep grouping consistent by removing the common "www." prefix."""
    host = (url.host or "").strip().lower().rstrip(".")
    return host.removeprefix("www.")
