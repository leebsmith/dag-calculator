// Dimension system: unit conversion and dimension checking (dimensions.md).

import { resolveReference } from "./paths.js";

// Transform kinds and their direction conventions (matching artifact.json):
//   linear     : base = unit * factor           (toBase multiplies)
//   affine     : unit = base * factor + offset  (fromBase applies offset)
//   nonlinear  : fwd = base -> unit, inv = unit -> base
//   identity   : no conversion

export function toBase(artifact, dimensionId, unitId, value, nonlinearFns = {}) {
  if (unitId === undefined || unitId === null) return value;
  const dim = artifact.dimensions[dimensionId];
  if (!dim) throw new Error(`Unknown dimension "${dimensionId}"`);
  if (unitId === dim.base_unit) return value;
  const unit = dim.units[unitId];
  if (!unit) throw new Error(`Unknown unit "${unitId}" for dimension "${dimensionId}"`);
  switch (dim.kind) {
    case "linear":
      return value * unit.factor;
    case "affine":
      return (value - unit.offset) / unit.factor;
    case "nonlinear":
      return applyNonlinear(unit.inv, value, nonlinearFns);
    case "identity":
      return value;
    default:
      throw new Error(`Unknown transform kind "${dim.kind}"`);
  }
}

export function fromBase(artifact, dimensionId, unitId, value, nonlinearFns = {}) {
  if (unitId === undefined || unitId === null) return value;
  const dim = artifact.dimensions[dimensionId];
  if (!dim) throw new Error(`Unknown dimension "${dimensionId}"`);
  if (unitId === dim.base_unit) return value;
  const unit = dim.units[unitId];
  if (!unit) throw new Error(`Unknown unit "${unitId}" for dimension "${dimensionId}"`);
  switch (dim.kind) {
    case "linear":
      return value / unit.factor;
    case "affine":
      return value * unit.factor + unit.offset;
    case "nonlinear":
      return applyNonlinear(unit.fwd, value, nonlinearFns);
    case "identity":
      return value;
    default:
      throw new Error(`Unknown transform kind "${dim.kind}"`);
  }
}

function applyNonlinear(fnId, value, nonlinearFns) {
  const fn = nonlinearFns[fnId];
  if (typeof fn !== "function") {
    throw new Error(`Nonlinear transform "${fnId}" not provided`);
  }
  return fn(value);
}

// Dimension checking (dimensions.md §5): affine absolute temperatures may not
// be added to themselves, but may be combined with their linear delta.
export function inferAddDimension(artifact, dimA, dimB) {
  if (dimA === "temperature" && dimB === "temperature") {
    throw new Error('Cannot add two "temperature" values (affine absolute quantities)');
  }
  if (dimA === dimB) return dimA;
  if (
    (dimA === "temperature" && dimB === "temperature_delta") ||
    (dimA === "temperature_delta" && dimB === "temperature")
  ) {
    return "temperature";
  }
  throw new Error(`Dimension mismatch: cannot add "${dimA}" and "${dimB}"`);
}

export function inferSubDimension(artifact, dimA, dimB) {
  if (dimA === "temperature" && dimB === "temperature") return "temperature_delta";
  if (dimA === dimB) return dimA;
  if (dimA === "temperature" && dimB === "temperature_delta") return "temperature";
  throw new Error(`Dimension mismatch: cannot subtract "${dimB}" from "${dimA}"`);
}

export function nodeDimension(artifact, nodeId) {
  const node = artifact.nodes[nodeId];
  if (!node) return null;
  if (node.kind === "root") return node.dimension;
  if (node.kind === "choice") return node.taxonomy;
  if (node.kind === "derived") {
    if (node.output.dimension) return node.output.dimension;
    if (node.output.taxonomy) return node.output.taxonomy;
    if (node.output.type === "boolean") return "boolean";
    return null;
  }
  return null;
}

// Static dimension inference for derived-node expressions. Returns a dimension
// id, "boolean", "dimensionless", "collection", or null when indeterminate
// (e.g. compound products or reduction bodies over collection items).
export function inferExprDimension(artifact, expr, inputDims = {}) {
  if (expr === null || typeof expr !== "object") {
    if (typeof expr === "number") return "dimensionless";
    return null;
  }
  const dim = (e) => inferExprDimension(artifact, e, inputDims);
  if ("ref" in expr) {
    if (Object.prototype.hasOwnProperty.call(inputDims, expr.ref)) {
      return inputDims[expr.ref];
    }
    const r = resolveReference(artifact, expr.ref);
    if (!r) return null;
    if (r.suffix.length === 0) return nodeDimension(artifact, r.nodeId);
    return null; // selection/boundary field dimension not inferred here
  }
  if ("const" in expr) return artifact.constants[expr.const]?.dimension ?? null;
  if ("call" in expr) return artifact.functions[expr.call]?.returns ?? null;
  if ("op" in expr) {
    switch (expr.op) {
      case "+":
        return inferAddDimension(artifact, dim(expr.args[0]), dim(expr.args[1]));
      case "-":
        return inferSubDimension(artifact, dim(expr.args[0]), dim(expr.args[1]));
      case "gt":
      case "ge":
      case "lt":
      case "le":
      case "eq":
      case "ne":
      case "and":
      case "or":
      case "not":
        return "boolean";
      case "if": {
        const then = dim(expr.args[1]);
        const els = dim(expr.args[2]);
        return then === els ? then : null;
      }
      default:
        return null; // *, /, neg, pow -> compound, unchecked
    }
  }
  if ("coll" in expr) {
    switch (expr.op) {
      case "sum":
        return dim(expr.body);
      case "weighted_avg":
      case "min":
        return dim(expr.value);
      case "map":
      case "filter":
        return "collection";
      default:
        return null;
    }
  }
  return null;
}

// Verify every dimensioned derived node's expression is dimension-consistent.
export function validateDerivedDimensions(artifact) {
  for (const [id, node] of Object.entries(artifact.nodes)) {
    if (node.kind !== "derived" || !node.output.dimension) continue;
    const inputDims = {};
    for (const [alias, path] of Object.entries(node.inputs)) {
      const r = resolveReference(artifact, path);
      inputDims[alias] =
        r && r.suffix.length === 0 ? nodeDimension(artifact, r.nodeId) : null;
    }
    const inferred = inferExprDimension(artifact, node.expr, inputDims);
    if (inferred !== null && inferred !== node.output.dimension) {
      throw new Error(
        `Derived "${id}" declares dimension "${node.output.dimension}" ` +
          `but its expression infers "${inferred}"`
      );
    }
  }
}
