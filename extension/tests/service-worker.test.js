import { afterEach, describe, expect, it, vi } from "vitest";

import { MESSAGE_TYPES } from "../lib/constants.js";

const SETTINGS = {
  loggingEnabled: true,
  blocklist: [],
  fontSize: 19,
  lineWidth: 68,
};

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function jsonResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(data),
  };
}

function page(overrides = {}) {
  return {
    title: "Example article",
    url: "https://www.example.com/article",
    wordCount: 200,
    minutes: 1,
    ...overrides,
  };
}

function installChrome(initial = {}) {
  const data = clone(initial);
  const listeners = {};

  const local = {
    get: vi.fn((keys, callback) => {
      const keyList = Array.isArray(keys) ? keys : [keys];
      const result = {};

      for (const key of keyList) {
        if (Object.prototype.hasOwnProperty.call(data, key)) {
          result[key] = clone(data[key]);
        }
      }

      queueMicrotask(() => callback(result));
    }),
    set: vi.fn((items, callback) => {
      Object.assign(data, clone(items));
      queueMicrotask(() => callback?.());
    }),
  };

  vi.stubGlobal("chrome", {
    storage: { local },
    runtime: {
      lastError: null,
      onInstalled: { addListener: vi.fn() },
      onStartup: { addListener: vi.fn() },
      onMessage: {
        addListener: vi.fn((listener) => {
          listeners.message = listener;
        }),
      },
    },
    commands: { onCommand: { addListener: vi.fn() } },
    tabs: {
      query: vi.fn(async () => []),
      sendMessage: vi.fn(async () => undefined),
    },
  });

  return { data, listeners };
}

async function loadWorker({ settings = SETTINGS, recentLogs, fetchImpl } = {}) {
  vi.resetModules();
  const mock = installChrome({ settings, recentLogs });
  vi.stubGlobal("fetch", fetchImpl || vi.fn());
  await import("../background/service-worker.js");
  return { ...mock, listener: mock.listeners.message };
}

function send(listener, message) {
  return new Promise((resolve) => {
    const returned = listener(message, {}, resolve);
    expect(returned).toBe(true);
  });
}

function apiFetch() {
  return vi.fn(async (url, options = {}) => {
    if (url.endsWith("/history") && options.method === "POST") {
      return jsonResponse({ id: 1 }, 201);
    }
    if (url.endsWith("/history") && options.method === "DELETE") {
      return jsonResponse({ deleted: 3 });
    }
    if (url.endsWith("/stats/today")) {
      return jsonResponse({ date: "2026-10-23", pages: 1, minutes: 1, words: 200 });
    }
    if (url.endsWith("/health")) {
      return jsonResponse({ status: "ok" });
    }
    throw new Error(`Unexpected request: ${options.method} ${url}`);
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("service worker logging", () => {
  it("stores an eligible page and refreshes today's stats", async () => {
    const fetchImpl = apiFetch();
    const { listener, data } = await loadWorker({ fetchImpl });

    const response = await send(listener, {
      type: MESSAGE_TYPES.LOG_PAGE,
      page: page(),
    });

    expect(response).toMatchObject({
      ok: true,
      logged: true,
      stats: { pages: 1, minutes: 1 },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(data.recentLogs["https://www.example.com/article"]).toBeTypeOf("number");
    expect(data.cachedTodayStats).toMatchObject({ pages: 1, minutes: 1 });
  });

  it("does not log the same URL twice inside the dedupe window", async () => {
    const fetchImpl = apiFetch();
    const { listener } = await loadWorker({ fetchImpl });

    await send(listener, { type: MESSAGE_TYPES.LOG_PAGE, page: page() });
    const response = await send(listener, {
      type: MESSAGE_TYPES.LOG_PAGE,
      page: page(),
    });

    expect(response).toEqual({ ok: true, logged: false, reason: "duplicate" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does nothing while logging is disabled", async () => {
    const fetchImpl = vi.fn();
    const { listener } = await loadWorker({
      settings: { ...SETTINGS, loggingEnabled: false },
      fetchImpl,
    });

    const response = await send(listener, {
      type: MESSAGE_TYPES.LOG_PAGE,
      page: page(),
    });

    expect(response).toEqual({ ok: true, logged: false, reason: "disabled" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("respects the blocklist", async () => {
    const fetchImpl = vi.fn();
    const { listener } = await loadWorker({
      settings: { ...SETTINGS, blocklist: ["example.com"] },
      fetchImpl,
    });

    expect(
      await send(listener, {
        type: MESSAGE_TYPES.LOG_PAGE,
        page: page(),
      }),
    ).toEqual({ ok: true, logged: false, reason: "blocked" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("skips pages below the minimum word count", async () => {
    const fetchImpl = vi.fn();
    const { listener } = await loadWorker({ fetchImpl });

    expect(
      await send(listener, {
        type: MESSAGE_TYPES.LOG_PAGE,
        page: page({ wordCount: 10 }),
      }),
    ).toEqual({ ok: true, logged: false, reason: "too-short" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reports an offline API without marking the page as logged", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const { listener, data } = await loadWorker({ fetchImpl });

    const response = await send(listener, {
      type: MESSAGE_TYPES.LOG_PAGE,
      page: page(),
    });

    expect(response).toMatchObject({
      ok: false,
      logged: false,
      reason: "api-error",
    });
    expect(response.error).toContain("not running");
    expect(data.recentLogs).toBeUndefined();
    warn.mockRestore();
  });

  it("checks API health and clears history", async () => {
    const fetchImpl = apiFetch();
    const { listener, data } = await loadWorker({
      recentLogs: { "https://example.com/article": Date.now() },
      fetchImpl,
    });

    await send(listener, {
      type: MESSAGE_TYPES.LOG_PAGE,
      page: page(),
    });

    expect(await send(listener, { type: MESSAGE_TYPES.GET_API_STATUS })).toEqual({
      ok: true,
      status: "ok",
    });

    expect(await send(listener, { type: MESSAGE_TYPES.CLEAR_HISTORY })).toEqual({
      ok: true,
      deleted: 3,
    });
    expect(data.recentLogs).toEqual({});
    expect(data.cachedTodayStats).toMatchObject({ pages: 0, minutes: 0 });
  });
});
