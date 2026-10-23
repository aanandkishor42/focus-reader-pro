(() => {
  const state = { focusEnabled: false };
  let settingsCache = null;
  let autoLogTimer = null;
  let lastAutoLogUrl = "";

  function applyAppearance(settings) {
    const root = document.documentElement;
    if (!root) return;

    settingsCache = settings;
    root.style.setProperty("--fr-font-size", `${settings.fontSize}px`);
    root.style.setProperty("--fr-line-width", `${settings.lineWidth}ch`);
  }

  function applyFocus(enabled) {
    const root = document.documentElement;
    if (!root) return;

    state.focusEnabled = enabled === true;
    root.classList.toggle("focus-reader-active", state.focusEnabled);
  }

  function loadModules() {
    // Manifest content scripts are classic scripts, so static imports are not
    // available. Dynamic imports keep the pure logic shared and testable.
    const base = chrome.runtime.getURL("lib/");
    return Promise.all([
      import(`${base}constants.js`),
      import(`${base}storage.js`),
      import(`${base}word-count.js`),
      import(`${base}domain.js`),
    ]).then(([constants, storage, wordCount, domain]) => ({
      constants,
      storage,
      wordCount,
      domain,
    }));
  }

  async function initialize() {
    const modules = await loadModules();
    const settings = await modules.storage.getSettings();

    applyAppearance(settings);

    const domain = modules.domain.normalizeDomain(location.hostname);
    applyFocus(domain ? await modules.storage.getFocusState(domain) : false);
    scheduleAutoLog(modules, settings);

    return modules;
  }

  const readyPromise = initialize();
  readyPromise.catch((error) => {
    console.warn("[Focus Reader] Initialization failed:", error);
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;

    readyPromise
      .then(async (modules) => {
        const settingsKey = modules.constants.STORAGE_KEYS.settings;
        const focusKey = modules.constants.STORAGE_KEYS.focusStates;

        if (changes[settingsKey]) {
          const settings = modules.storage.normalizeSettings(changes[settingsKey].newValue);
          applyAppearance(settings);
          scheduleAutoLog(modules, settings);
        }

        if (changes[focusKey]) {
          applyFocus(await modules.storage.getFocusState(location.hostname));
        }
      })
      .catch((error) => {
        console.warn("[Focus Reader] Could not apply stored settings:", error);
      });
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;

    readyPromise
      .then(async (modules) => {
        const settings = await modules.storage.getSettings();
        scheduleAutoLog(modules, settings);
      })
      .catch((error) => {
        console.warn("[Focus Reader] Could not check visibility:", error);
      });
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message.type !== "string") return false;

    handleMessage(message)
      .then((response) => sendResponse(response))
      .catch((error) => {
        console.warn("[Focus Reader] Message failed:", error);
        sendResponse({
          ok: false,
          error: "Focus Reader could not process this page.",
        });
      });

    return true;
  });

  async function handleMessage(message) {
    const modules = await readyPromise;
    const { MESSAGE_TYPES } = modules.constants;

    if (message.type === MESSAGE_TYPES.GET_PAGE_INFO) {
      return buildPageInfo(modules);
    }

    if (message.type === MESSAGE_TYPES.SET_FOCUS) {
      return setFocus(modules, message.enabled === true);
    }

    if (message.type === MESSAGE_TYPES.TOGGLE_FOCUS) {
      return setFocus(modules, !state.focusEnabled);
    }

    return { ok: false, error: "Unknown Focus Reader message." };
  }

  async function setFocus(modules, enabled) {
    applyFocus(enabled);
    await modules.storage.setFocusState(location.hostname, enabled);
    return { ok: true, focusEnabled: state.focusEnabled };
  }

  function scheduleAutoLog(modules, settings) {
    window.clearTimeout(autoLogTimer);
    autoLogTimer = null;

    if (!settings?.loggingEnabled) {
      lastAutoLogUrl = "";
      return;
    }

    if (document.visibilityState !== "visible") return;

    const domain = modules.domain.normalizeDomain(location.hostname);
    if (!domain || modules.domain.isDomainBlocked(domain, settings.blocklist)) return;

    if (lastAutoLogUrl === location.href) return;

    autoLogTimer = window.setTimeout(() => {
      autoLogTimer = null;
      logCurrentPage(modules, settings).catch((error) => {
        console.warn("[Focus Reader] Automatic logging failed:", error);
      });
    }, modules.constants.AUTO_LOG_DELAY_MS);
  }

  async function logCurrentPage(modules, settings) {
    if (!settings?.loggingEnabled || document.visibilityState !== "visible") return;
    if (lastAutoLogUrl === location.href) return;

    const page = await buildPageInfo(modules);
    lastAutoLogUrl = location.href;
    if (page.wordCount < modules.constants.MIN_LOG_WORDS) return;

    await sendRuntimeMessage({
      type: modules.constants.MESSAGE_TYPES.LOG_PAGE,
      page,
    });
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

  function waitForBody() {
    if (document.body) return Promise.resolve();

    return new Promise((resolve) => {
      document.addEventListener("DOMContentLoaded", () => resolve(), { once: true });
    });
  }

  function readableRoot() {
    const candidates = Array.from(
      document.querySelectorAll("article, main, [role='main']"),
    );
    let best = null;
    let bestLength = 0;

    for (const element of candidates) {
      const length = (element.textContent ?? "").trim().length;
      if (length > bestLength) {
        best = element;
        bestLength = length;
      }
    }

    return best ?? document.body;
  }

  function extractReadableText() {
    const root = readableRoot();
    if (!root) return "";

    const clone = root.cloneNode(true);
    clone
      .querySelectorAll(
        [
          "script",
          "style",
          "noscript",
          "nav",
          "footer",
          "aside",
          "form",
          "button",
          "[role='navigation']",
          "[role='contentinfo']",
          "[role='complementary']",
          "[aria-hidden='true']",
          "[hidden]",
          ".advertisement",
          ".advert",
          ".ads",
          "[class*='advert']",
          "[id*='advert']",
        ].join(","),
      )
      .forEach((element) => element.remove());

    return clone.textContent ?? "";
  }

  async function buildPageInfo(modules) {
    await waitForBody();

    const text = extractReadableText();
    const wordCount = modules.wordCount.countWords(text);

    return {
      ok: true,
      title: document.title || location.hostname,
      url: location.href,
      domain: location.hostname.toLowerCase(),
      wordCount,
      minutes: modules.wordCount.estimateReadingMinutes(wordCount),
      focusEnabled: state.focusEnabled,
      fontSettings: settingsCache,
    };
  }
})();
