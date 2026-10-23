import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, createApiClient } from "../lib/api.js";

function jsonResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: vi.fn(async () => JSON.stringify(data)),
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("API client", () => {
  it("posts a reading session as JSON", async () => {
    const entry = {
      title: "Example",
      url: "https://example.com/article",
      word_count: 200,
      minutes: 1,
    };
    const fetchImpl = vi.fn(async () => jsonResponse({ id: 1 }, 201));
    const client = createApiClient({
      baseUrl: "http://127.0.0.1:5000/",
      fetchImpl,
    });

    await expect(client.logReading(entry)).resolves.toEqual({ id: 1 });

    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:5000/history");
    expect(options.method).toBe("POST");
    expect(options.headers).toEqual({
      Accept: "application/json",
      "Content-Type": "application/json",
    });
    expect(options.body).toBe(JSON.stringify(entry));
  });

  it("loads today stats and clears history", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ pages: 2, minutes: 4, words: 800 }))
      .mockResolvedValueOnce(jsonResponse({ deleted: 2 }));
    const client = createApiClient({
      baseUrl: "http://127.0.0.1:5000",
      fetchImpl,
    });

    await expect(client.getTodayStats()).resolves.toEqual({
      pages: 2,
      minutes: 4,
      words: 800,
    });
    await expect(client.clearHistory()).resolves.toEqual({ deleted: 2 });

    expect(fetchImpl.mock.calls[0][0]).toBe("http://127.0.0.1:5000/stats/today");
    expect(fetchImpl.mock.calls[0][1].method).toBe("GET");
    expect(fetchImpl.mock.calls[1][0]).toBe("http://127.0.0.1:5000/history");
    expect(fetchImpl.mock.calls[1][1].method).toBe("DELETE");
  });

  it("surfaces API validation details", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ detail: [{ msg: "url must be http or https" }] }, 422),
    );
    const client = createApiClient({
      baseUrl: "http://127.0.0.1:5000",
      fetchImpl,
    });

    await expect(client.logReading({})).rejects.toMatchObject({
      name: "ApiError",
      status: 422,
      message: "url must be http or https",
    });
  });

  it("turns network failures into a helpful error", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const client = createApiClient({
      baseUrl: "http://127.0.0.1:5000",
      fetchImpl,
    });

    const error = await client.health().catch((caught) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.message).toContain("not running");
  });
});
