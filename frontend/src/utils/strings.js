/**
 * @file Pure string helpers. Leaf module: no imports, so it can be shared by
 * the formatting and model layers without creating an import cycle.
 */

function stringifyNumber(value) {
  if (!Number.isFinite(value)) return "";
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 1000) / 1000);
}

/**
 * First non-empty string among the candidates; numeric candidates are stringified.
 *
 * @param {...unknown} values
 * @returns {string} `""` when nothing usable is supplied.
 * @note STRICT UTILITY: Do not write custom logic for this in Alpine expressions; import and call this function.
 */
export function firstNonEmptyString(...values) {
  for (const value of values) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed !== "") return trimmed;
      continue;
    }
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

/**
 * Join only the non-empty pieces, suppressing the separators that would otherwise
 * trail or double up. Replaces the `(x ? ' • ' + x : '')` chains.
 *
 * @param {unknown} parts
 * @param {string} [separator=" • "]
 * @returns {string}
 * @note STRICT UTILITY: Do not write custom logic for this in Alpine expressions; import and call this function.
 */
export function joinNonEmpty(parts, separator = " • ") {
  if (!Array.isArray(parts)) return "";
  const pieces = [];
  for (const part of parts) {
    if (part === null || part === undefined) continue;
    const text =
      typeof part === "string" ? part.trim() : typeof part === "number" ? stringifyNumber(part) : String(part);
    if (text === "") continue;
    pieces.push(text);
  }
  return pieces.join(separator);
}

/**
 * Human label for a choice option, from a per-field label map, falling back to the
 * raw value when the map is absent or the member is unlabelled.
 *
 * @param {Record<string, string>|null|undefined} labels
 * @param {string} value
 * @returns {string}
 * @note STRICT UTILITY: Do not write custom logic for this in Alpine expressions; import and call this function.
 */
export function optionLabel(labels, value) {
  if (labels && typeof labels === "object" && typeof value === "string" && value in labels) {
    return labels[value];
  }
  return value;
}

/**
 * Filesystem-safe download name: lowercase, alphanumeric runs joined by `-`.
 *
 * @param {unknown} name
 * @param {string} [suffix="json"]
 * @returns {string} e.g. `house-pale.json`; `batch.json` when the name is unusable.
 * @note STRICT UTILITY: Do not write custom logic for this in Alpine expressions; import and call this function.
 */
export function safeFilename(name, suffix = "json") {
  const slug = String(typeof name === "string" ? name : "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const extension = String(suffix ?? "")
    .replace(/^\.+/, "")
    .replace(/[^a-z0-9.]+/gi, "-");
  return `${slug || "batch"}.${extension || "json"}`;
}

/**
 * Human labels for the solver error codes the boundaries declare. The guard
 * `tests/guards/solver-error-labels.test.js` keeps this table and the artifact's
 * `domain.codes` in lockstep, so a new code cannot ship unlabelled.
 */
export const SOLVER_ERROR_LABELS = {
  INVALID_TARGET_ABV: "Target ABV is out of range",
  INVALID_ATTENUATION: "Attenuation is out of range",
  ABV_UNREACHABLE: "Target ABV is beyond what this wort can ferment",
  INVALID_FERM_VOLUME: "Fermenter volume must be positive",
  INVALID_SHRINKAGE: "Shrinkage must be below 100%",
  EXTRACT_TARGET_NON_POSITIVE: "Late additions exceed the batch's extract",
  INVALID_YIELD: "The grain bill carries no extract yield",
  DEGENERATE_BRACKET: "The grist mass bracket is degenerate",
  BRACKET_NO_SIGN_CHANGE: "Extract target is not reachable at this mash",
  UNKNOWN_TOPOLOGY: "Unknown mash constraint",
  INVALID_INTENSIVE_VALUE: "Mash thickness or runnings ratio is invalid",
  MASH_TOO_THIN: "Mash is too thin for the grain bed",
  HLT_TOO_SMALL: "Hot liquor tank is too small",
  KETTLE_TOO_SMALL: "Kettle is too small",
  MASH_TUN_TOO_SMALL: "Mash tun is too small",
  INVALID_GRAIN_BILL_NORMALIZATION: "Grain bill shares do not sum to 100%",
  INVALID_SUGAR_SHARE: "Late-addition share is out of range",
  INVALID_SUGAR_FERMENTABILITY: "Sugar fermentability is out of range",
  INVALID_SCALE_PIN: "The scale target is invalid for this grain bill",
  INVALID_TARGET_OG: "Target OG must be above 1.000",
  INVALID_TARGET_FG: "Target FG must be positive",
  FG_UNREACHABLE: "Target FG is not reachable",
  FG_BELOW_ZERO_WITHOUT_STA1: "Final gravity below 1.000 needs a diastaticus strain",
  INVALID_MASH_VOLUME: "Mash water volume is invalid",
  INVALID_SPARGE_VOLUME: "Sparge water volume is invalid",
  UNKNOWN_GRAIN_TYPE: "Unknown grain type in the water model",
  UNKNOWN_ACID_MEDIUM: "Unknown acid",
  UNKNOWN_ALKALINE_AGENT: "Unknown alkaline agent",
  UNKNOWN_SALT_FORM: "Unknown salt form",
  SALT_SOLVE_FAILED: "No salt dose satisfies the target",
  UNKNOWN_STRATEGY: "Unknown water strategy",
  PINNED_IONS_REQUIRED: "Pin at least one ion",
  INVALID_HOP_INPUT: "Hop charge is invalid",
  INVALID_GRAVITY: "Gravity is invalid for the hop model",
  INVALID_VOLUME: "Volume is invalid for the hop model",
  INVALID_COOLING_CONSTANT: "Whirlpool cooling constant is invalid",
  UNKNOWN_PRODUCT_FORM: "Unknown hop product form",
  WHIRLPOOL_HEATING: "Whirlpool is heating",
  WHIRLPOOL_ADDITION_CONFLICT: "Whirlpool additions overlap",
  WHIRLPOOL_BELOW_AMBIENT: "Whirlpool is below ambient",
  VALIDATION: "The request was rejected",
  HTTP_ERROR: "The request failed",
};

/**
 * Human label for a solver error code, or a generic fallback.
 *
 * @param {unknown} code
 * @returns {string}
 * @note STRICT UTILITY: Do not write custom logic for this in Alpine expressions; import and call this function.
 */
export function solverErrorLabel(code) {
  if (typeof code !== "string" || code === "") return "Solver error";
  return SOLVER_ERROR_LABELS[code] ?? "Solver error";
}

/**
 * The editor alert's view model: the raw code and message stay available, and
 * the header prints the label.
 *
 * @param {{ code?: string, message?: string }|null|undefined} error
 * @returns {{ code: string, message: string, label: string }|null}
 * @note STRICT UTILITY: Do not write custom logic for this in Alpine expressions; import and call this function.
 */
export function boundaryErrorView(error) {
  if (!error) return null;
  return {
    code: typeof error.code === "string" ? error.code : "",
    message: typeof error.message === "string" ? error.message : "",
    label: solverErrorLabel(error.code),
  };
}
