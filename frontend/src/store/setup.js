// Batch setup: the identity triplet (style / equipment / water source) and the
// user-owned assets it is drawn from. Engine-free by design — this store only
// touches the catalog client, the seed reference cache, and persistence.
//
// Every mutation goes through `this.state` (the object Alpine observes through
// its reactive proxy). Writing a closure-captured raw object would update the
// value but never re-render. Asset option getters read `this.revision` so they
// re-evaluate after a create/delete, because the seed/reference cache is a
// plain closure object.

import { createLibrary } from "./library.js";
import * as libraryClient from "../adapters/libraryClient.js";
import { createReferenceCache } from "./referenceCache.js";
import * as persistence from "./persistence.js";

// Authoring form for the equipment catalog record: every numeric field the
// solvers read, with its display label and unit. Prefilled from the seed default.
const EQUIPMENT_FIELDS = [
  { field: "max_kettle_volume_l", label: "Max kettle volume", unit: "L", step: "0.1" },
  { field: "max_mash_tun_volume_l", label: "Max mash tun volume", unit: "L", step: "0.1" },
  { field: "max_hlt_volume_l", label: "Max HLT volume", unit: "L", step: "0.1" },
  { field: "mash_dead_space_l", label: "Mash dead space", unit: "L", step: "0.1" },
  { field: "mash_transfer_loss_l", label: "Mash transfer loss", unit: "L", step: "0.1" },
  { field: "kettle_dead_space_l", label: "Kettle dead space", unit: "L", step: "0.1" },
  { field: "kettle_transfer_loss_l", label: "Kettle transfer loss", unit: "L", step: "0.1" },
  { field: "trub_loss_l", label: "Trub loss", unit: "L", step: "0.1" },
  { field: "hlt_dead_space_l", label: "HLT dead space", unit: "L", step: "0.1" },
  { field: "hlt_transfer_loss_l", label: "HLT transfer loss", unit: "L", step: "0.1" },
  { field: "hlt_coil_floor_l", label: "HLT coil floor", unit: "L", step: "0.1" },
  {
    field: "nominal_boil_off_rate_l_per_hr",
    label: "Nominal boil-off rate",
    unit: "L/hr",
    step: "0.1",
  },
  {
    field: "grain_absorption_factor_l_per_kg",
    label: "Grain absorption",
    unit: "L/kg",
    step: "0.01",
  },
  { field: "nominal_conversion_efficiency", label: "Conversion efficiency", step: "0.01" },
  { field: "shrinkage_pct", label: "Shrinkage", step: "0.001" },
  { field: "mash_tun_specific_heat", label: "Tun specific heat", unit: "kcal/(kg·°C)", step: "0.01" },
  { field: "mash_tun_mass_kg", label: "Tun mass", unit: "kg", step: "0.1" },
];

const WATER_ION_FIELDS = [
  { field: "calcium_ca", label: "Calcium", unit: "ppm", step: "0.1" },
  { field: "magnesium_mg", label: "Magnesium", unit: "ppm", step: "0.1" },
  { field: "sodium_na", label: "Sodium", unit: "ppm", step: "0.1" },
  { field: "potassium_k", label: "Potassium", unit: "ppm", step: "0.1" },
  { field: "chloride_cl", label: "Chloride", unit: "ppm", step: "0.1" },
  { field: "sulfate_so4", label: "Sulfate", unit: "ppm", step: "0.1" },
  { field: "bicarbonate_hco3", label: "Bicarbonate", unit: "ppm", step: "0.1" },
  { field: "total_alkalinity_caco3", label: "Alkalinity (as CaCO₃)", unit: "ppm", step: "0.1" },
  { field: "total_hardness_caco3", label: "Hardness (as CaCO₃)", unit: "ppm", step: "0.1" },
  { field: "ph", label: "pH", step: "0.1" },
  { field: "tds_ppm", label: "TDS", unit: "ppm", step: "1" },
  {
    field: "electrical_conductivity_mmho_cm",
    label: "Conductivity",
    unit: "mmho/cm",
    step: "0.01",
  },
  { field: "nitrate_no3_n", label: "Nitrate (as N)", unit: "ppm", step: "0.1" },
  { field: "total_iron_fe", label: "Iron", unit: "ppm", step: "0.01" },
  { field: "total_phosphorus_p", label: "Phosphorus", unit: "ppm", step: "0.01" },
];

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

function equipmentTemplate(cache) {
  const id = "herms-30l";
  const seed = cache.references.equipment?.[id] ?? {};
  const draft = { name: "" };
  for (const { field } of EQUIPMENT_FIELDS) draft[field] = seed[field] ?? 0;
  return draft;
}

function waterTemplate(cache) {
  const seed = Object.values(cache.references.water_report ?? {})[0] ?? {};
  const draft = { laboratory: "", source_name: "" };
  for (const { field } of WATER_ION_FIELDS) draft[field] = seed[field] ?? 0;
  return draft;
}

export function createSetupStore({ onCreated } = {}) {
  const cache = createReferenceCache();
  const library = createLibrary({
    client: libraryClient,
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
      equipmentDraft: equipmentTemplate(cache),
      waterDraft: waterTemplate(cache),
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

    equipmentFields() {
      return EQUIPMENT_FIELDS;
    },

    waterFields() {
      return WATER_ION_FIELDS;
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

    isUserRecord(kind, itemId) {
      void this.revision;
      return library.has(kind, itemId);
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

    async createEquipment() {
      const draft = this.state.equipmentDraft;
      if (!draft.name?.trim()) return null;
      const component = { ...draft, name: draft.name.trim() };
      const created = await library.create("equipment", component);
      this.state.equipmentDraft = equipmentTemplate(cache);
      if (created?.id) this.state.equipmentId = created.id;
      this.revision += 1;
      return created;
    },

    async deleteEquipment(itemId) {
      if (!itemId || !library.has("equipment", itemId)) return;
      await library.remove("equipment", itemId);
      if (this.state.equipmentId === itemId) this.state.equipmentId = "";
      this.revision += 1;
    },

    async createWater() {
      const draft = this.state.waterDraft;
      if (!draft.laboratory?.trim()) return null;
      const component = {
        ...draft,
        laboratory: draft.laboratory.trim(),
        source_name: draft.source_name?.trim() || draft.laboratory.trim(),
      };
      const created = await library.create("water_report", component);
      this.state.waterDraft = waterTemplate(cache);
      if (created?.id) this.state.waterId = created.id;
      this.revision += 1;
      return created;
    },

    async deleteWater(itemId) {
      if (!itemId || itemId === "unknown" || !library.has("water_report", itemId)) return;
      await library.remove("water_report", itemId);
      if (this.state.waterId === itemId) this.state.waterId = "unknown";
      this.revision += 1;
    },

    // Create a sealed style record from an existing one. Any style may be forked
    // (a catalogue seed or another user record); lineage is a display snapshot.
    async forkStyle(itemId) {
      const parent = this.component("style", itemId);
      if (!parent) return null;
      const component = { ...parent };
      delete component.id;
      component.name = `${parent.name ?? itemId} (copy)`;
      component.forked_from_id = itemId;
      component.forked_from_name = parent.name ?? itemId;
      const created = await library.create("style", component);
      this.revision += 1;
      return created;
    },

    async deleteStyle(itemId) {
      if (!itemId || !library.has("style", itemId)) return;
      await library.remove("style", itemId);
      if (this.state.styleId === itemId) this.state.styleId = "";
      this.revision += 1;
    },
  };
}
