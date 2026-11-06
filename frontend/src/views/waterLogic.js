// Pure display helpers for the water card: ion deltas, treatment dose rows,
// target-selector options, and the fixed-precision readouts. The effectful
// handlers and the engine reads stay in adapters/cards/water.js.

import { fieldOr, formatQuantity, formatValue, formatWithDecimals } from "../utils.js";
import {
  WATER_ION_BY_PIN,
  WATER_IONS,
  constraintLabel,
  heldFromProfile,
} from "./registry/water.js";
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

/**
 * Difference between a post-dose value and its target.
 *
 * @pure
 * @param {number|null} value
 * @param {number|null} target
 * @returns {number|null}
 */
export function ionDelta(value, target) {
  if (typeof value !== "number" || typeof target !== "number") return null;
  return value - target;
}

/**
 * Resolve a choice value's presentation label.
 *
 * @pure
 * @param {string} fieldId
 * @param {string} value
 * @returns {string}
 */
export function optionLabelFor(fieldId, value) {
  return registry[fieldId]?.optionLabels?.[value] ?? value;
}

/**
 * Build the treatment dose rows for one addition prefix.
 *
 * @pure
 * @param {Readonly<Record<string, { readonly value?: number, readonly display?: string }>>} fieldsById
 * @param {string} prefix
 * @param {{ readonly gypsum: string, readonly cacl2: string, readonly acid: string }} forms
 * @returns {{ readonly rows: ReadonlyArray<{ readonly key: string, readonly label: string, readonly text: string }>, readonly suppressed: boolean }}
 */
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

/**
 * Format a volume in litres.
 *
 * @pure
 * @param {number|null} value
 * @returns {string}
 */
export function fmtL(value) {
  return value == null ? "—" : `${formatValue(value)} L`;
}

/**
 * Format an ion concentration in parts per million.
 *
 * @pure
 * @param {number|null} value
 * @returns {string}
 */
export function fmtPpm(value) {
  return value == null ? "—" : formatWithDecimals(value, 1, { dash: "—" });
}

/**
 * Format a signed ion delta.
 *
 * @pure
 * @param {number|null} value
 * @returns {string}
 */
export function fmtDelta(value) {
  if (value == null) return "—";
  const text = formatWithDecimals(value, 1, { dash: "—" });
  return value > 0 ? `+${text}` : text;
}

/**
 * Rank telemetry severities for display ordering.
 *
 * @pure
 * @param {string} severity
 * @returns {number}
 */
export function severityRank(severity) {
  return { ERROR: 3, WARNING: 2, NOTE: 1, INFO: 0 }[severity] ?? 0;
}

/**
 * Build the water-target selector options from the reference cache.
 *
 * @pure
 * @param {{ readonly references: { readonly water_target?: Readonly<Record<string, { readonly name?: string }>> } }} cache
 * @returns {ReadonlyArray<{ readonly value: string, readonly label: string }>}
 */
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

// --- the constraint model ---------------------------------------------------
// The checked-ion set is the authored declaration the solver reads. Checking an
// ion always values it (checking seeds a number; clearing unchecks), so the
// constrained set and the checked set are the same set. These are pure data
// transforms; the adapter owns the engine reads/writes.

/**
 * Read the checked ion pins out of the pinned-ion rows.
 *
 * @pure
 * @param {ReadonlyArray<{ readonly ion: string }>|null|undefined} rows
 * @returns {string[]}
 */
export function checkedPins(rows) {
  return (rows ?? []).map((row) => row.ion);
}

/**
 * The constrained set. Same as the checked set by contract.
 *
 * @pure
 * @param {ReadonlyArray<{ readonly ion: string }>|null|undefined} rows
 * @returns {string[]}
 */
export function valuedPins(rows) {
  return checkedPins(rows);
}

/**
 * Turn a pin list into the pinned-ion collection rows the engine stores.
 *
 * @pure
 * @param {ReadonlyArray<string>} pins
 * @returns {Array<{ ion: string }>}
 */
export function pinnedRows(pins) {
  return pins.map((ion) => ({ ion }));
}

/**
 * The ions a target profile holds: its declared constraints.
 *
 * @pure
 * @param {Readonly<Record<string, unknown>>|null|undefined} profile
 * @returns {string[]}
 */
export function presetPins(profile) {
  return profile ? heldFromProfile(profile) : [];
}

/**
 * Toggle one pin in the pinned-ion rows, keeping the rows immutable.
 *
 * @pure
 * @param {ReadonlyArray<{ readonly ion: string }>|null|undefined} rows
 * @param {string} pin
 * @returns {Array<{ ion: string }>}
 */
export function nextPinned(rows, pin) {
  const list = rows ?? [];
  return list.some((row) => row.ion === pin)
    ? list.filter((row) => row.ion !== pin)
    : [...list, { ion: pin }];
}

/**
 * The initial target for a newly checked ion: the batch's source concentration,
 * which is the only non-infeasible starting point (salts only add).
 *
 * @pure
 * @param {Readonly<Record<string, unknown>>|null|undefined} source
 * @param {string} pin
 * @returns {number}
 */
export function seedTargetValue(source, pin) {
  const seed = Number(source?.[WATER_ION_BY_PIN[pin]]);
  return Number.isFinite(seed) ? seed : 0;
}

/**
 * The pins with a positive target value, in the registry's ion order.
 *
 * @pure
 * @param {(pin: string) => number} targetOf
 * @returns {string[]}
 */
export function positivePins(targetOf) {
  return WATER_IONS.filter(({ pin }) => targetOf(pin) > 0).map(({ pin }) => pin);
}

