// Dry-hop card: the schedule on three axes — application event, contact time,
// and hop type. Descriptive only; the calculator has no fermentation model, so
// an event or a termination trigger records intent, never a prediction.

import { toBase } from "../../engine/index.js";
import { displayValue } from "../../views/producer.js";
import { rowDefaults } from "../../views/producer/authoring.js";
import { DRY_HOP_NODES as N, DRY_HOP_VALUE_LABELS } from "../../views/registry/dry-hops.js";
import { DRY_HOP_FORMS } from "../../views/producer/hopRows.js";
import {
  countLabel,
  firstNonEmptyString,
  formatWithDecimals,
  isFiniteNumber,
  optionLabel,
  resultCounter,
} from "../../utils.js";
import {
  catalogDraftKeys,
  catalogDraftLayer,
  createCatalogDraft,
} from "./catalogDraft.js";

const MAX_VISIBLE = 25;
const DRY_HOP_FORM_VALUES = DRY_HOP_FORMS.map((form) => form.value);

const dryHopTitle = (row) => firstNonEmptyString(row?.variety, "New dry hop");

export function makeDryHopRow(artifact, item) {
  const node = artifact.nodes[N.collection];
  const schema = artifact.primitive_schemas[node.item_schema] ?? {};
  const row = rowDefaults(schema, artifact.taxonomies);
  row.hop_id = item.id;
  row.variety = item.name;
  row.product_type = item.product_form ?? "t90_pellet";
  return row;
}

function dryHopOptions(artifact, taxonomyId, only = null) {
  const values = artifact.taxonomies[taxonomyId] ?? [];
  return (only ? values.filter((value) => only.includes(value)) : values).map((value) => ({
    value,
    label: optionLabel(DRY_HOP_VALUE_LABELS[taxonomyId] ?? {}, value),
  }));
}

function dryHopLabel(taxonomyId, value) {
  return optionLabel(DRY_HOP_VALUE_LABELS[taxonomyId] ?? {}, value);
}

function dryHopDraftConfig(ctx) {
  const { artifact } = ctx;
  const seeds = ctx.cache.seeds ?? {};
  return {
    prefix: "dryHop",
    Cap: "DryHop",
    nodeId: N.collection,
    seedKey: "hops",
    catalog: () => [
      ...Object.values(seeds.hops ?? {}),
      ...Object.values(seeds.hopProducts ?? {}),
    ],
    searchFields: ["name", "notes", "manufacturer", "brand"],
    idField: "hop_id",
    allowDuplicates: true,
    categoryField: "purpose",
    makeRow: (item) => makeDryHopRow(artifact, item),
    maxVisible: MAX_VISIBLE,
    itemMeta: (item) => [
      item.product_form ? item.brand ?? "Product" : item.purpose || "Hop",
      item.manufacturer,
      item.origin,
    ],
    searchPlaceholder: "Search hops and products by name or maker…",
    emptyMessage: "No matching entries found.",
    resultLabel: (view) => view.dryHopResultLabel,
  };
}

function dryHopActions({ artifact, getView }) {
  const actions = {
    dryHopRows: [],
    dryHopSectionOpen: true,
    dryHopProductOptions: dryHopOptions(artifact, "hop_product_form", DRY_HOP_FORM_VALUES),
    dryHopEventOptions: dryHopOptions(artifact, "hop_application_event"),
    dryHopContactUntilOptions: dryHopOptions(artifact, "hop_contact_until"),
    dryHopUnitOptions: dryHopOptions(artifact, "hop_unit"),

    dryHopTitle,

    toggleDryHopSection() {
      const view = getView();
      view.dryHopSectionOpen = !view.dryHopSectionOpen;
    },

    dryHopTypeLabel(row) {
      return dryHopLabel("hop_product_form", row?.product_type);
    },

    dryHopEventLabel(row) {
      return dryHopLabel("hop_application_event", row?.application_event);
    },

    dryHopUntilLabel(row) {
      return dryHopLabel("hop_contact_until", row?.contact_until);
    },

    dryHopContactHours(row) {
      const minutes = row?.contact_duration_min;
      if (!isFiniteNumber(minutes)) return "";
      return formatWithDecimals(displayValue(artifact, "time", "hr", minutes), 1, { dash: "" });
    },

    dryHopContactLabel(row) {
      const hours = actions.dryHopContactHours(row);
      if (hours) return `${hours} h`;
      const until = actions.dryHopUntilLabel(row);
      return until ? `until ${until}` : "—";
    },

    setDryHopDraftField(index, field, value) {
      getView().patchDraftRow(index, { [field]: value });
    },

    setDryHopDraftNumber(index, field, value) {
      const text = String(value ?? "").trim();
      const number = Number(text);
      getView().patchDraftRow(index, {
        [field]: text && Number.isFinite(number) ? number : null,
      });
    },

    setDryHopDraftContactHours(index, value) {
      const view = getView();
      const text = String(value ?? "").trim();
      if (!text) {
        view.patchDraftRow(index, { contact_duration_min: null });
        return;
      }
      const minutes = toBase(artifact, "time", "hr", Number(text));
      view.patchDraftRow(index, {
        contact_duration_min: Number.isFinite(minutes) ? Math.max(0, minutes) : null,
        contact_until: null,
      });
    },

    setDryHopDraftContactUntil(index, value) {
      getView().patchDraftRow(index, {
        contact_until: value || null,
        contact_duration_min: null,
      });
    },
  };
  return actions;
}

function dryHopDescriptors(getView) {
  return {
    dryHopSectionMeta: {
      configurable: true,
      get() {
        return countLabel(getView().dryHopRows?.length ?? 0, "addition");
      },
    },
    dryHopDraftSummary: {
      configurable: true,
      get() {
        return countLabel(getView().draftRows?.length ?? 0, "addition");
      },
    },
    dryHopResultLabel: {
      configurable: true,
      get() {
        const view = getView();
        return resultCounter({
          shown: view.dryHopVisibleCatalog.length,
          total: view.dryHopFilteredCatalog.length,
          noun: "hop",
          truncated: view.dryHopCatalogTruncated,
          truncatedHint: "refine search or purpose filters",
        });
      },
    },
  };
}

export function createDryHopCard({ artifact, getView }) {
  const actions = dryHopActions({ artifact, getView });
  Object.defineProperties(actions, dryHopDescriptors(getView));
  return actions;
}

export function createDryHopLayers(ctx) {
  return [
    catalogDraftLayer(createCatalogDraft(ctx, dryHopDraftConfig(ctx), ctx.registry)),
    createDryHopCard(ctx),
  ];
}

export function refreshDryHopCard(app, ctx) {
  app.dryHopRows = ctx.engine.get(N.collection) ?? [];
}

export const KEYS = [
  ...catalogDraftKeys("dryHop", "DryHop"),
  "dryHopRows",
  "dryHopSectionOpen",
  "dryHopSectionMeta",
  "toggleDryHopSection",
  "dryHopProductOptions",
  "dryHopEventOptions",
  "dryHopContactUntilOptions",
  "dryHopUnitOptions",
  "dryHopTitle",
  "dryHopTypeLabel",
  "dryHopEventLabel",
  "dryHopUntilLabel",
  "dryHopContactHours",
  "dryHopContactLabel",
  "setDryHopDraftField",
  "setDryHopDraftNumber",
  "setDryHopDraftContactHours",
  "setDryHopDraftContactUntil",
  "dryHopDraftSummary",
  "dryHopResultLabel",
];
