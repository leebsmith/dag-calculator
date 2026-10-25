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
