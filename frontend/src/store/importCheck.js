// The check stage: project the ledger, solve it, and read the delta.
//
// The work is injected — projection, gate and delta are adapter-layer functions —
// so the store stays node-testable and the composition root owns the wiring.

import { reportError } from "../observability.js";

// A routing decision the ledger makes (no IBU split, a flameout in the boil) is a
// gate finding even though no solver was involved: the batch is wrong without it.
export function mergeFindings(result, extra = []) {
  const findings = [
    ...result.findings,
    ...extra.map((finding) => ({
      node: "hops",
      severity: finding.blocking ? "blocking" : "advisory",
      code: finding.code,
      message: finding.message,
    })),
  ];
  return {
    ...result,
    findings,
    blocking: findings.filter((finding) => finding.severity === "blocking"),
    advisory: findings.filter((finding) => finding.severity === "advisory"),
  };
}

export function checkActions({ catalog, project, gate, delta }) {
  return {
    get checkSummary() {
      if (!this.gate) return null;
      return {
        ok: this.gate.blocking.length === 0 && this.unresolved.length === 0,
        blocking: this.gate.blocking.length,
        advisory: this.gate.advisory.length,
        unresolved: this.unresolved.length,
      };
    },

    // An explicit press: the gate costs three solver calls, and reviewing a
    // mapping is a deliberate act, not a keystroke.
    async runCheck() {
      if (!this.record || this.checkBusy) return null;
      if (!project || !gate) {
        this.checkError = "The check is not wired in this build.";
        return null;
      }
      this.checkBusy = true;
      this.checkError = null;
      try {
        const state = project({
          payload: this.payload,
          ledger: this.ledger,
          identity: this.record.identity,
          catalog,
          fraction: this.poolFraction ?? this.printedPoolFraction,
        });
        const result = mergeFindings(await gate(state), this.hopFindings);
        this.gate = result;
        this.delta = delta ? delta({ payload: this.payload, ledger: this.ledger, engine: result.engine }) : null;
        this.stage = "check";
        return result;
      } catch (err) {
        this.checkError = err?.message ?? "The check could not run.";
        reportError("importReview.runCheck", err);
        return null;
      } finally {
        this.checkBusy = false;
      }
    },
  };
}
