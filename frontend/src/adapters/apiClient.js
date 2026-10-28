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

// FastAPI request-validation errors arrive as a `detail` array; turn them into a
// readable message instead of an opaque "HTTP 422". Raised HTTPExceptions arrive
// as a plain string `detail` and carry the server's own explanation (for example
// a rejected report bundle or a refused report selection).
async function responseError(res) {
  let payload = {};
  try {
    payload = await res.json();
  } catch {
    /* non-JSON error body */
  }
  const validation = Array.isArray(payload.detail)
    ? payload.detail
        .map((d) => {
          const where = (d.loc ?? []).filter((p) => p !== "body").join(".");
          return where ? `${where}: ${d.msg}` : d.msg;
        })
        .join("; ")
    : null;
  const detail = typeof payload.detail === "string" ? payload.detail : null;
  return new SolverError(
    payload.code ?? ((validation || res.status === 422) ? "VALIDATION" : "HTTP_ERROR"),
    payload.message ?? validation ?? detail ?? `HTTP ${res.status}`,
    payload.details ?? {}
  );
}

export async function requestJSON(
  path,
  { method = "GET", body, base = DEFAULT_BASE, fetchImpl } = {}
) {
  const doFetch = fetchImpl || fetch;
  const headers = { "Content-Type": "application/json" };
  const token = await tokenProvider();
  if (token) headers.Authorization = `Bearer ${token}`;
  const init = { method, headers };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await doFetch(`${base}${path}`, init);
  if (res.status === 204) return null;
  if (!res.ok) throw await responseError(res);
  return res.json();
}

// Binary download seam (the rendered report): the error mapping is the same, and
// the resolved-selection headers ride along so a caller can report them.
export async function requestBlob(
  path,
  { method = "GET", body, base = DEFAULT_BASE, fetchImpl } = {}
) {
  const doFetch = fetchImpl || fetch;
  const headers = {};
  const token = await tokenProvider();
  if (token) headers.Authorization = `Bearer ${token}`;
  const init = { method, headers };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const res = await doFetch(`${base}${path}`, init);
  if (!res.ok) throw await responseError(res);
  const blob = await res.blob();
  const header = (name) => res.headers?.get?.(name) ?? null;
  return {
    blob,
    type: header("Content-Type") ?? blob.type ?? "",
    sections: header("X-Report-Sections") ?? "",
    pages: Number(header("X-Report-Pages") ?? 0),
    etag: header("ETag"),
  };
}

export function postJSON(path, body, options = {}) {
  return requestJSON(path, { ...options, method: "POST", body });
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
