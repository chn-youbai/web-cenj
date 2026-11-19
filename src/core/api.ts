/**
 * 前端统一 Fetch 封装：超时控制、JSON 解析、错误提取
 */

export class ApiRequestError extends Error {
  readonly status: number;
  readonly payload?: unknown;

  constructor(message: string, status: number, payload?: unknown) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.payload = payload;
  }
}

export interface RequestJsonOptions extends RequestInit {
  timeoutMs?: number;
}

export async function requestJson<T>(url: string, options: RequestJsonOptions = {}): Promise<T> {
  const { timeoutMs = 15000, headers, ...rest } = options;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(url, {
      ...rest,
      headers,
      signal: rest.signal ?? controller.signal,
    });

    const text = await resp.text();
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }

    if (!resp.ok) {
      const msg =
        parsed &&
        typeof parsed === "object" &&
        "message" in parsed &&
        typeof parsed.message === "string"
          ? parsed.message
          : parsed &&
              typeof parsed === "object" &&
              "error" in parsed &&
              typeof parsed.error === "string"
            ? parsed.error
            : `HTTP ${resp.status}`;
      throw new ApiRequestError(msg, resp.status, parsed);
    }

    return parsed as T;
  } finally {
    window.clearTimeout(timer);
  }
}

export function postJson<T>(
  url: string,
  body: unknown,
  extraOptions: RequestJsonOptions = {},
): Promise<T> {
  return requestJson<T>(url, {
    method: "POST",
    ...extraOptions,
    headers: {
      "Content-Type": "application/json",
      ...extraOptions.headers,
    },
    body: JSON.stringify(body),
  });
}
