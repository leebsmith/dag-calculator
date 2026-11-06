// The import gate: solve the projected candidate and report what it cannot do.
//
// This does not reimplement the editor's solve path — it builds a private engine
// from the projected state and drives the *same* boundary runner the editor uses,
// so a gate result and a live result can never disagree. It runs once, headless,
// on an explicit press.
//
// Two rules from the plan:
// - **Red blocks.** A batch or hop failure, a blocking relation, or an
//   unresolved line means the import does not exist yet.
// - **Water is advisory.** Its targets are the user's own constraints, so a salt
//   solve failure is reported with a pointer, not as a veto.

import artifact from "../engine/artifact.json" with { type: "json" };
import { createEngine } from "../engine/dag.js";
import { BOUNDARY_BUILDERS } from "./boundaryRequest.js";
import { createBoundaryRunner } from "./boundaryRunner.js";
import { ignoreError } from "../observability.js";
import { unresolvedRows } from "../views/import/ledger.js";

export const GATE_NODES = ["solver.batch", "solver.hops", "solver.water"];
export const ADVISORY_NODES = new Set(["solver.water"]);

export async function runGate({ state, references = {}, api, fetchImpl, reportError = ignoreError }) {
  const engine = createEngine(artifact, {
    identity: state.identity ?? {},
    roots: state.roots ?? {},
    collections: state.collections ?? {},
    selections: state.selections ?? {},
    references,
    boundaryRequests: BOUNDARY_BUILDERS,
  });

  // Water is advisory and its targets are the user's own: without a chosen
  // target profile the request has nothing to solve for, so the boundary is
  // skipped and said so rather than reported as a failure.
  const hasWaterTargets = Boolean(state.selections?.["water.target_profile"]);
  const nodes = hasWaterTargets ? GATE_NODES : GATE_NODES.filter((node) => node !== "solver.water");

  const runner = createBoundaryRunner({
    session: { boundaryNodes: nodes, getEngine: () => engine },
    remote: true,
    api,
    fetchImpl,
    compute: () => {},
  });
  await runner.solveNow();

  const water = hasWaterTargets ? waterSummary(engine, reportError) : null;
  const findings = failureFindings(runner.statuses, nodes, buildErrors(engine, runner.statuses, nodes, reportError));
  if (!hasWaterTargets) {
    findings.push({
      node: "solver.water",
      severity: "advisory",
      code: "WATER_TARGETS_NOT_SET",
      message: "no water target profile chosen, so the water boundary was not run",
    });
  }
  findings.push(...blockingFindings(engine));
  return {
    engine,
    water,
    statuses: { ...runner.statuses },
    findings,
    blocking: findings.filter((finding) => finding.severity === "blocking"),
    advisory: findings.filter((finding) => finding.severity === "advisory"),
  };
}

// A boundary that never ran is worth explaining: "could not run" hides whether a
// solver refused or the request could not even be built. Asking again now that the
// other boundaries have landed gives the real reason.
function buildErrors(engine, statuses, nodes, reportError) {
  const out = {};
  for (const node of nodes) {
    if (statuses[node] === "ok") continue;
    try {
      engine.boundaryRequest(node);
    } catch (err) {
      // Captured, not swallowed: the message becomes the finding's explanation.
      reportError("importGate.buildErrors", err);
      out[node] = err?.message ?? String(err);
    }
  }
  return out;
}

function failureFindings(statuses, nodes, reasons = {}) {
  return nodes.filter((node) => statuses[node] !== "ok").map((node) => ({
    node,
    severity: ADVISORY_NODES.has(node) ? "advisory" : "blocking",
    code: statuses[node] === "blocked" ? "BLOCKED" : "SOLVE_FAILED",
    message: reasons[node] ?? "the solver could not reach an answer",
  }));
}

// A violated relation the artifact declares blocking is a red gate, exactly as it
// is at freeze. `relationStates` is the engine's own evaluation.
function blockingFindings(engine) {
  return engine
    .relationStates()
    .filter((state) => state.blocking && state.holds === false)
    .map((state) => ({
      node: "relations",
      severity: "blocking",
      code: state.id,
      message: `relationship "${state.id}" does not hold for this batch`,
    }));
}

// What the water boundary prescribed, when it ran. A skipped boundary is absence,
// not a zero, so the whole block disappears rather than reading "pH 0".
export function waterSummary(engine, reportError = ignoreError) {
  const read = (path) => {
    try {
      const value = engine.resolve(path);
      return typeof value === "number" && Number.isFinite(value) ? value : null;
    } catch (err) {
      reportError("importGate.waterSummary", err);
      return null;
    }
  };
  const ph = read("solver.water.prescription.predicted_mash_ph");
  if (ph == null) return null;
  return {
    ph,
    strategy: read("solver.water.strategy"),
    status: read("solver.water.prescription.mash_ph_status"),
    gypsum_g: grams(read("solver.water.mash_additions.gypsum_kg")),
    cacl2_g: grams(read("solver.water.mash_additions.cacl2_kg")),
    acid_ml: grams(read("solver.water.mash_additions.acid_l")),
  };
}

function grams(value) {
  return value == null ? null : Math.round(value * 1000);
}

export function gateSummary({ blocking = [], advisory = [], findings = [] }, ledger = []) {
  const unresolved = unresolvedRows(ledger);
  return {
    ok: blocking.length === 0 && unresolved.length === 0,
    blocking: blocking.length,
    advisory: advisory.length,
    unresolved: unresolved.length,
    total: findings.length,
  };
}
