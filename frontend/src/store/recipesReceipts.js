// Receipt-aware batch actions: a permanent delete also clears the import receipt
// that points at the batch, and the landing list needs to name that batch.

export function receiptActions({ persistence, refreshImports = null, observability }) {
  return {
    batchLabel(batchId) {
      const batch = this.batches.find((candidate) => candidate.id === batchId);
      if (!batch) return "Batch missing";
      return `${batch.name} · ${batch.trashed ? "trashed" : batch.status}`;
    },

    hasBatch(batchId) {
      return this.batches.some((candidate) => candidate.id === batchId);
    },

    async openBatchById(batchId) {
      try {
        await this.openDraft(batchId);
      } catch (err) {
        observability.reportError("recipes.openBatchById", err);
        this.actionError = {
          title: "Couldn't open the imported batch",
          message: err?.message ?? String(err),
        };
      }
    },

    async deleteRow(batch) {
      this.closeRowMenu();
      try {
        await persistence.deletePermanent(batch.id);
        await this.refresh();
        await refreshImports?.();
      } catch (err) {
        observability.reportError("recipes.delete", err);
      }
    },

    async deletePermanent(id) {
      await persistence.deletePermanent(id);
      await this.refresh();
      await refreshImports?.();
    },
  };
}
