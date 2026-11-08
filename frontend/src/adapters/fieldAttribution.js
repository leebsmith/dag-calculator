// Field attribution: maps artifact paths and relation predicates onto the step
// slice that owns them. Keeps cards and violation badges on the same manifest.

import { compileExpression } from "../engine/expression.js";
import { resolveReference } from "../engine/index.js";

function fieldKey(artifact, path) {
  const ref = resolveReference(artifact, path);
  return ref ? ref.path : null;
}

function predicatePaths(predicate) {
  if (typeof predicate !== "string") return [];
  return compileExpression(predicate).paths.filter((path) => {
    if (path === "null" || path === "$value" || path === "$context" || path === "row") {
      return false;
    }
    return !path.startsWith("row.") && !path.startsWith("constants.");
  });
}

export function createFieldAttribution(artifact, steps) {
  const fieldSlice = new Map();
  for (const step of steps) {
    for (const entry of step.fields) {
      const id =
        typeof entry === "object" && entry.collection
          ? entry.collection
          : typeof entry === "string"
            ? entry
            : entry.id;
      if (!id) continue;
      const key = fieldKey(artifact, id);
      if (key && !fieldSlice.has(key)) fieldSlice.set(key, step.slice);
    }
  }

  const selectionSlice = new Map();
  for (const step of steps) {
    for (const entry of step.fields) {
      const id = typeof entry === "string" ? entry : entry.id;
      if (!id) continue;
      for (const [selId, node] of Object.entries(artifact.nodes)) {
        if (node.kind === "selection" && node.ref === id) selectionSlice.set(selId, step.slice);
      }
    }
  }

  const refToSelectionMap = new Map();
  for (const [id, node] of Object.entries(artifact.nodes)) {
    if (node.kind === "selection") refToSelectionMap.set(node.ref, id);
  }

  function sliceForPath(path) {
    const ref = resolveReference(artifact, path);
    return (
      fieldSlice.get(fieldKey(artifact, path)) ??
      (ref?.kind === "node" && selectionSlice.get(ref.nodeId)) ??
      path.split(".")[0]
    );
  }

  function relationSlices(predicate) {
    const slices = new Set();
    for (const path of predicatePaths(predicate)) slices.add(sliceForPath(path));
    return slices;
  }

  const initialStepStatus = Object.fromEntries(
    steps.map((step) => [step.slice, { relations: [], domains: [] }])
  );

  return {
    fieldSlice,
    selectionSlice,
    refToSelectionMap,
    sliceForPath,
    relationSlices,
    initialStepStatus,
  };
}
