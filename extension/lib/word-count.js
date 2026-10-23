import { WORDS_PER_MINUTE } from "./constants.js";

const WORD_PATTERN = /[\p{L}\p{N}]/u;
const numberFormatter = new Intl.NumberFormat();

/**
 * Count tokens that contain at least one letter or number. This avoids
 * counting punctuation-only "words" while still supporting non-Latin text.
 */
export function countWords(value) {
  if (typeof value !== "string") return 0;

  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return 0;

  let count = 0;
  for (const token of normalized.split(" ")) {
    if (WORD_PATTERN.test(token)) count += 1;
  }
  return count;
}

/**
 * Keep the raw fractional value for stats totals. The popup decides how to
 * display it, so short reads can show "<1 min" instead of rounding up.
 */
export function estimateReadingMinutes(wordCount, wordsPerMinute = WORDS_PER_MINUTE) {
  const count = Number(wordCount);
  const rate = Number(wordsPerMinute);

  if (!Number.isFinite(count) || count <= 0) return 0;

  const safeRate = Number.isFinite(rate) && rate > 0 ? rate : WORDS_PER_MINUTE;
  return Math.round((count / safeRate) * 100) / 100;
}

export function formatMinutes(minutes) {
  const value = Number(minutes);
  if (!Number.isFinite(value) || value <= 0) return "0 min";

  const rounded = Math.round(value);
  if (rounded === 0) return "<1 min";
  if (rounded < 60) return `${rounded} min`;

  const hours = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return remainder === 0 ? `${hours} hr` : `${hours} hr ${remainder} min`;
}

export function formatWordCount(value) {
  const count = Number(value);
  return Number.isFinite(count) && count > 0 ? numberFormatter.format(count) : "0";
}
