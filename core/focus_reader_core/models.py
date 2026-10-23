from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True, slots=True)
class HistoryEntry:
    id: int
    title: str
    url: str
    domain: str
    word_count: int
    minutes: float
    visited_at: datetime


@dataclass(frozen=True, slots=True)
class TodayStats:
    date: str
    pages: int
    minutes: float
    words: int


@dataclass(frozen=True, slots=True)
class DayStats:
    date: str
    pages: int
    minutes: float
    words: int


@dataclass(frozen=True, slots=True)
class DomainStats:
    domain: str
    pages: int
    minutes: float


@dataclass(frozen=True, slots=True)
class WeekStats:
    start_date: str
    end_date: str
    pages: int
    minutes: float
    words: int
    days: list[DayStats]
    top_domains: list[DomainStats]
