// Import seam: the browser's view of `/imports`. Thin by design — the server
// owns every rule (dedupe, transitions, the committed guard), so this module
// only names the calls and forwards the envelopes.
export function createImportClient({ api }) {
  return {
    list: () => api.requestJSON("/imports"),
    get: (importId) => api.requestJSON(`/imports/${importId}`),
    create: (body) => api.requestJSON("/imports", { method: "POST", body }),
    patch: (importId, body) =>
      api.requestJSON(`/imports/${importId}`, { method: "PATCH", body }),
    remove: (importId) => api.requestJSON(`/imports/${importId}`, { method: "DELETE" }),
    match: (body) => api.requestJSON("/imports/match", { method: "POST", body }),
    gapfill: (body) => api.requestJSON("/imports/gapfill", { method: "POST", body }),
  };
}

// A document is uploaded as JSON, so the browser has to hand over base64. Kept
// as an injected seam so the store is testable without a FileReader.
export function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("could not read the file"));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma === -1 ? result : result.slice(comma + 1));
    };
    reader.readAsDataURL(file);
  });
}
