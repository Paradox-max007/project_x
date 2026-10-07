"use client";

/**
 * Tiny fetch wrapper used by all frontend views.
 * - JSON by default
 * - credentials included (session cookie)
 * - throws Error(message) on non-2xx with server-provided { error } payload
 */

export async function api<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const isFormData =
    typeof FormData !== "undefined" && options.body instanceof FormData;

  const res = await fetch(path, {
    ...options,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(options.headers || {}),
    },
    credentials: "same-origin",
  });

  let payload: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!res.ok) {
    const message =
      (payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error: unknown }).error)
        : null) ||
      (typeof payload === "string" && payload ? payload : null) ||
      `Request failed (${res.status})`;
    throw new Error(message);
  }

  return payload as T;
}

export const apiGet = <T = unknown>(path: string) => api<T>(path);
export const apiPost = <T = unknown>(path: string, body?: unknown) =>
  api<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
export const apiPatch = <T = unknown>(path: string, body?: unknown) =>
  api<T>(path, { method: "PATCH", body: body === undefined ? undefined : JSON.stringify(body) });
export const apiPut = <T = unknown>(path: string, body?: unknown) =>
  api<T>(path, { method: "PUT", body: body === undefined ? undefined : JSON.stringify(body) });
export const apiDelete = <T = unknown>(path: string) =>
  api<T>(path, { method: "DELETE" });
