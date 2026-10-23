import { describe, expect, it } from "vitest";

import {
  buildHistoryPayload,
  canonicalUrl,
  isLoggableUrl,
  logDecision,
} from "../lib/logging.js";

const NOW = new Date("2026-10-23T05:00:00.000Z");
const SETTINGS = { loggingEnabled: true, blocklist: [] };

function page(overrides = {}) {
  return {
    title: "  Example\n\narticle  ",
    url: "https://www.example.com/article",
    wordCount: 200,
    minutes: 1,
    ...overrides,
  };
}

describe("canonicalUrl", () => {
  it("accepts normal web pages", () => {
    expect(canonicalUrl("https://example.com/article")).toBe(
      "https://example.com/article",
    );
    expect(isLoggableUrl("http://example.com")).toBe(true);
  });

  it("rejects browser, file, and invalid URLs", () => {
    expect(canonicalUrl("chrome://extensions")).toBe("");
    expect(canonicalUrl("file:///C:/notes.txt")).toBe("");
    expect(canonicalUrl("not a url")).toBe("");
    expect(isLoggableUrl("")).toBe(false);
  });
});

describe("buildHistoryPayload", () => {
  it("cleans the title and builds the API contract", () => {
    expect(buildHistoryPayload(page(), NOW)).toEqual({
      title: "Example article",
      url: "https://www.example.com/article",
      word_count: 200,
      minutes: 1,
      visited_at: "2026-10-23T05:00:00.000Z",
    });
  });

  it("falls back to the domain when the title is empty", () => {
    expect(buildHistoryPayload(page({ title: "   " }), NOW).title).toBe(
      "example.com",
    );
  });

  it("clamps unsafe numeric values", () => {
    const payload = buildHistoryPayload(
      page({ wordCount: 12.9, minutes: 5000 }),
      NOW,
    );

    expect(payload.word_count).toBe(12);
    expect(payload.minutes).toBe(1440);
  });

  it("rejects unsupported pages", () => {
    expect(buildHistoryPayload(page({ url: "chrome://extensions" }), NOW)).toBeNull();
  });
});

describe("logDecision", () => {
  it("requires explicit opt-in", () => {
    expect(logDecision({ pageInfo: page(), settings: { loggingEnabled: false } })).toEqual({
      allowed: false,
      reason: "disabled",
    });
  });

  it("blocks configured domains and their subdomains", () => {
    expect(
      logDecision({
        pageInfo: page({ url: "https://login.example.com/article" }),
        settings: { loggingEnabled: true, blocklist: ["example.com"] },
      }),
    ).toEqual({ allowed: false, reason: "blocked" });
  });

  it("skips very short pages", () => {
    expect(
      logDecision({
        pageInfo: page({ wordCount: 49 }),
        settings: SETTINGS,
      }),
    ).toEqual({ allowed: false, reason: "too-short" });
  });

  it("skips pages logged recently", () => {
    const url = "https://www.example.com/article";
    const now = NOW.getTime();

    expect(
      logDecision({
        pageInfo: page(),
        settings: SETTINGS,
        recentLogs: { [url]: now - 1000 },
        now,
        dedupeMs: 60_000,
      }),
    ).toEqual({ allowed: false, reason: "duplicate" });
  });

  it("allows an eligible page after the dedupe window", () => {
    const url = "https://www.example.com/article";
    const now = NOW.getTime();
    const decision = logDecision({
      pageInfo: page(),
      settings: SETTINGS,
      recentLogs: { [url]: now - 120_000 },
      now,
      dedupeMs: 60_000,
    });

    expect(decision.allowed).toBe(true);
    expect(decision.domain).toBe("example.com");
    expect(decision.payload.url).toBe(url);
  });
});
