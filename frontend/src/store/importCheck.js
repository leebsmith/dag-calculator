// The check stage and the commit: solve the projection, then make a batch.

import { reportError } from "../observability.js";

// A routing decision the ledger makes (no IBU split, a flameout in the boil, a
// second mapped yeast) is a gate finding even though no solver was involved: the
// batch is wrong without it. The finding keeps whatever the ledger attached to it
// (`yeasts` names the strains), so the Check screen can offer the decision itself.
export function mergeFindings(result, extra = []) {
  const findings = [
    ...result.findings,
    ...extra.map(({ blocking, code, message, node, ...rest }) => ({
      node: node ?? "ledger",
      severity: blocking ? "blocking" : "advisory",
      code,
      message,
      ...rest,
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
        ok:
          this.gate.blocking.length === 0 &&
          this.unresolved.length === 0 &&
          this.sectionIssues.length === 0,
        blocking: this.gate.blocking.length,
        advisory: this.gate.advisory.length,
        unresolved: this.unresolved.length,
        sections: this.sectionIssues.length,
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
          targetProfile: this.targetProfile,
          yeastOutcome: this.yeastOutcome,
        });
        const result = mergeFindings(await gate(state), [...this.hopFindings]);
        this.gate = result;
        this.projectedState = state;
        this.delta = delta
          ? delta({ payload: this.payload, ledger: this.ledger, engine: result.engine })
          : null;
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

export function commitActions({ commit = null }) {
  return {
    // Everything that must be true before a batch exists, in one place.
    commitBlocker() {
      if (!this.record) return "No import is open.";
      if (this.commitBusy) return null;
      if (!commit) return "Committing is not wired in this build.";
      if (!this.checkSummary?.ok) return "Run the check first: the gate is not green.";
      return null;
    },

    // The only action that creates a batch: the gate's own criterion, enforced.
    async commit() {
      const blocked = this.commitBlocker();
      if (blocked) {
        this.checkError = blocked;
        return null;
      }
      this.commitBusy = true;
      this.checkError = null;
      // The record keeps the comparison it was committed with, so the batch's
      // provenance panel can show it without re-running a boundary.
      this.record = { ...this.record, delta: this.delta };
      try {
        const active = await commit({
          record: this.record,
          state: this.projectedState,
          name: this.payload?.title || this.summary?.filename || "Imported batch",
        });
        this.close();
        return active;
      } catch (err) {
        this.checkError = err?.message ?? "The batch could not be created.";
        reportError("importReview.commit", err);
        return null;
      } finally {
        this.commitBusy = false;
      }
    },
  };
}
