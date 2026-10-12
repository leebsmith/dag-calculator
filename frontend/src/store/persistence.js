// Draft autosave: debounced PUT of the editable state (roots + collections +
// overlays) to the backend. F-b keeps a single implicit active draft; the
// recipe list / New / Open surface replaces this in F-d.

import { createBatch, freezeBatch, listBatches, updateDraft } from "../adapters/batchClient.js";

let activeId = null;
let saveTimer = null;

export function getActiveId() {
  return activeId;
}

// Resolve the active draft id, creating one on first use.
export async function ensureDraft(name = "Untitled") {
  if (activeId) return activeId;
  const drafts = await listBatches();
  if (drafts.length > 0) {
    activeId = drafts[0].id;
  } else {
    const created = await createBatch({ name });
    activeId = created.id;
  }
  return activeId;
}

export function queueSave(getState, { delay = 400 } = {}) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      const id = await ensureDraft();
      await updateDraft(id, { name: "Untitled", ...getState() });
    } catch (err) {
      console.error("autosave failed", err);
    }
  }, delay);
}

// Freeze the active draft into an immutable snapshot (valuation + provenance).
export async function freezeActiveDraft(getState) {
  const id = await ensureDraft();
  return freezeBatch(id, getState());
}
