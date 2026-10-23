import { MESSAGE_TYPES } from "../lib/constants.js";
import { parseBlocklist } from "../lib/domain.js";
import { getSettings, saveSettings } from "../lib/storage.js";

const form = document.querySelector("#settings-form");
const loggingEnabled = document.querySelector("#logging-enabled");
const blocklist = document.querySelector("#blocklist");
const saveStatus = document.querySelector("#save-status");
const apiStatus = document.querySelector("#api-status");
const clearHistory = document.querySelector("#clear-history");

let statusTimer = null;

initialize();

async function initialize() {
  form.addEventListener("submit", handleSubmit);
  clearHistory.addEventListener("click", handleClearHistory);

  try {
    const settings = await getSettings();
    loggingEnabled.checked = settings.loggingEnabled;
    blocklist.value = settings.blocklist.join("\n");
  } catch (error) {
    announce(readableError(error), true);
  }

  await checkApiStatus();
}

async function handleSubmit(event) {
  event.preventDefault();

  try {
    const settings = await saveSettings({
      loggingEnabled: loggingEnabled.checked,
      blocklist: parseBlocklist(blocklist.value),
    });

    blocklist.value = settings.blocklist.join("\n");

    if (settings.loggingEnabled) {
      const online = await checkApiStatus();
      if (!online) {
        announce("Settings saved, but the local API is offline. Pages will not be logged until it is running.", true);
        return;
      }
    }

    announce(`Settings saved. Logging is ${settings.loggingEnabled ? "on" : "off"}.`);
  } catch (error) {
    announce(readableError(error), true);
  }
}

async function handleClearHistory() {
  if (!window.confirm("Delete all saved reading history from this device?")) return;

  clearHistory.disabled = true;

  try {
    const response = await sendRuntimeMessage({ type: MESSAGE_TYPES.CLEAR_HISTORY });
    if (!response?.ok) {
      throw new Error(response?.error || "Could not clear reading history.");
    }

    const deleted = Number(response.deleted) || 0;
    announce(`Deleted ${deleted} saved page${deleted === 1 ? "" : "s"}.`);
  } catch (error) {
    announce(readableError(error), true);
  }

  await checkApiStatus();
}

async function checkApiStatus() {
  try {
    const response = await sendRuntimeMessage({ type: MESSAGE_TYPES.GET_API_STATUS });
    if (!response?.ok) {
      throw new Error(response?.error || "The local API is offline.");
    }

    renderApiStatus(true);
    return true;
  } catch (error) {
    renderApiStatus(false, readableError(error));
    return false;
  }
}

function renderApiStatus(online, detail = "") {
  apiStatus.textContent = online
    ? "Local API online."
    : "Local API offline. Start it on port 5000.";
  apiStatus.dataset.tone = online ? "ok" : "error";
  apiStatus.title = online
    ? "Focus Reader Pro is connected to the local API."
    : detail || "Start the local API on port 5000.";
  clearHistory.disabled = !online;
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

function announce(message, isError = false) {
  saveStatus.textContent = message;
  saveStatus.dataset.tone = isError ? "error" : "ok";

  window.clearTimeout(statusTimer);
  statusTimer = window.setTimeout(() => {
    saveStatus.textContent = "";
    delete saveStatus.dataset.tone;
  }, 5000);
}

function readableError(error) {
  if (error instanceof Error && error.message) return error.message;
  return String(error || "Something went wrong.");
}
