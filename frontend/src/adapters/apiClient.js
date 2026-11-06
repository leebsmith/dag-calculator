// JSON seam client: browser → FastAPI. Pure helpers, no engine deps.
//
// The client is a factory: its base URL, fetch implementation, and bearer-token
// provider are instance state, so an app (or a test) owns its own seam instead
// of sharing a module-scoped token provider. `flattenResponse` stays a pure
// helper because it holds no state.

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

async function authHeaders(tokenProvider, withJson) {
  const headers = withJson ? { "Content-Type": "application/json" } : {};
  const token = await tokenProvider();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export function createApiClient({
  base = DEFAULT_BASE,
  fetchImpl = null,
  tokenProvider = async () => null,
} = {}) {
  async function requestJSON(path, options = {}) {
    const {
      method = "GET",
      body,
      base: requestBase = base,
      fetchImpl: requestFetch = fetchImpl,
    } = options;
    const doFetch = requestFetch || fetch;
    const headers = await authHeaders(tokenProvider, true);
    const init = { method, headers };
    if (body !== undefined) init.body = JSON.stringify(body);
    const res = await doFetch(`${requestBase}${path}`, init);
    if (res.status === 204) return null;
    if (!res.ok) throw await responseError(res);
    return res.json();
  }

  // Binary download seam (the rendered report): the error mapping is the same,
  // and the resolved-selection headers ride along so a caller can report them.
  async function requestBlob(path, options = {}) {
    const {
      method = "GET",
      body,
      base: requestBase = base,
      fetchImpl: requestFetch = fetchImpl,
    } = options;
    const doFetch = requestFetch || fetch;
    const headers = await authHeaders(tokenProvider, false);
    const init = { method, headers };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    const res = await doFetch(`${requestBase}${path}`, init);
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

  function postJSON(path, body, options = {}) {
    return requestJSON(path, { ...options, method: "POST", body });
  }

  return { requestJSON, requestBlob, postJSON };
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
