// Brew-session actions. Three small factories keep each command surface under
// the shape ceilings; the store composes them.

import { reportError } from "../observability.js";
import { cell, nowLocal, secondsFromLocal } from "./brewSessionModel.js";
import { correctObservation } from "./observationCorrections.js";

function setError(store, scope, err) {
  store.error = err?.message ?? String(err);
  reportError(scope, err);
}

function checklistTable(bundle) {
  const table = bundle?.formatted_tables?.["batch.brew_checklist"];
  return Array.isArray(table) ? table : [];
}

function selectedLevel(bundle, fallback) {
  return bundle?.state?.valuation?.["batch.checklist_level"] ?? fallback;
}

async function planSnapshot(loadBundle, batchId, batchName, level) {
  const loaded = await loadBundle(batchId, batchName);
  const bundle = loaded?.bundle;
  const table = checklistTable(bundle);
  if (table.length === 0) {
    throw new Error(
      "This frozen recipe predates the generated checklist. Fork it and re-freeze."
    );
  }
  const selected = selectedLevel(bundle, level);
  return {
    batch_id: batchId,
    level: selected,
    plan_snapshot: {
      level: selected,
      table,
      artifact_hash: bundle?.artifact?.hash ?? "",
      batch_name: batchName,
    },
  };
}

export function createSessionLifecycleActions({ client, loadBundle }) {
  return {
    async openFor(batch) {
      this.open = true;
      this.loading = true;
      this.error = null;
      this.batchId = batch.id;
      this.batchName = batch.name ?? "";
      this.session = null;
      this.sessions = [];
      this.observationDrafts = {};
      try {
        this.sessions = (await client.listSessions(batch.id)) ?? [];
        this.session = this.sessions[0] ?? null;
        if (this.session) this.level = this.session.level;
      } catch (err) {
        setError(this, "brewSession.openFor", err);
      } finally {
        this.loading = false;
      }
    },

    async selectSession(sessionId) {
      this.loading = true;
      this.error = null;
      try {
        this.session = await client.getSession(sessionId);
        this.level = this.session.level;
      } catch (err) {
        setError(this, "brewSession.select", err);
      } finally {
        this.loading = false;
      }
    },

    async startSession() {
      this.loading = true;
      this.error = null;
      try {
        const payload = await planSnapshot(
          (id, name) => loadBundle(id, name),
          this.batchId,
          this.batchName,
          this.level
        );
        payload.started_at = secondsFromLocal(this.startedAt);
        this.session = await client.createSession(payload);
        this.level = this.session.level;
        this.sessions = [this.session, ...this.sessions];
      } catch (err) {
        setError(this, "brewSession.start", err);
      } finally {
        this.loading = false;
      }
    },

    close() {
      this.open = false;
      this.session = null;
      this.sessions = [];
      this.batchId = null;
      this.batchName = "";
      this.observationDrafts = {};
      this.error = null;
    },
  };
}

export function createReportActions({ client, openReport }) {
  return {
    async openReport() {
      if (!this.session) return;
      try {
        await openReport(this.session.id);
      } catch (err) {
        setError(this, "brewSession.openReport", err);
      }
    },

    async refresh() {
      if (!this.session) return;
      try {
        this.session = await client.getSession(this.session.id);
      } catch (err) {
        setError(this, "brewSession.refresh", err);
      }
    },
  };
}

export function createStepActions({ client }) {
  return {
    stepState(row) {
      return this.session?.steps?.[row.step_id?.text] ?? {};
    },

    stepNote(row) {
      return this.stepState(row).note ?? "";
    },

    isStepDone(row) {
      return Boolean(this.stepState(row).done);
    },

    isStepSkipped(row) {
      return Boolean(this.stepState(row).skipped);
    },

    async setStep(row, patch) {
      if (!this.session || this.sealed) return;
      const stepId = row.step_id?.text;
      if (!stepId) return;
      const steps = {
        ...(this.session.steps ?? {}),
        [stepId]: { ...this.stepState(row), ...patch },
      };
      this.session = { ...this.session, steps };
      try {
        this.session = await client.patchSession(this.session.id, { steps });
      } catch (err) {
        setError(this, "brewSession.setStep", err);
      }
    },

    async setStatus(status) {
      if (!this.session || this.sealed) return;
      try {
        this.session = await client.patchSession(this.session.id, { status });
      } catch (err) {
        setError(this, "brewSession.setStatus", err);
      }
    },
  };
}

function observationPayload(row, draft) {
  const raw = Number(draft.raw);
  if (!Number.isFinite(raw)) return null;
  const rawUnit = draft.rawUnit || cell(row, "unit") || "—";
  const kind = cell(row, "correction") || "none";
  const computed = correctObservation({
    kind,
    raw,
    rawUnit,
    sampleTempC: Number(draft.sampleTempC),
    brix: Number(draft.brix),
    originalBrix: Number(draft.originalBrix),
  });
  const manual = Number(draft.corrected);
  const corrected = Number.isFinite(manual)
    ? { value: manual, unit: rawUnit }
    : computed;
  return {
    metric_id: cell(row, "metric_id"),
    step_id: cell(row, "step_id") || null,
    at: secondsFromLocal(draft.at),
    source: draft.source || "live",
    method: draft.method || "manual",
    raw: { value: raw, unit: rawUnit },
    corrected,
    correction:
      computed && kind !== "none"
        ? {
            kind,
            version: "v1",
            inputs: {
              sample_temp_c: Number(draft.sampleTempC),
              brix: Number(draft.brix),
              original_brix: Number(draft.originalBrix),
            },
          }
        : null,
    note: draft.note || "",
  };
}

const EMPTY_DRAFT = Object.freeze({
  raw: "",
  corrected: "",
  method: "",
  rawUnit: "",
  sampleTempC: "",
  brix: "",
  originalBrix: "",
  at: "",
  source: "live",
  note: "",
});

function initialDraft(row) {
  return {
    raw: "",
    corrected: "",
    method: cell(row, "method") || "manual",
    rawUnit: cell(row, "unit") || "—",
    sampleTempC: "",
    brix: "",
    originalBrix: "",
    at: nowLocal(),
    source: "live",
    note: "",
  };
}

export function createObservationActions({ client }) {
  return {
    observationsFor(metricId) {
      return (this.session?.observations ?? []).filter(
        (observation) => observation.metric_id === metricId && !observation.void
      );
    },

    latestObservation(metricId) {
      return this.observationsFor(metricId).at(-1) ?? null;
    },

    draftFor(row) {
      const metricId = cell(row, "metric_id");
      if (!metricId) return EMPTY_DRAFT;
      return this.observationDrafts[metricId] ?? EMPTY_DRAFT;
    },

    createDraft(row) {
      const metricId = cell(row, "metric_id");
      if (!metricId) return EMPTY_DRAFT;
      if (!this.observationDrafts[metricId]) {
        this.observationDrafts[metricId] = initialDraft(row);
      }
      return this.observationDrafts[metricId];
    },

    setDraft(metricId, field, value) {
      const draft = this.observationDrafts[metricId] ?? {};
      this.observationDrafts[metricId] = { ...draft, [field]: value };
    },

    async addReading(row) {
      if (!this.session || this.sealed) return;
      const draft = this.createDraft(row);
      const payload = observationPayload(row, draft);
      if (!payload) {
        this.error = "Enter a numeric reading first.";
        return;
      }
      try {
        this.session = await client.addObservation(this.session.id, payload);
        this.observationDrafts[payload.metric_id] = {
          ...draft,
          raw: "",
          corrected: "",
          note: "",
        };
        this.error = null;
      } catch (err) {
        setError(this, "brewSession.addReading", err);
      }
    },

    async voidObservation(observation) {
      if (!this.session || this.sealed) return;
      try {
        this.session = await client.patchObservation(this.session.id, observation.id, {
          void: true,
        });
      } catch (err) {
        setError(this, "brewSession.voidObservation", err);
      }
    },

    async finalize() {
      if (!this.session || this.sealed) return;
      try {
        this.session = await client.finalizeSession(this.session.id);
      } catch (err) {
        setError(this, "brewSession.finalize", err);
      }
    },
  };
}
