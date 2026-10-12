// Boundary memoization: canonical fingerprinting (byte-identical to the backend's
// `BoundaryModel.canonical_fingerprint`) plus a lazy result cache keyed by fingerprint.

import { sha256Hex } from "./sha256.js";

function jsNumberToString(n) {
  if (typeof n !== "number") {
    throw new Error(`Expected a number, got ${typeof n}`);
  }
  if (Number.isNaN(n) || n === Infinity || n === -Infinity) {
    return "null";
  }
  if (Object.is(n, -0)) {
    return "0";
  }
  return String(n);
}

export function canonicalize(obj) {
  if (obj === null) return "null";
  if (typeof obj === "boolean") return obj ? "true" : "false";
  if (typeof obj === "string") return JSON.stringify(obj);
  if (typeof obj === "number") return jsNumberToString(obj);
  if (Array.isArray(obj)) {
    return "[" + obj.map(canonicalize).join(",") + "]";
  }
  if (typeof obj === "object") {
    const keys = Object.keys(obj).sort();
    return (
      "{" +
      keys.map((k) => JSON.stringify(k) + ":" + canonicalize(obj[k])).join(",") +
      "}"
    );
  }
  throw new Error(`Unsupported type in fingerprint: ${typeof obj}`);
}

export function canonicalFingerprint(obj) {
  return sha256Hex(canonicalize(obj));
}

export class BoundaryCache {
  constructor() {
    this.store = new Map();
  }

  get(fingerprint) {
    return this.store.get(fingerprint);
  }

  has(fingerprint) {
    return this.store.has(fingerprint);
  }

  set(fingerprint, result) {
    this.store.set(fingerprint, result);
  }
}
