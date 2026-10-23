import { describe, expect, it } from "vitest";

import {
  isDomainBlocked,
  normalizeDomain,
  parseBlocklist,
} from "../lib/domain.js";

describe("normalizeDomain", () => {
  it("normalizes URLs and hostnames", () => {
    expect(normalizeDomain("https://www.Example.com/path?q=1")).toBe("example.com");
    expect(normalizeDomain("bank.example:8443")).toBe("bank.example");
    expect(normalizeDomain("  EXAMPLE.COM  ")).toBe("example.com");
  });

  it("returns an empty string for invalid input", () => {
    expect(normalizeDomain("")).toBe("");
    expect(normalizeDomain(null)).toBe("");
    expect(normalizeDomain("not a domain")).toBe("");
  });
});

describe("isDomainBlocked", () => {
  it("blocks the exact domain and subdomains", () => {
    expect(isDomainBlocked("bank.example", ["bank.example"])).toBe(true);
    expect(isDomainBlocked("login.bank.example", ["bank.example"])).toBe(true);
  });

  it("does not block lookalike domains", () => {
    expect(isDomainBlocked("notbank.example", ["bank.example"])).toBe(false);
    expect(isDomainBlocked("bank.example.evil.test", ["bank.example"])).toBe(false);
  });

  it("handles empty values", () => {
    expect(isDomainBlocked("", ["bank.example"])).toBe(false);
    expect(isDomainBlocked("bank.example", null)).toBe(false);
  });
});

describe("parseBlocklist", () => {
  it("deduplicates, normalizes, and supports comments", () => {
    const parsed = parseBlocklist(
      [
        "bank.example",
        "# ignore this line",
        "https://www.news.example/path",
        "bank.example",
        "mail.example, calendar.example",
      ].join("\n"),
    );

    expect(parsed).toEqual([
      "bank.example",
      "news.example",
      "mail.example",
      "calendar.example",
    ]);
  });

  it("handles empty input", () => {
    expect(parseBlocklist("")).toEqual([]);
    expect(parseBlocklist(undefined)).toEqual([]);
  });
});
