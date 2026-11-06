// Pure display helpers for the water card: ion deltas, treatment dose rows,
// target-selector options, and the fixed-precision readouts. The effectful
// handlers and the engine reads stay in adapters/cards/water.js.

import { fieldOr, formatQuantity, formatValue, formatWithDecimals } from "../utils.js";
import { constraintLabel, heldFromProfile } from "./registry/water.js";
import { registry } from "./registry/index.js";

const ADDITIONS = [
  "gypsum_kg",
  "cacl2_kg",
  "epsom_kg",
  "nacl_kg",
  "acid_l",
  "baking_soda_kg",
  "chalk_kg",
  "pickling_lime_kg",
];

export function ionDelta(value, target) {
  if (typeof value !== "number" || typeof target !== "number") return null;
  return value - target;
}

export function optionLabelFor(fieldId, value) {
  return registry[fieldId]?.optionLabels?.[value] ?? value;
}

export function doseRows(fieldsById, prefix, forms) {
  const names = {
    gypsum_kg: `gypsum (${forms.gypsum})`,
    cacl2_kg: `calcium chloride (${forms.cacl2})`,
    epsom_kg: "Epsom salt",
    nacl_kg: "table salt",
    acid_l: forms.acid,
    baking_soda_kg: "baking soda",
    chalk_kg: "chalk",
    pickling_lime_kg: "pickling lime",
  };
  const rows = [];
  let zero = 0;
  for (const key of ADDITIONS) {
    const field = fieldOr(fieldsById, `${prefix}.${key}`);
    if (typeof field.value !== "number") continue;
    if (field.value <= 0) {
      zero += 1;
      continue;
    }
    const shown = Number(field.display);
    if (Number.isFinite(shown) && shown === 0) {
      zero += 1;
      continue;
    }
    rows.push({ key, label: names[key], text: formatQuantity(field) });
  }
  return { rows, suppressed: zero > 0 && rows.length > 0 };
}

export function fmtL(value) {
  return value == null ? "—" : `${formatValue(value)} L`;
}

export function fmtPpm(value) {
  return value == null ? "—" : formatWithDecimals(value, 1, { dash: "—" });
}

export function fmtDelta(value) {
  if (value == null) return "—";
  const text = formatWithDecimals(value, 1, { dash: "—" });
  return value > 0 ? `+${text}` : text;
}

export function severityRank(severity) {
  return { ERROR: 3, WARNING: 2, NOTE: 1, INFO: 0 }[severity] ?? 0;
}

export function waterTargetOptionsOf(cache) {
  const records = cache.references.water_target ?? {};
  const presets = Object.entries(records)
    .map(([id, profile]) => {
      const held = heldFromProfile(profile);
      return {
        value: id,
        label: `${constraintLabel(held)} — ${profile?.name ?? id}`,
        size: held.length,
      };
    })
    .filter((option) => option.size > 0)
    .sort((a, b) => a.size - b.size || a.label.localeCompare(b.label));
  return [
    { value: "none", label: "No targets — no ion targets" },
    ...presets.map(({ value, label }) => ({ value, label })),
    { value: "freeform", label: "Freeform entry — compose your own set" },
  ];
}
