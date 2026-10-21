// Catalog-record client over the JSON seam. Browser-only.

import { requestJSON } from "./apiClient.js";

export function listCatalog(kind) {
  return requestJSON(`/catalog/${kind}`);
}

export function createCatalog(kind, component) {
  return requestJSON(`/catalog/${kind}`, { method: "POST", body: { component } });
}

export function deleteCatalog(kind, itemId) {
  return requestJSON(`/catalog/${kind}/${encodeURIComponent(itemId)}`, { method: "DELETE" });
}
