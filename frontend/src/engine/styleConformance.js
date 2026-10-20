// Style-conformance assessor (docs/style-conformance.md). A pure function of the
// realized valuation: maps the five BJCP vital statistics plus two relational
// dimensions (AA, BU:GU) to a JND drift status and a Style Adherence Index.
// Structural adherence only — no sensory score, no medal tier.

import { feasibleVertices, sgToPlato } from "./fermentation.js";

// One just-noticeable-difference band per dimension, in its native unit.
const TAU = {
  og: 0.002, // SG
  fg: 0.002, // SG
  abv: 0.2, // %
  ibu: 3, // IBU
  srm: 1.5, // SRM
  aa: 2.0, // percentage points
  bugu: 0.1, // ratio
};

const PILLARS = {
  visual: { weight: 3, lambda: 0.28, k: 2.5, label: "Color" },
  gravity: { weight: 9, lambda: 0.24, k: 2.2, label: "Gravity & strength" },
  fermentation: { weight: 9, lambda: 0.25, k: 2.2, label: "Fermentation & body" },
  balance: { weight: 11, lambda: 0.22, k: 2.2, label: "Hop & balance" },
};
const TOTAL_WEIGHT = 32; // 3 + 9 + 9 + 11

function complete(min, max) {
  return Number.isFinite(min) && Number.isFinite(max) && min < max;
}

function statusFor(value, low, high, tau) {
  let violatedBoundary = null;
  let deviation = 0;
  if (value < low) {
    violatedBoundary = low;
    deviation = low - value;
  } else if (value > high) {
    violatedBoundary = high;
    deviation = value - high;
  }
  const z = tau > 0 ? deviation / tau : 0;
  let status = "within";
  if (z > 2) status = "severe";
  else if (z > 1) status = "drift";
  else if (z > 0) status = "grace";
  return { value, low, high, violatedBoundary, deviation, tau, z, status };
}

function aaRange(envelope) {
  const vertices = feasibleVertices({
    ogMin: envelope.ogMin,
    ogMax: envelope.ogMax,
    fgMin: envelope.fgMin,
    fgMax: envelope.fgMax,
    abvMin: envelope.abvMin,
    abvMax: envelope.abvMax,
  });
  if (vertices.length < 3) return null;
  let min = Infinity;
  let max = -Infinity;
  for (const [oe, ae] of vertices) {
    const aa = ((oe - ae) / oe) * 100;
    if (aa < min) min = aa;
    if (aa > max) max = aa;
  }
  return [min, max];
}

function deduction(z, { weight, lambda, k }) {
  if (z <= 0) return 0;
  return weight * (1 - Math.exp(-lambda * Math.pow(z, k)));
}

export function styleConformance(realized, envelope) {
  const { og, fg, abv, ibu, srm } = realized;

  const dims = {};
  dims.og = complete(envelope.ogMin, envelope.ogMax)
    ? statusFor(og, envelope.ogMin, envelope.ogMax, TAU.og)
    : null;
  dims.fg = complete(envelope.fgMin, envelope.fgMax)
    ? statusFor(fg, envelope.fgMin, envelope.fgMax, TAU.fg)
    : null;
  dims.abv = complete(envelope.abvMin, envelope.abvMax)
    ? statusFor(abv, envelope.abvMin, envelope.abvMax, TAU.abv)
    : null;
  dims.ibu = complete(envelope.ibuMin, envelope.ibuMax)
    ? statusFor(ibu, envelope.ibuMin, envelope.ibuMax, TAU.ibu)
    : null;
  dims.srm = complete(envelope.srmMin, envelope.srmMax)
    ? statusFor(srm, envelope.srmMin, envelope.srmMax, TAU.srm)
    : null;

  const oe = sgToPlato(og);
  const ae = sgToPlato(fg);
  const aaPct = ((oe - ae) / oe) * 100;
  const aaBounds =
    dims.og && dims.fg && dims.abv ? aaRange(envelope) : null;
  dims.aa = aaBounds ? statusFor(aaPct, aaBounds[0], aaBounds[1], TAU.aa) : null;

  const gpOg = 1000 * (og - 1);
  const buguBounds =
    dims.ibu && dims.og && envelope.ogMin > 1
      ? [
          envelope.ibuMin / (1000 * (envelope.ogMax - 1)),
          envelope.ibuMax / (1000 * (envelope.ogMin - 1)),
        ]
      : null;
  dims.bugu =
    gpOg > 0 && buguBounds
      ? statusFor(ibu / gpOg, buguBounds[0], buguBounds[1], TAU.bugu)
      : null;

  const z = (id) => (dims[id] ? dims[id].z : 0);
  const zOg = z("og");
  const zFg = z("fg");
  const zAbv = z("abv");
  const zIbu = z("ibu");
  const zSrm = z("srm");
  const zAa = z("aa");
  const zBugu = z("bugu");

  const pillarZ = {
    visual: zSrm,
    gravity: 0.65 * Math.max(zOg, zAbv) + 0.35 * Math.sqrt((zOg * zOg + zAbv * zAbv) / 2),
    fermentation: 0.6 * zFg + 0.4 * zAa,
    balance: 0.55 * zIbu + 0.45 * zBugu,
  };

  const pillars = {};
  let total = 0;
  for (const [id, spec] of Object.entries(PILLARS)) {
    const pz = pillarZ[id];
    const d = deduction(pz, spec);
    total += d;
    pillars[id] = { z: pz, deduction: d, note: spec.label };
  }

  const hasBaseline = Object.values(dims).some(Boolean);
  const sai = hasBaseline ? Math.max(0, Math.min(100, 100 - (100 * total) / TOTAL_WEIGHT)) : null;

  return {
    hasBaseline,
    sai: sai === null ? null : Math.round(sai * 10) / 10,
    dimensions: dims,
    pillars,
  };
}
