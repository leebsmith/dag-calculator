// Dry-hop card: the schedule on three axes — application event, contact time,
// and hop type. Descriptive only; the calculator has no fermentation model, so
// an event or a termination trigger records intent, never a prediction.

import { toBase } from "../../engine/index.js";
import { displayValue } from "../../views/producer.js";
import { rowDefaults } from "../../views/producer/authoring.js";
import { DRY_HOP_NODES as N, DRY_HOP_VALUE_LABELS } from "../../views/registry/dry-hops.js";
import {
  countLabel,
  firstNonEmptyString,
  formatWithDecimals,
  isFiniteNumber,
  optionLabel,
  resultCounter,
} from "../../utils.js";
import { catalogDraftKeys, installCatalogDraft } from "./catalogDraft.js";

const MAX_VISIBLE = 25;

const dryHopTitle = (row) => firstNonEmptyString(row?.variety, "New dry hop");

function makeDryHopRow(artifact, item) {
  const node = artifact.nodes[N.collection];
  const schema = artifact.primitive_schemas[node.item_schema] ?? {};
  const row = rowDefaults(schema, artifact.taxonomies);
  row.hop_id = item.id;
  row.variety = item.name;
  row.product_type = item.product_form ?? "t90_pellet";
  return row;
}

function dryHopOptions(artifact, taxonomyId) {
  return (artifact.taxonomies[taxonomyId] ?? []).map((value) => ({
    value,
    label: optionLabel(DRY_HOP_VALUE_LABELS[taxonomyId] ?? {}, value),
  }));
}

function dryHopLabel(taxonomyId, value) {
  return optionLabel(DRY_HOP_VALUE_LABELS[taxonomyId] ?? {}, value);
}

function installDryHopDraft(app, ctx) {
  const { artifact } = ctx;
  const seeds = ctx.cache.seeds ?? {};

  installCatalogDraft(app, ctx, {
    prefix: "dryHop",
    Cap: "DryHop",
    nodeId: N.collection,
    seedKey: "hops",
    catalog: () => [
      ...Object.values(seeds.hops ?? {}),
      ...Object.values(seeds.hopProducts ?? {}),
    ],
    catalogNameOf: (item) => (item.product_form ? "hop_product" : "hop"),
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
  });
}

function installDryHopReadouts(app, ctx) {
  const { artifact } = ctx;

  Object.assign(app, {
    dryHopRows: [],
    dryHopProductOptions: dryHopOptions(artifact, "hop_product_type"),
    dryHopEventOptions: dryHopOptions(artifact, "hop_application_event"),
    dryHopContactUntilOptions: dryHopOptions(artifact, "hop_contact_until"),
    dryHopUnitOptions: dryHopOptions(artifact, "hop_unit"),

    dryHopTitle,

    dryHopTypeLabel(row) {
      return dryHopLabel("hop_product_type", row?.product_type);
    },

    dryHopEventLabel(row) {
      return dryHopLabel("hop_application_event", row?.application_event);
    },

    dryHopUntilLabel(row) {
      return dryHopLabel("hop_contact_until", row?.contact_until);
    },

    // The `time` dimension stores minutes; the card authors hours.
    dryHopContactHours(row) {
      const minutes = row?.contact_duration_min;
      if (!isFiniteNumber(minutes)) return "";
      return formatWithDecimals(displayValue(artifact, "time", "hr", minutes), 1, { dash: "" });
    },

    dryHopContactLabel(row) {
      const hours = this.dryHopContactHours(row);
      if (hours) return `${hours} h`;
      const until = this.dryHopUntilLabel(row);
      return until ? `until ${until}` : "—";
    },

    setDryHopDraftField(index, field, value) {
      this.patchDraftRow(index, { [field]: value });
    },

    setDryHopDraftNumber(index, field, value) {
      const text = String(value ?? "").trim();
      const number = Number(text);
      this.patchDraftRow(index, { [field]: text && Number.isFinite(number) ? number : null });
    },

    // Exactly one of duration / termination event: each setter clears the other.
    setDryHopDraftContactHours(index, value) {
      const text = String(value ?? "").trim();
      if (!text) {
        this.patchDraftRow(index, { contact_duration_min: null });
        return;
      }
      const minutes = toBase(artifact, "time", "hr", Number(text));
      this.patchDraftRow(index, {
        contact_duration_min: Number.isFinite(minutes) ? Math.max(0, minutes) : null,
        contact_until: null,
      });
    },

    setDryHopDraftContactUntil(index, value) {
      this.patchDraftRow(index, {
        contact_until: value || null,
        contact_duration_min: null,
      });
    },
  });
}

function installDryHopSummaries(app) {
  Object.defineProperties(app, {
    dryHopDraftSummary: {
      configurable: true,
      get() {
        return countLabel(this.draftRows?.length ?? 0, "addition");
      },
    },
    dryHopResultLabel: {
      configurable: true,
      get() {
        return resultCounter({
          shown: this.dryHopVisibleCatalog.length,
          total: this.dryHopFilteredCatalog.length,
          noun: "hop",
          truncated: this.dryHopCatalogTruncated,
          truncatedHint: "refine search or purpose filters",
        });
      },
    },
  });
}

export function registerDryHopCard(app, ctx) {
  installDryHopDraft(app, ctx);
  installDryHopReadouts(app, ctx);
  installDryHopSummaries(app);
}

export function refreshDryHopCard(app, ctx) {
  app.dryHopRows = ctx.engine.get(N.collection) ?? [];
}

export const KEYS = [
  ...catalogDraftKeys("dryHop", "DryHop"),
  "dryHopRows",
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
