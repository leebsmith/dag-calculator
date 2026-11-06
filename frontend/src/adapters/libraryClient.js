// Catalog-record client over the JSON seam. Browser-only.

export function createLibraryClient({ api }) {
  return {
    listCatalog(kind) {
      return api.requestJSON(`/catalog/${kind}`);
    },

    createCatalog(kind, component) {
      return api.requestJSON(`/catalog/${kind}`, { method: "POST", body: { component } });
    },

    deleteCatalog(kind, itemId) {
      return api.requestJSON(`/catalog/${kind}/${encodeURIComponent(itemId)}`, { method: "DELETE" });
    },
  };
}
