// Batch setup: the identity triplet (equipment / water source / style) and the
// user-owned assets it is drawn from. Engine-free by design — this store only
// touches the catalog client, the seed reference cache, and persistence.

import { createLibrary } from "./library.js";
import * as libraryClient from "../adapters/libraryClient.js";
import { createReferenceCache } from "./referenceCache.js";
import * as persistence from "./persistence.js";

const EQUIPMENT_FIELDS = [
  "max_kettle_volume_l",
  "max_mash_tun_volume_l",
  "max_hlt_volume_l",
  "mash_dead_space_l",
  "mash_transfer_loss_l",
  "kettle_dead_space_l",
  "kettle_transfer_loss_l",
  "trub_loss_l",
  "hlt_dead_space_l",
  "hlt_transfer_loss_l",
  "nominal_boil_off_rate_l_per_hr",
  "grain_absorption_factor_l_per_kg",
  "nominal_conversion_efficiency",
  "shrinkage_pct",
  "hlt_coil_floor_l",
  "mash_tun_specific_heat",
  "mash_tun_mass_kg",
];

const WATER_IONS = [
  "calcium_ca",
  "magnesium_mg",
  "sodium_na",
  "sulfate_so4",
  "chloride_cl",
  "total_alkalinity_caco3",
];

const STYLE_BOUNDS = [
  "og_min",
  "og_max",
  "fg_min",
  "fg_max",
  "ibu_min",
  "ibu_max",
  "srm_min",
  "srm_max",
  "abv_min",
  "abv_max",
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
  for (const field of EQUIPMENT_FIELDS) draft[field] = seed[field] ?? 0;
  return draft;
}

function waterTemplate(cache) {
  const seed = Object.values(cache.references.water_report ?? {})[0] ?? {};
  const draft = { laboratory: "", source_name: "" };
  for (const ion of WATER_IONS) draft[ion] = seed[ion] ?? 0;
  return draft;
}

export function createSetupStore({ onCreated } = {}) {
  const cache = createReferenceCache();
  const library = createLibrary({
    client: libraryClient,
    kinds: ["equipment", "water_report"],
    onChange: () => cache.syncLibraryItems(library.items()),
  });

  const state = {
    modalOpen: false,
    busy: false,
    error: "",
    name: "",
    equipmentId: "",
    waterId: "",
    styleMode: "styleguide",
    styleId: "",
    customStyle: { name: "Experimental", og_min: 1.04, og_max: 1.06, fg_min: 1.008, fg_max: 1.014, ibu_min: 20, ibu_max: 40, srm_min: 4, srm_max: 10, abv_min: 4, abv_max: 6 },
    equipmentDraft: equipmentTemplate(cache),
    waterDraft: waterTemplate(cache),
  };

  const component = (kind, itemId) => cache.references[kind]?.[itemId] ?? null;

  return {
    state,
    library,

    async refreshAssets() {
      await library.refresh();
      return library.items();
    },

    equipmentOptions() {
      const records = cache.references.equipment ?? {};
      return Object.entries(records)
        .map(([id, record]) => ({ value: id, label: record.name ?? id }))
        .sort((a, b) => a.label.localeCompare(b.label));
    },

    waterOptions() {
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
      return Object.entries(cache.references.style ?? {})
        .map(([id, style]) => ({ value: id, label: style.name ?? id }))
        .sort((a, b) => a.label.localeCompare(b.label));
    },

    openModal() {
      state.modalOpen = true;
      state.error = "";
      state.busy = false;
      state.name = "";
      state.equipmentId = this.equipmentOptions()[0]?.value ?? "";
      state.waterId = "unknown";
      state.styleMode = "styleguide";
      state.styleId = this.styleOptions()[0]?.value ?? "";
    },

    closeModal() {
      state.modalOpen = false;
    },

    canCreate() {
      if (!state.name.trim()) return false;
      if (!state.equipmentId || !state.waterId) return false;
      if (state.styleMode === "styleguide") return Boolean(state.styleId);
      return STYLE_BOUNDS.every((field) => Number.isFinite(Number(state.customStyle[field])));
    },

    identity() {
      const equipment = component("equipment", state.equipmentId);
      const water =
        state.waterId === "unknown" ? UNKNOWN_WATER : component("water_report", state.waterId);
      const style =
        state.styleMode === "styleguide" ? component("style", state.styleId) : { ...state.customStyle };
      return {
        equipment: { ...equipment },
        "water.source": { ...water },
        style: { ...style },
      };
    },

    async create() {
      if (!this.canCreate() || state.busy) return null;
      state.busy = true;
      state.error = "";
      try {
        const active = await persistence.createWithIdentity({
          name: state.name.trim(),
          identity: this.identity(),
        });
        state.modalOpen = false;
        onCreated?.(active);
        return active;
      } catch (err) {
        state.error = err?.message ?? "Could not create the batch.";
        return null;
      } finally {
        state.busy = false;
      }
    },

    async createEquipment() {
      const draft = state.equipmentDraft;
      if (!draft.name?.trim()) return null;
      const component = { ...draft, name: draft.name.trim() };
      const created = await library.create("equipment", component);
      state.equipmentDraft = equipmentTemplate(cache);
      if (created?.id) state.equipmentId = created.id;
      return created;
    },

    async deleteEquipment(itemId) {
      if (!itemId) return;
      await library.remove("equipment", itemId);
      if (state.equipmentId === itemId) state.equipmentId = "";
    },

    async createWater() {
      const draft = state.waterDraft;
      if (!draft.laboratory?.trim()) return null;
      const component = {
        ...draft,
        laboratory: draft.laboratory.trim(),
        source_name: draft.source_name?.trim() || draft.laboratory.trim(),
      };
      const created = await library.create("water_report", component);
      state.waterDraft = waterTemplate(cache);
      if (created?.id) state.waterId = created.id;
      return created;
    },

    async deleteWater(itemId) {
      if (!itemId || itemId === "unknown") return;
      await library.remove("water_report", itemId);
      if (state.waterId === itemId) state.waterId = "unknown";
    },
  };
}
