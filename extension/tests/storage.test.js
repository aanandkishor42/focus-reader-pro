import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearRecentLogs,
  getCachedTodayStats,
  getFocusState,
  getRecentLogs,
  getSettings,
  localDateKey,
  markRecentLog,
  saveCachedTodayStats,
  saveSettings,
  setFocusState,
  wasRecentlyLogged,
} from "../lib/storage.js";

let chromeMock;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function installChrome(initial = {}) {
  const data = clone(initial);

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
    runtime: { lastError: null },
  });

  return { data, local };
}

beforeEach(() => {
  chromeMock = installChrome();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("settings storage", () => {
  it("returns safe defaults when nothing has been saved", async () => {
    await expect(getSettings()).resolves.toEqual({
      loggingEnabled: false,
      blocklist: [],
      fontSize: 19,
      lineWidth: 68,
    });
  });

  it("normalizes and clamps saved settings", async () => {
    const saved = await saveSettings({
      loggingEnabled: true,
      blocklist: ["https://www.Bank.Example/path", "bank.example"],
      fontSize: 999,
      lineWidth: 10,
    });

    expect(saved).toEqual({
      loggingEnabled: true,
      blocklist: ["bank.example"],
      fontSize: 28,
      lineWidth: 50,
    });
    expect(chromeMock.data.settings).toEqual(saved);
  });
});

describe("focus state storage", () => {
  it("stores focus mode per normalized domain", async () => {
    await expect(setFocusState("https://www.Example.com/article", true)).resolves.toBe(true);
    await expect(getFocusState("example.com")).resolves.toBe(true);
    expect(chromeMock.data.focusStates).toEqual({ "example.com": true });
  });

  it("removes a domain when focus mode is disabled", async () => {
    await setFocusState("example.com", true);
    await expect(setFocusState("example.com", false)).resolves.toBe(false);
    expect(chromeMock.data.focusStates).toEqual({});
  });

  it("ignores invalid domains", async () => {
    await expect(setFocusState("", true)).resolves.toBe(false);
    await expect(getFocusState("")).resolves.toBe(false);
  });
});

describe("recent log storage", () => {
  const url = "https://example.com/article";

  it("stores and checks the dedupe timestamp", async () => {
    await markRecentLog(url, 1_000);

    expect(await getRecentLogs()).toEqual({ [url]: 1_000 });
    expect(await wasRecentlyLogged(url, 1_500, 1_000)).toBe(true);
    expect(await wasRecentlyLogged(url, 2_001, 1_000)).toBe(false);
    expect(await wasRecentlyLogged("https://example.com/other", 1_500, 1_000)).toBe(false);
  });

  it("prunes entries older than the retention window", async () => {
    await markRecentLog("https://old.example/article", 1_000);
    await markRecentLog(url, 8 * 24 * 60 * 60 * 1000);

    expect(await getRecentLogs()).toEqual({ [url]: 8 * 24 * 60 * 60 * 1000 });
  });

  it("clears all recent entries", async () => {
    await markRecentLog(url, 1_000);
    await clearRecentLogs();

    expect(await getRecentLogs()).toEqual({});
  });
});

describe("cached today stats", () => {
  it("returns zeros when the cache is missing or stale", async () => {
    expect(await getCachedTodayStats()).toEqual({
      date: localDateKey(),
      minutes: 0,
      pages: 0,
    });

    chromeMock = installChrome({
      cachedTodayStats: { date: "1999-01-01", minutes: 99, pages: 8 },
    });

    expect(await getCachedTodayStats()).toEqual({
      date: localDateKey(),
      minutes: 0,
      pages: 0,
    });
  });

  it("rounds and stores values for the current local day", async () => {
    const saved = await saveCachedTodayStats({ minutes: 12.345, pages: 2.4 });

    expect(saved).toEqual({
      date: localDateKey(),
      minutes: 12.35,
      pages: 2,
    });
    expect(await getCachedTodayStats()).toEqual(saved);
  });

  it("never stores negative values", async () => {
    await expect(saveCachedTodayStats({ minutes: -2, pages: -3 })).resolves.toEqual({
      date: localDateKey(),
      minutes: 0,
      pages: 0,
    });
  });
});
