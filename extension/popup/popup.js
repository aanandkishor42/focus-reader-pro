import {
  FONT_SIZE,
  LINE_WIDTH,
  MESSAGE_TYPES,
  MIN_LOG_WORDS,
} from "../lib/constants.js";
import {
  getCachedTodayStats,
  getSettings,
  saveSettings,
} from "../lib/storage.js";
import {
  formatMinutes,
  formatWordCount,
} from "../lib/word-count.js";

const elements = {
  pageDomain: document.querySelector("#page-domain"),
  pageTitle: document.querySelector("#page-title"),
  wordCount: document.querySelector("#word-count"),
  readingTime: document.querySelector("#reading-time"),
  pageWarning: document.querySelector("#page-warning"),
  focusToggle: document.querySelector("#focus-toggle"),
  focusState: document.querySelector("#focus-state"),
  fontSize: document.querySelector("#font-size"),
  fontSizeValue: document.querySelector("#font-size-value"),
  lineWidth: document.querySelector("#line-width"),
  lineWidthValue: document.querySelector("#line-width-value"),
  todayMinutes: document.querySelector("#today-minutes"),
  todayPages: document.querySelector("#today-pages"),
  loggingStatus: document.querySelector("#logging-status"),
  apiStatus: document.querySelector("#api-status"),
  status: document.querySelector("#status"),
  openOptions: document.querySelector("#open-options"),
};

let statusTimer = null;
let saveTimer = null;
let currentSettings = null;

initialize();

async function initialize() {
  wireEvents();
  await Promise.all([loadSettings(), loadTodayStats()]);
  await loadPageInfo();
}

function wireEvents() {
  elements.focusToggle.addEventListener("change", handleFocusToggle);
  elements.fontSize.addEventListener("input", handleAppearanceInput);
  elements.lineWidth.addEventListener("input", handleAppearanceInput);
  elements.fontSize.addEventListener("change", saveAppearance);
  elements.lineWidth.addEventListener("change", saveAppearance);
  elements.openOptions.addEventListener("click", openOptions);
}

async function loadSettings() {
  try {
    const settings = await getSettings();
    currentSettings = settings;

    elements.fontSize.min = String(FONT_SIZE.min);
    elements.fontSize.max = String(FONT_SIZE.max);
    elements.fontSize.step = String(FONT_SIZE.step);
    elements.fontSize.value = String(settings.fontSize);

    elements.lineWidth.min = String(LINE_WIDTH.min);
    elements.lineWidth.max = String(LINE_WIDTH.max);
    elements.lineWidth.step = String(LINE_WIDTH.step);
    elements.lineWidth.value = String(settings.lineWidth);

    syncAppearanceLabels();
    renderLoggingStatus(settings.loggingEnabled);
  } catch (error) {
    announce(readableError(error), true);
  }
}

async function loadTodayStats() {
  try {
    const cached = await getCachedTodayStats();
    renderTodayStats(cached);
  } catch (error) {
    announce(readableError(error), true);
  }

  try {
    const response = await sendRuntimeMessage({ type: MESSAGE_TYPES.GET_TODAY_STATS });
    if (!response?.ok) {
      throw new Error(response?.error || "Could not load today's reading stats.");
    }

    renderTodayStats(response.stats);
    renderApiStatus(true);
  } catch (error) {
    renderApiStatus(false, readableError(error));
  }
}

function renderTodayStats(stats) {
  const minutes = Number(stats?.minutes);
  const pages = Number(stats?.pages);
  elements.todayMinutes.textContent = formatMinutes(Number.isFinite(minutes) ? minutes : 0);
  elements.todayPages.textContent = String(Number.isFinite(pages) && pages > 0 ? Math.round(pages) : 0);
}

function renderApiStatus(online, detail = "") {
  elements.apiStatus.textContent = online ? "API online" : "API offline";
  elements.apiStatus.classList.toggle("is-on", online);
  elements.apiStatus.classList.toggle("is-off", !online);
  elements.apiStatus.title = online
    ? "Connected to the local Focus Reader API."
    : detail || "Start the local API on port 5000.";
}

async function loadPageInfo() {
  try {
    const tab = await activeTab();
    const info = await chrome.tabs.sendMessage(tab.id, {
      type: MESSAGE_TYPES.GET_PAGE_INFO,
    });

    if (!info?.ok) {
      throw new Error(info?.error || "Focus Reader could not read this page.");
    }

    renderPageInfo(info);
    maybeLogPage(info).catch((error) => {
      announce(readableError(error), true);
    });
  } catch (error) {
    showUnsupportedPage(error);
  }
}

function renderPageInfo(info) {
  elements.pageDomain.textContent = info.domain || "Current page";
  elements.pageTitle.textContent = info.title || "Untitled page";
  elements.wordCount.textContent = formatWordCount(info.wordCount);
  elements.readingTime.textContent = formatMinutes(info.minutes);
  elements.pageWarning.hidden = true;

  elements.focusToggle.disabled = false;
  setFocusUi(info.focusEnabled === true);
}

function showUnsupportedPage(error) {
  elements.pageDomain.textContent = "Unsupported page";
  elements.pageTitle.textContent = "Open a normal article page";
  elements.wordCount.textContent = "—";
  elements.readingTime.textContent = "—";
  elements.focusToggle.disabled = true;
  elements.focusToggle.checked = false;
  elements.focusState.textContent = "N/A";
  elements.pageWarning.hidden = false;
  elements.pageWarning.textContent =
    "Chrome protected pages, the Web Store, and some PDFs do not allow extensions. Try a regular http or https article.";

  const message = readableError(error);
  if (/receiving end|establish connection|no active tab|could not read/i.test(message)) {
    announce("Focus Reader is unavailable on this page.", true);
  }
}

async function handleFocusToggle() {
  const desired = elements.focusToggle.checked;
  elements.focusToggle.disabled = true;

  try {
    const tab = await activeTab();
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: MESSAGE_TYPES.SET_FOCUS,
      enabled: desired,
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Focus Mode could not be changed.");
    }

    setFocusUi(response.focusEnabled === true);
    announce(response.focusEnabled ? "Focus Mode enabled." : "Focus Mode disabled.");
  } catch (error) {
    elements.focusToggle.checked = !desired;
    announce(readableError(error), true);
  } finally {
    elements.focusToggle.disabled = false;
  }
}

function setFocusUi(enabled) {
  elements.focusToggle.checked = enabled;
  elements.focusState.textContent = enabled ? "On" : "Off";
}

function handleAppearanceInput() {
  syncAppearanceLabels();
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(saveAppearance, 180);
}

function syncAppearanceLabels() {
  elements.fontSizeValue.textContent = `${elements.fontSize.value} px`;
  elements.lineWidthValue.textContent = `${elements.lineWidth.value} ch`;
}

async function saveAppearance() {
  window.clearTimeout(saveTimer);

  try {
    await saveSettings({
      fontSize: Number(elements.fontSize.value),
      lineWidth: Number(elements.lineWidth.value),
    });
  } catch (error) {
    announce(readableError(error), true);
  }
}

function renderLoggingStatus(enabled) {
  elements.loggingStatus.textContent = enabled ? "Logging on" : "Logging off";
  elements.loggingStatus.classList.toggle("is-on", enabled);
  elements.loggingStatus.title = enabled
    ? "Allowed pages are saved to your local reading history."
    : "Reading history logging is disabled. Enable it in Settings.";
}

async function maybeLogPage(info) {
  if (!currentSettings?.loggingEnabled) return;
  if (Number(info.wordCount) < MIN_LOG_WORDS) return;

  const response = await sendRuntimeMessage({
    type: MESSAGE_TYPES.LOG_PAGE,
    page: info,
  });

  if (!response?.ok) {
    renderApiStatus(false, response?.error);
    announce(response?.error || "Could not save this page to reading history.", true);
    return;
  }

  if (response.logged) {
    if (response.stats) {
      renderTodayStats(response.stats);
    } else {
      await loadTodayStats();
    }
    renderApiStatus(true);
    announce("Saved to reading history.");
    return;
  }

  if (response.reason === "blocked") {
    announce("This domain is blocked in Settings.", true);
  }
}

function sendRuntimeMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(response);
    });
  });
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab is available.");
  return tab;
}

async function openOptions() {
  try {
    await chrome.runtime.openOptionsPage();
  } catch (error) {
    announce(readableError(error), true);
  }
}

function announce(message, isError = false) {
  elements.status.textContent = message;
  elements.status.dataset.tone = isError ? "error" : "ok";

  window.clearTimeout(statusTimer);
  statusTimer = window.setTimeout(() => {
    elements.status.textContent = "";
    delete elements.status.dataset.tone;
  }, 4500);
}

function readableError(error) {
  if (error instanceof Error && error.message) {
    if (/receiving end|establish connection/i.test(error.message)) {
      return "Focus Reader cannot run on this page.";
    }
    return error.message;
  }
  return String(error || "Something went wrong.");
}
