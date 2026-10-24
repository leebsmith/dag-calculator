// Batch setup: the identity triplet (style / equipment / water source) and the
// user-owned assets it is drawn from. Engine-free by design — this store only
// touches the catalog client, the seed reference cache, and persistence.
//
// Every mutation goes through `this.state` (the object Alpine observes through
// its reactive proxy). Writing a closure-captured raw object would update the
// value but never re-render. Asset option getters read `this.revision` so they
// re-evaluate after a create/delete, because the seed/reference cache is a
// plain closure object.
//
// Authoring lives in the Library surface (`adapters/libraryUi.js`); this store
// only selects from what is already there.

import { createLibrary } from "./library.js";
import * as libraryClient from "../adapters/libraryClient.js";
import { createReferenceCache } from "./referenceCache.js";
import * as persistence from "./persistence.js";

const PREREQUISITES = [
  { kind: "style", label: "styles" },
  { kind: "equipment", label: "rigs" },
  { kind: "water_report", label: "water sources" },
];

const UNKNOWN_WATER = {
  report_id: "",
  laboratory: "Unknown source",
  source_name: "Unknown source",
  calcium_ca: 0,
  magnesium_mg: 0,
  sodium_na: 0,
  sulfate_so4: 0,
  chloride_cl: 0,
  total_alkalinity_caco3: 0,
};

export function createSetupStore({ onCreated, client = libraryClient } = {}) {
  const cache = createReferenceCache();
  const library = createLibrary({
    client,
    kinds: ["style", "equipment", "water_report"],
    onChange: () => cache.syncLibraryItems(library.items()),
  });

  return {
    state: {
      modalOpen: false,
      busy: false,
      error: "",
      name: "",
      equipmentId: "",
      waterId: "",
      styleId: "",
    },
    library,
    // Bumped whenever the asset inventory changes; read by the option getters so
    // Alpine re-evaluates them (the reference cache is a plain object).
    revision: 0,

    async refreshAssets() {
      await library.refresh();
      this.revision += 1;
      return library.items();
    },

    equipmentOptions() {
      void this.revision;
      const records = cache.references.equipment ?? {};
      return Object.entries(records)
        .map(([id, record]) => ({ value: id, label: record.name ?? id }))
        .sort((a, b) => a.label.localeCompare(b.label));
    },

    waterOptions() {
      void this.revision;
      const records = {
        unknown: UNKNOWN_WATER,
        ...(cache.references.water_report ?? {}),
      };
      return Object.entries(records).map(([id, record]) => ({
        value: id,
        label: record.laboratory || record.source_name || record.report_id || id,
      }));
    },

    styleOptions() {
      void this.revision;
      return Object.entries(cache.references.style ?? {})
        .map(([id, style]) => ({ value: id, label: style.name ?? id }))
        .sort((a, b) => a.label.localeCompare(b.label));
    },

    // A batch cannot be created until one of each identity source exists.
    prerequisiteStatus() {
      void this.revision;
      const missing = PREREQUISITES.filter(
        ({ kind }) => Object.keys(cache.references[kind] ?? {}).length === 0
      ).map(({ label }) => label);
      return { ready: missing.length === 0, missing };
    },

    openModal() {
      this.state.modalOpen = true;
      this.state.error = "";
      this.state.busy = false;
      this.state.name = "";
      this.state.equipmentId = this.equipmentOptions()[0]?.value ?? "";
      this.state.waterId = "unknown";
      this.state.styleId = this.styleOptions()[0]?.value ?? "";
    },

    closeModal() {
      this.state.modalOpen = false;
    },

    canCreate() {
      const s = this.state;
      if (!s.name.trim()) return false;
      return Boolean(s.equipmentId && s.waterId && s.styleId);
    },

    identity() {
      const s = this.state;
      const equipment = this.component("equipment", s.equipmentId);
      const water = s.waterId === "unknown" ? UNKNOWN_WATER : this.component("water_report", s.waterId);
      const style = this.component("style", s.styleId);
      return {
        style: { ...style },
        equipment: { ...equipment },
        "water.source": { ...water },
      };
    },

    component(kind, itemId) {
      return cache.references[kind]?.[itemId] ?? null;
    },

    async create() {
      if (!this.canCreate() || this.state.busy) return null;
      this.state.busy = true;
      this.state.error = "";
      try {
        const active = await persistence.createWithIdentity({
          name: this.state.name.trim(),
          identity: this.identity(),
        });
        this.state.modalOpen = false;
        onCreated?.(active);
        return active;
      } catch (err) {
        this.state.error = err?.message ?? "Could not create the batch.";
        return null;
      } finally {
        this.state.busy = false;
      }
    },
  };
}
