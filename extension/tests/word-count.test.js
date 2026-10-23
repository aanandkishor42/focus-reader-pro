import { describe, expect, it } from "vitest";

import {
  countWords,
  estimateReadingMinutes,
  formatMinutes,
  formatWordCount,
} from "../lib/word-count.js";

describe("countWords", () => {
  it("returns zero for empty and non-string input", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   \n\t ")).toBe(0);
    expect(countWords(null)).toBe(0);
    expect(countWords(42)).toBe(0);
  });

  it("counts words separated by any whitespace", () => {
    expect(countWords("Hello world")).toBe(2);
    expect(countWords("one\ntwo\tthree")).toBe(3);
  });

  it("ignores punctuation-only tokens and supports unicode letters", () => {
    expect(countWords("Hello, world! Café 123 —")).toBe(4);
    expect(countWords("こんにちは 世界")).toBe(2);
  });
});

describe("estimateReadingMinutes", () => {
  it("uses a default speed of 200 words per minute", () => {
    expect(estimateReadingMinutes(200)).toBe(1);
    expect(estimateReadingMinutes(400)).toBe(2);
    expect(estimateReadingMinutes(100)).toBe(0.5);
  });

  it("rounds to two decimal places", () => {
    expect(estimateReadingMinutes(50)).toBe(0.25);
    expect(estimateReadingMinutes(1)).toBe(0.01);
  });

  it("handles invalid values safely", () => {
    expect(estimateReadingMinutes(0)).toBe(0);
    expect(estimateReadingMinutes(-10)).toBe(0);
    expect(estimateReadingMinutes("nope")).toBe(0);
    expect(estimateReadingMinutes(200, 0)).toBe(1);
  });
});

describe("formatMinutes", () => {
  it("formats short and long durations", () => {
    expect(formatMinutes(0)).toBe("0 min");
    expect(formatMinutes(0.4)).toBe("<1 min");
    expect(formatMinutes(12.4)).toBe("12 min");
    expect(formatMinutes(60)).toBe("1 hr");
    expect(formatMinutes(75)).toBe("1 hr 15 min");
  });

  it("handles invalid values", () => {
    expect(formatMinutes(undefined)).toBe("0 min");
    expect(formatMinutes("nope")).toBe("0 min");
    expect(formatMinutes(-4)).toBe("0 min");
  });
});

describe("formatWordCount", () => {
  it("adds thousands separators", () => {
    expect(formatWordCount(1234)).toBe("1,234");
    expect(formatWordCount(0)).toBe("0");
    expect(formatWordCount(undefined)).toBe("0");
  });
});
