// Pure text providers for checklist steps that need a list or a derived
// sentence. Providers receive the engine and the shared formatter; they never
// write state or touch the DOM.

import { BREW_DAY_NODES as N } from "../../registry/brew-day.js";
import { getCanonicalRest } from "../../mash.js";
import { DRY_HOP_VALUE_LABELS } from "../../registry/dry-hops.js";
import { reportError } from "../../../observability.js";

const ADDITIONS = [
  ["gypsum", "gypsum_kg"],
  ["calcium chloride", "cacl2_kg"],
  ["Epsom salt", "epsom_kg"],
  ["salt", "nacl_kg"],
  ["acid", "acid_l"],
  ["baking soda", "baking_soda_kg"],
  ["chalk", "chalk_kg"],
  ["pickling lime", "pickling_lime_kg"],
];

function boundaryReady(engine, id) {
  try {
    return engine.get(id) != null;
  } catch (err) {
    if (!String(err?.message ?? "").includes("Unsupported type in fingerprint")) {
      reportError("checklist.boundary", err);
    }
    return false;
  }
}

function resolveValue(engine, path) {
  try {
    return engine.resolve(path);
  } catch (err) {
    reportError("checklist.resolve", err);
    return undefined;
  }
}

function positive(engine, base, leaf) {
  const path = `${base}.${leaf}`;
  const value = resolveValue(engine, path);
  return typeof value === "number" && value > 0 ? path : null;
}

function additionList(engine, fmt, base) {
  return ADDITIONS.map(([label, leaf]) => {
    const path = positive(engine, base, leaf);
    return path ? `${label} ${fmt.path(path)}` : null;
  }).filter(Boolean);
}

function enabledRests(engine) {
  return (engine.get(N.rests) ?? []).filter((rest) => rest?.enabled);
}

function hopName(row) {
  return row?.name || row?.variety || "hop";
}

function dryHopLabel(group, value) {
  return DRY_HOP_VALUE_LABELS[group]?.[value] ?? String(value ?? "").replaceAll("_", " ");
}

const PROVIDERS = {
  "waterSetup": ({ engine, fmt }) => {
    const fill = resolveValue(engine, N.hltStart);
    const tablets = Math.max(1, Math.ceil((Number(fill) || 0) / 56.781));
    const tabletWord = tablets === 1 ? "tablet" : "tablets";
    return (
      `Fill the HLT to ${fmt.path(N.hltStart)}. Add ${tablets} crushed metabisulfite ` +
      `${tabletWord} (1 per 15 US gal). Water and metabisulfite only — no salts or acid ` +
      `yet. Heat to ${fmt.path(N.strikeTemp)}.`
    );
  },
  "waterDoughIn": ({ engine, fmt }) => {
    const list = boundaryReady(engine, N.waterBoundary)
      ? additionList(engine, fmt, N.mashAdditions)
      : [];
    const additions = list.length > 0 ? list.join(", ") : "the planned mash additions";
    return `Dose the dry grist before underletting: ${additions}. Sized for the ${fmt.path(
      N.strikeVolume
    )} strike.`;
  },
  "waterSparge": ({ engine, fmt }) => {
    if (!boundaryReady(engine, N.waterBoundary)) {
      return "After the strike is drawn and the HLT is topped up: add the planned sparge dose to the HLT. Stir to dissolve, then underlet.";
    }
    const list = additionList(engine, fmt, N.spargeAdditions);
    const additions = list.length > 0 ? list.join(", ") : "no additions";
    return (
      `After the strike is drawn and the HLT is topped up to ${fmt.path(N.hltTarget)}: ` +
      `add ${additions} to the HLT. Stir to dissolve, then underlet. ` +
      `${fmt.path(N.spargeDeliverable)} ships.`
    );
  },
  "mashSchedule": ({ engine, fmt }) => {
    const rests = enabledRests(engine)
      .filter((rest) => rest.rest_id !== "mash_out")
      .map((rest) => {
        const name = getCanonicalRest(rest.rest_id)?.name ?? rest.rest_id;
        const temp = fmt.field(N.restTemp, rest.use_temp_c);
        const duration = fmt.field(N.restDuration, rest.duration_min);
        return `${name} at ${temp} for ${duration}`;
      });
    return rests.length > 0 ? rests.join("; ") : "No rests enabled.";
  },
  "boilHops": ({ engine, fmt }) => {
    const authored = engine.get(N.boilHops) ?? [];
    const solvedRows = boundaryReady(engine, N.hopBoundary)
      ? resolveValue(engine, N.boilRows)
      : [];
    const solved = Array.isArray(solvedRows) ? solvedRows : [];
    const boilMinutes = Number(resolveValue(engine, N.boilTime)) || 0;
    const list = authored.map((row, index) => {
      const minutes = solved[index]?.minutes ?? (Number(row.boil_time_fraction) || 0) * boilMinutes;
      const mass = fmt.field(N.boilMass, solved[index]?.mass_kg);
      return `${mass} ${hopName(row)} at ${fmt.field(N.boilTime, minutes)}`;
    });
    return list.length > 0 ? `Add ${list.join("; ")}.` : "No boil hops.";
  },
  "whirlpoolHops": ({ engine, fmt }) => {
    const rows = engine.get(N.whirlpoolHops) ?? [];
    const list = rows.map((row) => {
      const at = fmt.field(N.whirlpoolAddition, row.addition_at_min);
      const temp = fmt.field(N.whirlpoolTemp, row.initial_temp_c);
      return `${hopName(row)} at ${at} after flameout, ${temp}`;
    });
    return list.length > 0 ? `Add ${list.join("; ")}; knock out at the set time.` : "No whirlpool hops.";
  },
  "dryHopSchedule": ({ engine, fmt }) => {
    const rows = engine.get(N.dryHops) ?? [];
    const list = rows.map((row) => {
      const quantity = fmt.field(N.dryHopQuantity, row.quantity);
      return `${quantity} ${row.unit ?? "g"} ${hopName(row)} at ${dryHopLabel(
        "hop_application_event",
        row.application_event
      )}; contact until ${dryHopLabel("hop_contact_until", row.contact_until)}`;
    });
    return list.length > 0 ? list.join("; ") : "No dry hops.";
  },
};

export const PROVIDER_IDS = Object.keys(PROVIDERS);

export function providerText(key, ctx) {
  const provider = PROVIDERS[key];
  return provider ? provider(ctx) : null;
}
