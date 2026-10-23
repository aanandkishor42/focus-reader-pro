export const WORDS_PER_MINUTE = 200;

export const API_BASE_URL = "http://127.0.0.1:5000";

export const MIN_LOG_WORDS = 50;
export const LOG_DEDUPE_MS = 30 * 60 * 1000;
export const RECENT_LOG_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export const AUTO_LOG_DELAY_MS = 1200;

export const STORAGE_KEYS = Object.freeze({
  settings: "settings",
  focusStates: "focusStates",
  cachedTodayStats: "cachedTodayStats",
  recentLogs: "recentLogs",
});

export const MESSAGE_TYPES = Object.freeze({
  GET_PAGE_INFO: "FR_GET_PAGE_INFO",
  SET_FOCUS: "FR_SET_FOCUS",
  TOGGLE_FOCUS: "FR_TOGGLE_FOCUS",
  LOG_PAGE: "FR_LOG_PAGE",
  GET_TODAY_STATS: "FR_GET_TODAY_STATS",
  GET_API_STATUS: "FR_GET_API_STATUS",
  CLEAR_HISTORY: "FR_CLEAR_HISTORY",
});

export const COMMANDS = Object.freeze({
  TOGGLE_FOCUS: "toggle-focus-mode",
});

export const FONT_SIZE = Object.freeze({
  min: 16,
  max: 28,
  step: 1,
  default: 19,
});

export const LINE_WIDTH = Object.freeze({
  min: 50,
  max: 90,
  step: 2,
  default: 68,
});

export const DEFAULT_SETTINGS = Object.freeze({
  loggingEnabled: false,
  blocklist: Object.freeze([]),
  fontSize: FONT_SIZE.default,
  lineWidth: LINE_WIDTH.default,
});
