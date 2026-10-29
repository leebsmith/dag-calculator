// Dry-hop card: the schedule on three axes — application event, contact time,
// and hop type. Descriptive only; the calculator has no fermentation model, so
// an event or a termination trigger records intent, never a prediction.

import { toBase } from "../../engine/index.js";
import { displayValue } from "../../views/producer.js";
import { rowDefaults } from "../../views/producer/authoring.js";
import { DRY_HOP_NODES as N, DRY_HOP_VALUE_LABELS } from "../../views/registry/dry-hops.js";
import { firstNonEmptyString, formatWithDecimals, isFiniteNumber, optionLabel } from "../../utils.js";

const dryHopTitle = (row) => firstNonEmptyString(row?.variety, "New dry hop");

export function registerDryHopCard(app, ctx) {
  const { artifact, engine } = ctx;

  const options = (taxonomyId) =>
    (artifact.taxonomies[taxonomyId] ?? []).map((value) => ({
      value,
      label: optionLabel(DRY_HOP_VALUE_LABELS[taxonomyId] ?? {}, value),
    }));

  const readRows = () => engine.get(N.collection) ?? [];

  const writeRows = (rows) => {
    engine.setCollection(N.collection, rows);
    app.dryHopRows = rows;
    app.scheduleSolve();
    app.notify();
  };

  const patchRow = (index, changes) =>
    writeRows(readRows().map((row, i) => (i === index ? { ...row, ...changes } : row)));

  Object.assign(app, {
    dryHopRows: [],
    dryHopProductOptions: options("hop_product_type"),
    dryHopEventOptions: options("hop_application_event"),
    dryHopContactUntilOptions: options("hop_contact_until"),
    dryHopUnitOptions: options("hop_unit"),

    dryHopTitle,

    // The `time` dimension stores minutes; the card authors hours.
    dryHopContactHours(row) {
      const minutes = row?.contact_duration_min;
      const hours = displayValue(artifact, "time", "hr", minutes);
      return isFiniteNumber(minutes) ? formatWithDecimals(hours, 1, { dash: "" }) : "";
    },

    setDryHopField(index, field, value) {
      patchRow(index, { [field]: value });
    },

    setDryHopNumber(index, field, value) {
      const text = String(value ?? "").trim();
      const number = Number(text);
      patchRow(index, { [field]: text && Number.isFinite(number) ? number : null });
    },

    // Exactly one of duration / termination event: each setter clears the other.
    setDryHopContactHours(index, value) {
      const text = String(value ?? "").trim();
      if (!text) {
        patchRow(index, { contact_duration_min: null });
        return;
      }
      const minutes = toBase(artifact, "time", "hr", Number(text));
      patchRow(index, {
        contact_duration_min: Number.isFinite(minutes) ? Math.max(0, minutes) : null,
        contact_until: null,
      });
    },

    setDryHopContactUntil(index, value) {
      patchRow(index, {
        contact_until: value || null,
        contact_duration_min: null,
      });
    },

    addDryHop() {
      const node = artifact.nodes[N.collection];
      const schema = artifact.primitive_schemas[node.item_schema] ?? {};
      writeRows([...readRows(), rowDefaults(schema, artifact.taxonomies)]);
    },

    removeDryHop(index) {
      writeRows(readRows().filter((_, i) => i !== index));
    },
  });
}

export function refreshDryHopCard(app, ctx) {
  app.dryHopRows = ctx.engine.get(N.collection) ?? [];
}

export const KEYS = [
  "dryHopRows",
  "dryHopProductOptions",
  "dryHopEventOptions",
  "dryHopContactUntilOptions",
  "dryHopUnitOptions",
  "dryHopTitle",
  "dryHopContactHours",
  "setDryHopField",
  "setDryHopNumber",
  "setDryHopContactHours",
  "setDryHopContactUntil",
  "addDryHop",
  "removeDryHop",
];
