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

// The declared value type of a node, normalized across kinds. Scalars carry
// their type at the top level (dimension/taxonomy); every other kind declares it
// as `output` (selection/derived) or names its element type on the node
// (collection). Boundary outputs are per-output, so a boundary has no single
// spec. Returns one of {dimension} | {taxonomy} | {type} | {schema} |
// {item_schema}, or null when the node has no single value type.
export function valueSpecOf(artifact, nodeId) {
  const node = artifact.nodes[nodeId];
  if (!node) return null;
  switch (node.kind) {
    case "root":
      return { dimension: node.dimension };
    case "choice":
      return { taxonomy: node.taxonomy };
    case "derived":
      return node.output ?? null;
    case "selection":
      return node.output ?? null;
    case "collection":
      return { item_schema: node.item_schema };
    default:
      return null;
  }
}

export function nodeDimension(artifact, nodeId) {
  const spec = valueSpecOf(artifact, nodeId);
  if (!spec) return null;
  if (spec.dimension) return spec.dimension;
  if (spec.taxonomy) return spec.taxonomy;
  if (spec.type === "boolean") return "boolean";
  return null;
}

// Static dimension inference for derived-node expressions. Returns a dimension
// id, "boolean", "dimensionless", "collection", or null when indeterminate
// (compound products, or operands whose dimension can't be resolved).
//
// `elem` binds a reduction's element alias to its collection item schema, so
// `rest.use_temp_c` resolves to the schema field's dimension. Dotted refs into
// a boundary output / selection / collection field resolve via their declared
// dimension. Dimensionless scalars (dimensionless, percentage) are absorbed by
// `*` and `/` (e.g. mass * percentage -> mass); other compound products stay
// indeterminate.
const SCALAR_DIMS = new Set(["dimensionless", "percentage"]);

export function inferExprDimension(artifact, expr, inputDims = {}, ctx = {}) {
  if (expr === null || typeof expr !== "object") {
    if (typeof expr === "number") return "dimensionless";
    return null;
  }
  const { elem = null, collSchemas = {} } = ctx;
  const dim = (e) => inferExprDimension(artifact, e, inputDims, ctx);
  if ("ref" in expr) {
    const name = expr.ref;
    if (elem && typeof name === "string" && name.startsWith(elem.alias + ".")) {
      const spec = elem.schema?.[name.slice(elem.alias.length + 1)];
      return spec ? spec.dimension ?? spec.taxonomy ?? null : null;
    }
    if (Object.prototype.hasOwnProperty.call(inputDims, name)) return inputDims[name];
    const r = resolveReference(artifact, name);
    if (!r) return null;
    if (r.kind === "identity") {
      const schemaId = artifact.identity?.[r.namespace];
      const spec = artifact.primitive_schemas?.[schemaId]?.[r.suffix[0]];
      return spec ? spec.dimension ?? spec.taxonomy ?? null : null;
    }
    const node = artifact.nodes[r.nodeId];
    if (r.suffix.length === 0) return nodeDimension(artifact, r.nodeId);
    const suffix = r.suffix.join(".");
    if (node?.kind === "boundary") {
      const out = node.outputs?.[suffix];
      return out ? out.dimension ?? out.taxonomy ?? (out.type === "boolean" ? "boolean" : null) : null;
    }
    if (node?.kind === "selection" || node?.kind === "collection") {
      const spec = valueSpecOf(artifact, r.nodeId);
      const schemaId = spec?.schema ?? spec?.item_schema;
      const fieldSpec = artifact.primitive_schemas?.[schemaId]?.[r.suffix[0]];
      return fieldSpec ? fieldSpec.dimension ?? fieldSpec.taxonomy ?? null : null;
    }
    return null;
  }
  if ("const" in expr) return artifact.constants[expr.const]?.dimension ?? null;
  if ("call" in expr) return artifact.functions[expr.call]?.returns ?? null;
  if ("op" in expr && !("coll" in expr)) {
    switch (expr.op) {
      case "+":
        return inferAddDimension(artifact, dim(expr.args[0]), dim(expr.args[1]));
      case "-":
        return inferSubDimension(artifact, dim(expr.args[0]), dim(expr.args[1]));
      case "neg":
        return dim(expr.args[0]);
      case "*": {
        const ds = expr.args.map(dim);
        if (ds.some((d) => d === null)) return null;
        const nonScalar = ds.filter((d) => !SCALAR_DIMS.has(d));
        if (nonScalar.length === 0) return "dimensionless";
        return nonScalar.length === 1 ? nonScalar[0] : null;
      }
      case "/": {
        const ds = expr.args.map(dim);
        if (ds.some((d) => d === null)) return null;
        const denominator = ds.slice(1).filter((d) => !SCALAR_DIMS.has(d));
        return denominator.length === 0 ? ds[0] : null;
      }
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
        return null; // pow -> compound, unchecked
    }
  }
  if ("coll" in expr) {
    const collName = expr.coll?.ref;
    let itemSchema = collName ? collSchemas[collName] : null;
    if (!itemSchema && collName) {
      const r = resolveReference(artifact, collName);
      const cn = r?.kind === "node" ? artifact.nodes[r.nodeId] : null;
      if (cn?.kind === "collection") itemSchema = cn.item_schema;
    }
    const schema = itemSchema ? artifact.primitive_schemas?.[itemSchema] ?? {} : {};
    const bound = { ...ctx, elem: { alias: expr.as ?? "", schema } };
    const elemDim = (e) => inferExprDimension(artifact, e, inputDims, bound);
    switch (expr.op) {
      case "sum":
        return elemDim(expr.body);
      case "weighted_avg":
      case "min":
        return elemDim(expr.value);
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
    const collSchemas = {};
    for (const [alias, path] of Object.entries(node.inputs)) {
      // Infer the alias's dimension from its full path (boundary output,
      // selection/collection field, or node), not just the node.
      inputDims[alias] = inferExprDimension(artifact, { ref: path }, {});
      const r = resolveReference(artifact, path);
      const cn = r?.kind === "node" && r.suffix.length === 0 ? artifact.nodes[r.nodeId] : null;
      if (cn?.kind === "collection") collSchemas[alias] = cn.item_schema;
    }
    const inferred = inferExprDimension(artifact, node.expr, inputDims, { collSchemas });
    if (inferred !== null && inferred !== node.output.dimension) {
      throw new Error(
        `Derived "${id}" declares dimension "${node.output.dimension}" ` +
          `but its expression infers "${inferred}"`
      );
    }
  }
}
