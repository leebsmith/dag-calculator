/**
 * @file Pure, dependency-free display and model utilities for the Alpine view layer.
 *
 * Barrel re-export: implementation is split into focused modules (format, model,
 * strings) with no cyclic imports. Callers keep importing from this file.
 *
 * Contract: every function is deterministic, side-effect free, and defensive
 * against null/undefined/empty-string/unexpected-type inputs. Nothing here
 * touches the DOM, the engine, the artifact, or module-level mutable state.
 *
 * Unit conversion (`toBase`, `displayValue`) and artifact-derived defaults stay
 * out of this module: they require the engine and belong to `views/producer`.
 */

export * from "./utils/format.js";
export * from "./utils/model.js";
export * from "./utils/strings.js";
