import { LOG_DEDUPE_MS, MIN_LOG_WORDS } from "./constants.js";
import { isDomainBlocked, normalizeDomain } from "./domain.js";

const MAX_TITLE_LENGTH = 500;
const MAX_WORD_COUNT = 10_000_000;
const MAX_MINUTES = 1440;

export function canonicalUrl(value) {
  try {
    const url = new URL(String(value ?? ""));
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname) return "";
    return url.href;
  } catch {
    return "";
  }
}

export function isLoggableUrl(value) {
  return canonicalUrl(value) !== "";
}

function cleanTitle(value, fallback) {
  const cleaned = String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TITLE_LENGTH);

  return cleaned || fallback;
}

function normalizeWordCount(value) {
  const count = Number(value);
  if (!Number.isFinite(count) || count <= 0) return 0;
  return Math.min(MAX_WORD_COUNT, Math.trunc(count));
}

function normalizeMinutes(value) {
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes <= 0) return 0;
  return Math.min(MAX_MINUTES, Math.round(minutes * 100) / 100);
}

export function buildHistoryPayload(pageInfo, now = new Date()) {
  const url = canonicalUrl(pageInfo?.url);
  if (!url) return null;

  const domain = normalizeDomain(url);
  if (!domain) return null;

  const timestamp = now instanceof Date ? now : new Date(now);
  const visitedAt = Number.isNaN(timestamp.getTime()) ? new Date() : timestamp;

  return {
    title: cleanTitle(pageInfo.title, domain),
    url,
    word_count: normalizeWordCount(pageInfo.wordCount),
    minutes: normalizeMinutes(pageInfo.minutes),
    visited_at: visitedAt.toISOString(),
  };
}

export function logDecision({
  pageInfo,
  settings,
  recentLogs = {},
  now = Date.now(),
  minWords = MIN_LOG_WORDS,
  dedupeMs = LOG_DEDUPE_MS,
} = {}) {
  if (settings?.loggingEnabled !== true) {
    return { allowed: false, reason: "disabled" };
  }

  const url = canonicalUrl(pageInfo?.url);
  if (!url) {
    return { allowed: false, reason: "unsupported" };
  }

  const domain = normalizeDomain(url);
  if (!domain) {
    return { allowed: false, reason: "unsupported" };
  }

  if (isDomainBlocked(domain, settings.blocklist)) {
    return { allowed: false, reason: "blocked" };
  }

  const wordCount = Number(pageInfo?.wordCount);
  if (!Number.isFinite(wordCount) || wordCount < minWords) {
    return { allowed: false, reason: "too-short" };
  }

  const lastLoggedAt = Number(recentLogs[url]);
  if (
    Number.isFinite(lastLoggedAt) &&
    lastLoggedAt <= now &&
    now - lastLoggedAt < dedupeMs
  ) {
    return { allowed: false, reason: "duplicate" };
  }

  const payload = buildHistoryPayload(pageInfo, new Date(now));
  if (!payload) {
    return { allowed: false, reason: "unsupported" };
  }

  return { allowed: true, reason: "eligible", domain, payload };
}
