import {
  COMMANDS,
  LOG_DEDUPE_MS,
  MESSAGE_TYPES,
  MIN_LOG_WORDS,
} from "../lib/constants.js";
import { ApiError, api } from "../lib/api.js";
import { canonicalUrl, logDecision } from "../lib/logging.js";
import {
  clearRecentLogs,
  getRecentLogs,
  getSettings,
  markRecentLog,
  saveCachedTodayStats,
  saveSettings,
} from "../lib/storage.js";

const inFlightLogs = new Map();

chrome.runtime.onInstalled.addListener(() => {
  // Persist defaults once so every UI surface reads the same settings shape.
  getSettings()
    .then((settings) => saveSettings(settings))
    .catch((error) => console.warn("[Focus Reader] Could not save defaults:", error));
});

chrome.runtime.onStartup.addListener(() => {
  refreshTodayStats().catch(() => {});
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== COMMANDS.TOGGLE_FOCUS) return;
  toggleFocusOnActiveTab().catch((error) => {
    // Protected pages such as chrome:// do not have a content script.
    console.warn("[Focus Reader] Focus shortcut was unavailable:", error);
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message.type !== "string") return false;

  handleMessage(message)
    .then((response) => sendResponse(response))
    .catch((error) => {
      console.warn("[Focus Reader] Message failed:", error);
      sendResponse({ ok: false, error: readableError(error) });
    });

  return true;
});

async function handleMessage(message) {
  switch (message.type) {
    case MESSAGE_TYPES.LOG_PAGE:
      return logPage(message.page);
    case MESSAGE_TYPES.GET_TODAY_STATS:
      return fetchTodayStats();
    case MESSAGE_TYPES.GET_API_STATUS:
      return checkApiStatus();
    case MESSAGE_TYPES.CLEAR_HISTORY:
      return clearHistory();
    default:
      return { ok: false, error: "Unknown Focus Reader message." };
  }
}

async function logPage(pageInfo) {
  const url = canonicalUrl(pageInfo?.url);
  if (!url) return { ok: true, logged: false, reason: "unsupported" };

  if (inFlightLogs.has(url)) return inFlightLogs.get(url);

  const task = performLog(pageInfo, url).finally(() => {
    inFlightLogs.delete(url);
  });
  inFlightLogs.set(url, task);
  return task;
}

async function performLog(pageInfo, url) {
  const [settings, recentLogs] = await Promise.all([getSettings(), getRecentLogs()]);
  const decision = logDecision({
    pageInfo,
    settings,
    recentLogs,
    now: Date.now(),
    minWords: MIN_LOG_WORDS,
    dedupeMs: LOG_DEDUPE_MS,
  });

  if (!decision.allowed) {
    return { ok: true, logged: false, reason: decision.reason };
  }

  try {
    const entry = await api.logReading(decision.payload);
    await markRecentLog(url);
    const stats = await refreshTodayStats();
    return {
      ok: true,
      logged: true,
      entry,
      stats: stats || undefined,
    };
  } catch (error) {
    console.warn("[Focus Reader] Could not save reading history:", error);
    return {
      ok: false,
      logged: false,
      reason: "api-error",
      error: readableError(error),
    };
  }
}

async function fetchTodayStats() {
  try {
    const stats = await api.getTodayStats();
    const cached = await saveCachedTodayStats(stats);
    return { ok: true, stats: cached };
  } catch (error) {
    return { ok: false, error: readableError(error) };
  }
}

async function refreshTodayStats() {
  try {
    const stats = await api.getTodayStats();
    return await saveCachedTodayStats(stats);
  } catch {
    return null;
  }
}

async function checkApiStatus() {
  try {
    const health = await api.health();
    return { ok: true, status: health?.status || "ok" };
  } catch (error) {
    return { ok: false, error: readableError(error) };
  }
}

async function clearHistory() {
  try {
    const result = await api.clearHistory();
    await Promise.all([clearRecentLogs(), saveCachedTodayStats({ minutes: 0, pages: 0 })]);
    return { ok: true, deleted: Number(result?.deleted) || 0 };
  } catch (error) {
    return { ok: false, error: readableError(error) };
  }
}

function toggleFocusOnActiveTab() {
  return chrome.tabs
    .query({ active: true, lastFocusedWindow: true })
    .then(([tab]) => {
      if (!tab?.id) return undefined;
      return chrome.tabs.sendMessage(tab.id, { type: MESSAGE_TYPES.TOGGLE_FOCUS });
    });
}

function readableError(error) {
  if (error instanceof ApiError || (error instanceof Error && error.message)) {
    return error.message;
  }
  return "The local API request failed.";
}
