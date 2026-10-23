import {
  DEFAULT_SETTINGS,
  FONT_SIZE,
  LINE_WIDTH,
  LOG_DEDUPE_MS,
  RECENT_LOG_RETENTION_MS,
  STORAGE_KEYS,
} from "./constants.js";
import { normalizeDomain, parseBlocklist } from "./domain.js";

function storageArea() {
  const area = globalThis.chrome?.storage?.local;
  if (!area) {
    throw new Error("Chrome storage is unavailable. Reload the extension.");
  }
  return area;
}

function read(keys) {
  return new Promise((resolve, reject) => {
    storageArea().get(keys, (result) => {
      const error = globalThis.chrome?.runtime?.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(result ?? {});
    });
  });
}

function write(items) {
  return new Promise((resolve, reject) => {
    storageArea().set(items, () => {
      const error = globalThis.chrome?.runtime?.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve();
    });
  });
}

function clampNumber(value, minimum, maximum, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(number)));
}

function uniqueDomains(values) {
  const seen = new Set();
  const domains = [];

  for (const value of values) {
    const domain = normalizeDomain(value);
    if (domain && !seen.has(domain)) {
      seen.add(domain);
      domains.push(domain);
    }
  }

  return domains;
}

export function normalizeSettings(raw = {}) {
  const blocklist = Array.isArray(raw.blocklist)
    ? raw.blocklist
    : typeof raw.blocklist === "string"
      ? parseBlocklist(raw.blocklist)
      : [];

  return {
    loggingEnabled: raw.loggingEnabled === true,
    blocklist: uniqueDomains(blocklist),
    fontSize: clampNumber(raw.fontSize, FONT_SIZE.min, FONT_SIZE.max, FONT_SIZE.default),
    lineWidth: clampNumber(
      raw.lineWidth,
      LINE_WIDTH.min,
      LINE_WIDTH.max,
      LINE_WIDTH.default,
    ),
  };
}

export function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export async function getSettings() {
  const result = await read([STORAGE_KEYS.settings]);
  return normalizeSettings(result[STORAGE_KEYS.settings]);
}

export async function saveSettings(patch) {
  const current = await getSettings();
  const next = normalizeSettings({ ...current, ...patch });
  await write({ [STORAGE_KEYS.settings]: next });
  return next;
}

export async function getFocusStates() {
  const result = await read([STORAGE_KEYS.focusStates]);
  const raw = result[STORAGE_KEYS.focusStates];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};

  const states = {};
  for (const [domain, enabled] of Object.entries(raw)) {
    const key = normalizeDomain(domain);
    if (key && enabled === true) states[key] = true;
  }
  return states;
}

export async function getFocusState(domain) {
  const key = normalizeDomain(domain);
  if (!key) return false;

  const states = await getFocusStates();
  return states[key] === true;
}

export async function setFocusState(domain, enabled) {
  const key = normalizeDomain(domain);
  if (!key) return false;

  const states = await getFocusStates();
  if (enabled === true) {
    states[key] = true;
  } else {
    delete states[key];
  }

  await write({ [STORAGE_KEYS.focusStates]: states });
  return states[key] === true;
}

export async function getCachedTodayStats() {
  const today = localDateKey();
  const result = await read([STORAGE_KEYS.cachedTodayStats]);
  const raw = result[STORAGE_KEYS.cachedTodayStats];

  if (!raw || typeof raw !== "object" || raw.date !== today) {
    return { date: today, minutes: 0, pages: 0 };
  }

  const minutes = Number(raw.minutes);
  const pages = Number(raw.pages);

  return {
    date: today,
    minutes: Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes * 100) / 100 : 0,
    pages: Number.isFinite(pages) && pages > 0 ? Math.round(pages) : 0,
  };
}

export async function saveCachedTodayStats(stats) {
  const today = localDateKey();
  const raw = stats && typeof stats === "object" ? stats : {};
  const minutes = Number(raw.minutes);
  const pages = Number(raw.pages);

  const normalized = {
    date: today,
    minutes: Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes * 100) / 100 : 0,
    pages: Number.isFinite(pages) && pages > 0 ? Math.round(pages) : 0,
  };

  await write({ [STORAGE_KEYS.cachedTodayStats]: normalized });
  return normalized;
}

function normalizeRecentLogs(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};

  const logs = {};
  for (const [url, timestamp] of Object.entries(raw)) {
    const value = Number(timestamp);
    if (url && Number.isFinite(value) && value > 0) {
      logs[url] = value;
    }
  }
  return logs;
}

export async function getRecentLogs() {
  const result = await read([STORAGE_KEYS.recentLogs]);
  return normalizeRecentLogs(result[STORAGE_KEYS.recentLogs]);
}

export async function wasRecentlyLogged(url, now = Date.now(), ttlMs = LOG_DEDUPE_MS) {
  if (!url) return false;

  const logs = await getRecentLogs();
  const lastLoggedAt = logs[url];
  return (
    Number.isFinite(lastLoggedAt) &&
    now >= lastLoggedAt &&
    now - lastLoggedAt < ttlMs
  );
}

export async function markRecentLog(url, now = Date.now()) {
  if (!url) return;

  const logs = await getRecentLogs();
  logs[url] = now;

  const cutoff = now - RECENT_LOG_RETENTION_MS;
  for (const [key, timestamp] of Object.entries(logs)) {
    if (timestamp < cutoff) delete logs[key];
  }

  await write({ [STORAGE_KEYS.recentLogs]: logs });
}

export async function clearRecentLogs() {
  await write({ [STORAGE_KEYS.recentLogs]: {} });
}
