import { API_BASE_URL } from "./constants.js";

export class ApiError extends Error {
  constructor(message, { status = 0, data = null, cause } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
    if (cause !== undefined) this.cause = cause;
  }
}

function errorDetail(data, status) {
  const detail = data?.detail;

  if (typeof detail === "string" && detail.trim()) {
    return detail;
  }

  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0];
    if (typeof first?.msg === "string" && first.msg.trim()) {
      return first.msg;
    }
  }

  if (typeof data?.error === "string" && data.error.trim()) {
    return data.error;
  }

  return `Local API request failed (HTTP ${status}).`;
}

function networkMessage(error) {
  if (error?.name === "AbortError") {
    return "The local API did not respond in time.";
  }
  return "The local API is not running. Start it on port 5000.";
}

export function createApiClient({
  baseUrl = API_BASE_URL,
  fetchImpl = globalThis.fetch,
  timeoutMs = 6000,
} = {}) {
  const root = String(baseUrl).replace(/\/+$/, "");
  const doFetch =
    typeof fetchImpl === "function"
      ? fetchImpl.bind(globalThis)
      : globalThis.fetch.bind(globalThis);

  async function request(path, { method = "GET", body } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const headers = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";

    let response;
    try {
      response = await doFetch(`${root}${path}`, {
        method,
        headers,
        body,
        signal: controller.signal,
        cache: "no-store",
        credentials: "omit",
      });
    } catch (error) {
      throw new ApiError(networkMessage(error), { cause: error });
    } finally {
      clearTimeout(timer);
    }

    const text = await response.text();
    let data = null;

    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    if (!response.ok) {
      throw new ApiError(errorDetail(data, response.status), {
        status: response.status,
        data,
      });
    }

    return data;
  }

  return {
    health() {
      return request("/health");
    },
    logReading(entry) {
      return request("/history", {
        method: "POST",
        body: JSON.stringify(entry),
      });
    },
    getTodayStats() {
      return request("/stats/today");
    },
    clearHistory() {
      return request("/history", { method: "DELETE" });
    },
  };
}

export const api = createApiClient();
