// Pure state and display helpers for the brew-session controller.

import { reportError } from "../observability.js";

export const LEVEL_LABELS = {
  critical: "Critical path",
  info: "Standard",
  debug: "Diagnostic",
};

export const STATUS_LABELS = {
  planned: "Planned",
  brewing: "Brewing",
  fermenting: "Fermenting",
  packaging: "Packaging",
  complete: "Complete",
  sealed: "Sealed",
};

export function cell(row, key) {
  return row?.[key]?.text ?? "";
}

export function numberFrom(text) {
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

export function nowLocal() {
  const date = new Date();
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function secondsFromLocal(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed / 1000 : Date.now() / 1000;
}

export function toleranceOf(text) {
  try {
    return JSON.parse(text || "{}");
  } catch (err) {
    reportError("brewSession.tolerance", err);
    return {};
  }
}

function bandVerdict(actual, tolerance) {
  if (tolerance.min != null && actual < tolerance.min) return "below";
  if (tolerance.max != null && actual > tolerance.max) return "above";
  return "within";
}

function deltaVerdict(actual, expected, limit) {
  const delta = actual - expected;
  if (Math.abs(delta) <= limit) return "within";
  return delta > 0 ? "above" : "below";
}

export function verdictOf(actual, expected, tolerance) {
  if (tolerance?.min != null || tolerance?.max != null) return bandVerdict(actual, tolerance);
  if (tolerance?.plus_minus == null) return "recorded";
  return deltaVerdict(actual, expected, tolerance.plus_minus);
}

export function createBrewSessionState() {
  return {
    open: false,
    loading: false,
    error: null,
    batchId: null,
    batchName: "",
    session: null,
    sessions: [],
    observationDrafts: {},
    startedAt: nowLocal(),
    level: "info",
    levels: Object.entries(LEVEL_LABELS).map(([id, name]) => ({ id, name })),
    statuses: Object.entries(STATUS_LABELS).map(([id, name]) => ({ id, name })),
  };
}
