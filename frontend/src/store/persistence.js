// Batch manager: the browser-side persistence seam. Each manager owns its own
// active batch, autosave timer, conflict state, and observer. The client and
// timers are injected; `app` may be an instance or a handle getter.

import { DRAFT_SCHEMA_VERSION } from "./snapshot.js";
import {
  initialPersistenceState,
  reducePersistenceState,
} from "./persistenceStateMachine.js";

export class UnsupportedBatchError extends Error {
  constructor(message) {
    super(message);
    this.name = "UnsupportedBatchError";
  }
}

function assertSupported(record) {
  if (!record.identity || !record.identity.equipment || !record.identity.style) {
    throw new UnsupportedBatchError(
      "This batch predates the identity model and cannot be opened. Create a new batch."
    );
  }
  if (record.schema_version !== undefined && record.schema_version !== DRAFT_SCHEMA_VERSION) {
    throw new UnsupportedBatchError(
      `This batch was saved with payload schema ${record.schema_version}; this build reads ${DRAFT_SCHEMA_VERSION}.`
    );
  }
}

function loadStatePayload(record) {
  return {
    ...(record.identity ? { identity: record.identity } : {}),
    hop_strategy: record.hop_strategy ?? "",
    roots: record.roots,
    collections: record.collections,
    selections: record.selections,
  };
}

export function createPersistenceManager({
  client = null,
  app = null,
  setTimeout: schedule = globalThis.setTimeout,
  clearTimeout: cancel = globalThis.clearTimeout,
  retryDelays = [1000, 2000, 4000],
} = {}) {
  let active = null; // { id, name, status, trashed, persisted, updated_at }
  let saveTimer = null;
  let onStateChange = null;
  let state = initialPersistenceState(retryDelays);

  const currentApp = () => (typeof app === "function" ? app() : app);

  function dispatch(action) {
    const previous = state;
    const next = reducePersistenceState(state, action);
    state = next.state;
    if (
      previous.saveState !== state.saveState ||
      previous.conflictRemote !== state.conflictRemote
    ) {
      onStateChange?.({ state: state.saveState, conflictRemote: state.conflictRemote });
    }
    return next.effects;
  }

  function batchSeam() {
    if (!client) {
      throw new Error(
        "persistence: no batch client injected; construct the manager with a client"
      );
    }
    return client;
  }
  function setStateObserver(fn) {
    onStateChange = fn;
  }
  function getSaveState() {
    return state.saveState;
  }

  function getConflictRemote() {
    return state.conflictRemote;
  }

  function getActive() {
    return active;
  }

  function clearActive() {
    if (saveTimer) {
      cancel(saveTimer);
      saveTimer = null;
    }
    active = null;
    dispatch({ type: "RESET" });
    currentApp()?.setReadOnly?.(false);
  }

  function canSave() {
    return Boolean(active) && active.status === "draft" && !active.readOnly;
  }

  function list() {
    return batchSeam().listBatches();
  }

  async function createWithIdentity({ name, identity, state: draftState = null }) {
    active = {
      id: crypto.randomUUID(),
      name: name || "Untitled batch",
      status: "draft",
      trashed: false,
      persisted: false,
      updated_at: null,
      readOnly: false,
    };
    dispatch({ type: "RESET" });
    currentApp()?.setReadOnly?.(false);
    await currentApp()?.loadState({
      identity,
      roots: draftState?.roots ?? {},
      collections: draftState?.collections ?? {},
      selections: draftState?.selections ?? {},
    });
    dispatch({ type: "EDIT" });
    await saveNow();
    return active;
  }

  async function createUnsavedDraft({ name = "Untitled batch" } = {}) {
    active = {
      id: crypto.randomUUID(),
      name,
      status: "draft",
      trashed: false,
      persisted: false,
      updated_at: null,
      readOnly: false,
    };
    dispatch({ type: "RESET" });
    currentApp()?.setReadOnly?.(false);
    await currentApp()?.loadState({ roots: {}, collections: {}, selections: {} });
    return active;
  }

  async function open(batchId, { readOnly = false } = {}) {
    const b = await batchSeam().getBatch(batchId);
    assertSupported(b);
    active = {
      id: b.id,
      name: b.name,
      status: b.status,
      trashed: b.trashed ?? false,
      persisted: true,
      updated_at: b.updated_at,
      readOnly: !!readOnly,
    };
    dispatch({ type: "RESET" });
    currentApp()?.setReadOnly?.(false);
    await currentApp()?.loadState(loadStatePayload(b));
    currentApp()?.setReadOnly?.(active.readOnly);
    return b;
  }

  async function renameActive(name) {
    if (!canSave()) return;
    active = { ...active, name };
    await saveNow();
  }

  async function fork(frozenId) {
    const frozen = await batchSeam().getBatch(frozenId);
    assertSupported(frozen);
    const created = await batchSeam().upsertBatch(crypto.randomUUID(), {
      name: `${frozen.name} (copy)`,
      hop_strategy: frozen.hop_strategy ?? "",
      parent_batch_id: frozen.id,
      parent_name: frozen.name,
      identity: frozen.identity,
      roots: frozen.roots,
      collections: frozen.collections,
      selections: frozen.selections ?? {},
      schema_version: frozen.schema_version ?? 3,
    });
    active = {
      id: created.id,
      name: created.name,
      status: created.status,
      trashed: false,
      persisted: true,
      updated_at: created.updated_at,
      readOnly: false,
    };
    dispatch({ type: "RESET" });
    currentApp()?.setReadOnly?.(false);
    await currentApp()?.loadState(loadStatePayload(created));
    return created;
  }

  async function reportBundleForActive() {
    if (!active) return null;
    const stepApp = currentApp();
    if (stepApp.boundaryPending) {
      throw new Error("Cannot build a report bundle while a boundary solve is pending");
    }
    const bundle =
      active.status === "frozen"
        ? await batchSeam().getReportBundle(active.id)
        : await batchSeam().previewReportBundle(active.id, {
            ...stepApp.freezePayload(),
            report_inputs: stepApp.reportInputs(),
            catalog: stepApp.reportCatalog(),
            formatted: stepApp.reportFormatted(),
            formatted_tables: stepApp.reportFormattedTables(),
            formatted_summaries: stepApp.reportFormattedSummaries(),
          });
    return { name: active.name, bundle };
  }

  async function reportBundleFor(id, name) {
    return { name, bundle: await batchSeam().getReportBundle(id) };
  }

  async function reportSections() {
    return (await batchSeam().getReportSections()).sections;
  }

  async function reportFor(id, params) {
    return batchSeam().getReport(id, params);
  }

  async function reportForActive(params) {
    if (!active) return null;
    if (active.status === "frozen") return batchSeam().getReport(active.id, params);
    const file = await reportBundleForActive();
    if (!file) return null;
    return batchSeam().postReport(active.id, file.bundle, params);
  }

  async function freezeActive() {
    if (!canSave()) return;
    const stepApp = currentApp();
    if (stepApp.boundaryPending) {
      throw new Error("Cannot freeze while a boundary solve is pending");
    }
    if (stepApp.boundaryError) {
      const detail =
        stepApp.boundaryError.message ?? stepApp.boundaryError.code ?? String(stepApp.boundaryError);
      throw new Error(`Cannot freeze: the boundary solve failed (${detail})`);
    }
    const blocking = (stepApp.findings ?? []).find((finding) => finding.severity === "error");
    if (blocking) {
      throw new Error(`Cannot freeze: ${blocking.label} — ${blocking.message}`);
    }
    await batchSeam().freezeBatch(active.id, {
      ...stepApp.freezePayload(),
      report_inputs: stepApp.reportInputs(),
      catalog: stepApp.reportCatalog(),
      formatted: stepApp.reportFormatted(),
      formatted_tables: stepApp.reportFormattedTables(),
      formatted_summaries: stepApp.reportFormattedSummaries(),
    });
  }

  function scheduleTimer(delay) {
    if (saveTimer) cancel(saveTimer);
    saveTimer = schedule(async () => {
      saveTimer = null;
      try {
        await runEffects(dispatch({ type: "TIMER_FIRED" }));
      } catch (err) {
        console.error("autosave failed", err);
      }
    }, delay);
  }

  async function runEffects(effects, force = false) {
    for (const effect of effects) {
      if (effect.type === "SCHEDULE_SAVE") scheduleTimer(effect.delay);
      else if (effect.type === "SAVE") await performSave(force);
    }
  }

  function queueSave({ delay = 400 } = {}) {
    if (!canSave()) return;
    runEffects(dispatch({ type: "EDIT", delay })).catch((err) =>
      console.error("autosave failed", err)
    );
  }

  async function flushSave() {
    if (saveTimer) {
      cancel(saveTimer);
      saveTimer = null;
    }
    if (state.dirty) await saveNow();
  }

  async function trashActive() {
    if (!active || active.readOnly) return;
    if (!active.persisted && !state.dirty) {
      clearActive();
      return;
    }
    await saveNow();
    await batchSeam().setTrashed(active.id, true);
    clearActive();
  }

  function restore(batchId) {
    return batchSeam().setTrashed(batchId, false);
  }

  async function trashBatch(batchId) {
    const record = await batchSeam().setTrashed(batchId, true);
    if (active?.id === batchId) clearActive();
    return record;
  }

  async function renameBatch(batchId, name) {
    const record = await batchSeam().renameBatch(batchId, name);
    if (active?.id === batchId) active = { ...active, name: record.name };
    return record;
  }

  function deletePermanent(batchId) {
    return batchSeam().deleteBatch(batchId);
  }

  async function performSave(force = false) {
    if (!canSave()) return;
    let lastError;
    for (;;) {
      const payload = { name: active.name, ...currentApp().draftState() };
      try {
        const seam = batchSeam();
        const put = typeof seam.put === "function" ? seam.put : seam.upsertBatch;
        const updated = await put(
          active.id,
          payload,
          active.updated_at ?? undefined,
          force
        );
        active = { ...active, persisted: true, updated_at: updated.updated_at };
        dispatch({ type: "SAVE_SUCCESS" });
        return;
      } catch (err) {
        if (err?.code === "CONFLICT") {
          dispatch({ type: "CONFLICT", remote: err.details?.current ?? null });
          return;
        }
        lastError = err;
        const effects = dispatch({ type: "SAVE_FAILURE" });
        const retry = effects.find((effect) => effect.type === "RETRY");
        if (!retry) throw lastError;
        await new Promise((resolve) => schedule(resolve, retry.delay));
      }
    }
  }

  async function saveNow({ force = false } = {}) {
    if (!canSave()) return;
    await runEffects(dispatch({ type: "SAVE_REQUESTED" }), force);
  }

  async function resolveConflictByReload() {
    const remote = state.conflictRemote;
    if (!remote) return;
    active = {
      id: remote.id,
      name: remote.name,
      status: remote.status,
      trashed: remote.trashed ?? false,
      persisted: true,
      updated_at: remote.updated_at,
    };
    dispatch({ type: "RESET" });
    await currentApp()?.loadState(loadStatePayload(remote));
  }

  return {
    setStateObserver,
    setRetryDelays(delays) {
      state = reducePersistenceState(state, { type: "SET_RETRY_DELAYS", delays }).state;
    },
    getSaveState,
    getConflictRemote,
    getActive,
    clearActive,
    list,
    createWithIdentity,
    createUnsavedDraft,
    open,
    renameActive,
    fork,
    reportBundleForActive,
    reportBundleFor,
    reportSections,
    reportFor,
    reportForActive,
    freezeActive,
    queueSave,
    flushSave,
    trashActive,
    restore,
    trashBatch,
    renameBatch,
    deletePermanent,
    saveNow,
    resolveConflictByReload,
  };
}
