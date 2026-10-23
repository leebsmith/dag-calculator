// Dynamic valuation orchestrator: dispatches each projected field to its
// scalar/collection/table valuator and decorates scalars with conformance and
// seed provenance.

import { valuateCollection } from "./collection.js";
import { decorateConformance } from "./conformance.js";
import { decorateProvenance } from "./provenance.js";
import { projectFields } from "./projection.js";
import { valuateScalar } from "./scalar.js";
import { valuateTable } from "./table.js";

export function nonlinearFns(artifact, engine) {
  const fns = {};
  for (const dim of Object.values(artifact.dimensions ?? {})) {
    if (dim.kind !== "nonlinear") continue;
    for (const unit of Object.values(dim.units ?? {})) {
      fns[unit.fwd] = (v) => engine.call(unit.fwd, [v]);
      fns[unit.inv] = (v) => engine.call(unit.inv, [v]);
    }
  }
  return fns;
}

// AI AGENT HOOKS: Use this valuation entry point for resolving projected fields.
// Do not duplicated this logic elsewhere.
export function valuate(fields, engine, ctx = {}) {
  const { ui, artifact } = ctx;
  const unitMode = ui?.unitMode ?? {};
  const collectionDomains = ctx.collectionDomains ?? {};
  const nl = nonlinearFns(artifact, engine);

  return fields
    .map((field) => {
      // Empty-selection guard: selection-derived fields are deferred until the
      // reference root names a real component (default "" is "none chosen").
      if (field.selectionRef && engine.get(field.selectionRef) === "") return null;
      if (field.control === "collection-table") {
        return valuateCollection(field, engine, artifact, collectionDomains, nl);
      }
      if (field.control === "readout-table") {
        return valuateTable(field, artifact, engine, unitMode, nl, ctx.registry ?? {});
      }
      const out = valuateScalar(field, engine, ctx, nl);
      if (!out) return null;
      decorateConformance(out, field, ctx);
      return decorateProvenance(out, field, engine, artifact);
    })
    .filter(Boolean);
}

export function produce(artifact, steps, registry, engine, ctx = {}) {
  return valuate(projectFields(artifact, steps, registry, ctx), engine, {
    ...ctx,
    artifact,
    registry,
  });
}
