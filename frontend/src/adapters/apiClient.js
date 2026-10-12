// JSON seam client: browser → FastAPI. Pure helpers, no engine deps.

export class SolverError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "SolverError";
    this.code = code;
    this.details = details;
  }
}

const ENV = import.meta.env || {};
export const DEFAULT_BASE = ENV.VITE_API_BASE || "";

// Bearer token provider, injected by the browser entry (see main.js). Defaults
// to null so the client is node-testable without a Firebase context.
let tokenProvider = () => Promise.resolve(null);

export function setTokenProvider(provider) {
  tokenProvider = provider;
}

export async function postJSON(path, body, { base = DEFAULT_BASE, fetchImpl } = {}) {
  const doFetch = fetchImpl || fetch;
  const headers = { "Content-Type": "application/json" };
  const token = await tokenProvider();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await doFetch(`${base}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let payload = {};
    try {
      payload = await res.json();
    } catch {
      /* non-JSON error body */
    }
    throw new SolverError(
      payload.code ?? "HTTP_ERROR",
      payload.message ?? `HTTP ${res.status}`,
      payload.details ?? {}
    );
  }
  return res.json();
}

// Deep-flatten a nested response object into the artifact's dotted output keys:
// { cascade: { v_strike: 14 } } -> { "cascade.v_strike": 14 }. Arrays/scalars are
// leaves (the artifact excludes advisory lists).
export function flattenResponse(obj, prefix = "", out = {}) {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
    if (prefix) out[prefix] = obj;
    return out;
  }
  for (const [key, value] of Object.entries(obj)) {
    const dotted = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      flattenResponse(value, dotted, out);
    } else {
      out[dotted] = value;
    }
  }
  return out;
}
