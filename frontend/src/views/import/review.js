// Pure readouts for the import view: stages, target rows, verification wording.
//
// Nothing here holds state and nothing is derived from the artifact: the record
// arrives from the server already transcribed, and these helpers only decide how
// to present it. The map and check stages are declared but not yet reachable —
// they arrive with the ledger and the gate.

export const STAGES = [
  { id: "transcribe", title: "Transcribe" },
  { id: "map", title: "Map", enabled: false },
  { id: "check", title: "Check", enabled: false },
];

export const TARGET_FIELDS = [
  { key: "volume", label: "Fermenter volume" },
  { key: "og", label: "OG" },
  { key: "fg", label: "FG" },
  { key: "abv", label: "ABV" },
  { key: "ibu", label: "IBU" },
  { key: "srm", label: "Colour" },
  { key: "boil_time_min", label: "Boil time" },
];

export const REQUIRED_TARGETS = ["volume", "og", "ibu"];

const UNIT_SYMBOL = {
  l: "L",
  gal: "gal",
  sg: "SG",
  plato: "°P",
  points: "points",
  pct: "%",
  ibu: "IBU",
  srm: "SRM",
  ebc: "EBC",
  min: "min",
  g: "g",
  kg: "kg",
  oz: "oz",
  lb: "lb",
  ml: "ml",
  tsp: "tsp",
  tbsp: "tbsp",
  cup: "cup",
  qt: "qt",
  h: "h",
  day: "day",
};

export function unitSymbol(unit) {
  return unit ? (UNIT_SYMBOL[unit] ?? unit) : "";
}

export function quantityLabel(quantity) {
  if (!quantity) return "";
  return `${formatNumber(quantity.value)} ${unitSymbol(quantity.unit)}`.trim();
}

export function formatNumber(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  return String(Number(value.toFixed(4)));
}

// A target row is display + the raw facts a correction needs to preserve.
export function targetRows(payload) {
  const targets = payload?.targets ?? {};
  return TARGET_FIELDS.map(({ key, label }) => targetRow(key, label, targets[key]));
}

function targetRow(key, label, target) {
  const present = target !== null && target !== undefined;
  return {
    key,
    label,
    required: REQUIRED_TARGETS.includes(key),
    present,
    value: present ? target.value : null,
    unit: present ? target.unit : null,
    display: present ? `${formatNumber(target.value)} ${unitSymbol(target.unit)}`.trim() : "",
    verbatim: present ? target.verbatim : "",
    page: present ? target.page : null,
    source: present ? (target.source ?? "llm") : "llm",
  };
}

export function missingRequired(payload) {
  return targetRows(payload)
    .filter((row) => row.required && !row.present)
    .map((row) => row.label);
}

export function describeVerification(verification) {
  if (!verification) return noCheck();
  if (!verification.text_layer) return scanCheck();
  const unmatched = verification.unmatched ?? [];
  if (unmatched.length === 0) return cleanCheck(verification.numbers_checked);
  return flaggedCheck(verification.numbers_checked, unmatched);
}

function noCheck() {
  return { tone: "unknown", label: "No check", detail: "This document was not verified." };
}

function scanCheck() {
  return {
    tone: "none",
    label: "No text layer",
    detail: "A scan: nothing to check the numbers against, so review them yourself.",
  };
}

function cleanCheck(checked) {
  return {
    tone: "ok",
    label: `${checked} numbers found on the page`,
    detail: "Every transcribed number appears in the document's own text.",
  };
}

function flaggedCheck(checked, unmatched) {
  return {
    tone: "warn",
    label: `${unmatched.length} of ${checked} not found on the page`,
    detail: unmatched
      .map((item) => `${item.field} = ${item.value}${item.page ? ` (p${item.page})` : ""}`)
      .join(" · "),
  };
}

export function sourceLabel(source) {
  return source === "user" ? "you" : "page";
}

export function fermentableRows(payload) {
  return (payload?.fermentables ?? []).map((line) => ({
    name: line.name,
    maltster: line.maltster ?? "",
    amount: quantityLabel(line.quantity),
    kind: line.kind_hint,
    verbatim: line.verbatim,
    page: line.page,
  }));
}

export function hopRows(payload) {
  return (payload?.hops ?? []).map((line) => ({
    name: line.name,
    amount: quantityLabel(line.quantity),
    stage: line.stage_guess,
    stageVerbatim: line.stage_verbatim ?? "",
    minutes: line.minutes,
    ibu: line.ibu_contribution,
    alpha: line.alpha_acid_pct,
    verbatim: line.verbatim,
    page: line.page,
  }));
}

export function yeastRows(payload) {
  return (payload?.yeasts ?? []).map((line) => ({
    name: line.name,
    lab: line.lab ?? "",
    code: line.code ?? "",
    attenuation: line.attenuation_pct,
    verbatim: line.verbatim,
    page: line.page,
  }));
}

export function mashRows(payload) {
  return (payload?.mashes ?? []).map((line) => ({
    step: line.step_verbatim,
    temperature: line.temperature
      ? `${formatNumber(line.temperature.value)} °${(line.temperature.unit ?? "c").toUpperCase()}`
      : "",
    duration: line.duration_min,
    thickness: quantityLabel(line.thickness),
    page: line.page,
  }));
}

export function unmodeledRows(payload) {
  return (payload?.unmodeled ?? []).map((line) => ({
    text: line.text,
    kind: line.kind,
    stage: line.stage ?? "",
    amount: quantityLabel(line.quantity),
    page: line.page,
  }));
}

export function warningRows(payload) {
  return (payload?.warnings ?? []).map((line) => ({
    text: line.text,
    page: line.page ?? null,
  }));
}

export function documentTitle(record) {
  const payload = record?.extract?.payload;
  return payload?.title ?? record?.extract?.source?.filename ?? "Recipe";
}

export function recordSummary(record) {
  const extract = record?.extract;
  if (!extract) return null;
  return {
    filename: extract.source.filename,
    pages: extract.source.page_count,
    model: extract.source.model,
    promptVersion: extract.source.prompt_version,
    extractedAt: extract.source.extracted_at,
    style: extract.payload.style_name ?? "",
    recipes: extract.payload.detected_recipes?.length ?? 0,
  };
}

export function editTarget(payload, key, rawValue) {
  const numeric = Number(rawValue);
  if (!Number.isFinite(numeric)) return payload;
  const current = payload.targets?.[key] ?? null;
  const next = current
    ? { ...current, value: numeric, source: "user" }
    : {
        value: numeric,
        unit: null,
        verbatim: "entered by you",
        page: 1,
        source: "user",
      };
  return { ...payload, targets: { ...payload.targets, [key]: next } };
}
