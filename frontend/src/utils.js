/**
 * @file Pure, dependency-free display and model utilities for the Alpine view layer.
 *
 * Barrel re-export: implementation is split into focused modules (format groups,
 * model, strings) with no cyclic imports. Callers keep importing from this file.
 *
 * Contract: every function is deterministic, side-effect free, and defensive
 * against null/undefined/empty-string/unexpected-type inputs. Nothing here
 * touches the DOM, the engine, the artifact, or module-level mutable state.
 *
 * Unit conversion (`toBase`, `displayValue`) and artifact-derived defaults stay
 * out of this module: they require the engine and belong to `views/producer`.
 */

export * from "./utils/format/number.js";
export * from "./utils/format/percent.js";
export * from "./utils/format/gravity.js";
export * from "./utils/format/range.js";
export * from "./utils/format/units.js";
export * from "./utils/format/count.js";
export * from "./utils/format/text.js";
export * from "./utils/format/time.js";
export * from "./utils/model.js";
export * from "./utils/strings.js";
