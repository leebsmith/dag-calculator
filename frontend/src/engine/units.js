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

// Comparison and logic operators share one result type, so they need no handler.
const BOOLEAN_OPS = new Set(["gt", "ge", "lt", "le", "eq", "ne", "and", "or", "not"]);

// One handler per operator: it reads the operand dimensions through `dim` and
// returns the expression's. The dispatcher below stays a shape check.
const OPERATOR_DIMS = {
  "+": (artifact, dim, expr) => inferAddDimension(artifact, dim(expr.args[0]), dim(expr.args[1])),
  "-": (artifact, dim, expr) => inferSubDimension(artifact, dim(expr.args[0]), dim(expr.args[1])),
  neg: (artifact, dim, expr) => dim(expr.args[0]),
  "*": (artifact, dim, expr) => productDimension(expr.args.map(dim)),
  "/": (artifact, dim, expr) => quotientDimension(expr.args.map(dim)),
  if: (artifact, dim, expr) => branchDimension(dim(expr.args[1]), dim(expr.args[2])),
};

// Likewise per reduction: `sum` projects the body, the aggregates project their
// value, and `map`/`filter` stay collections.
const COLLECTION_DIMS = {
  sum: (elemDim, expr) => elemDim(expr.body),
  weighted_avg: (elemDim, expr) => elemDim(expr.value),
  min: (elemDim, expr) => elemDim(expr.value),
  max: (elemDim, expr) => elemDim(expr.value),
  map: () => "collection",
  filter: () => "collection",
};

function productDimension(dims) {
  if (dims.some((d) => d === null)) return null;
  const nonScalar = dims.filter((d) => !SCALAR_DIMS.has(d));
  if (nonScalar.length === 0) return "dimensionless";
  return nonScalar.length === 1 ? nonScalar[0] : null;
}

function quotientDimension(dims) {
  if (dims.some((d) => d === null)) return null;
  const denominator = dims.slice(1).filter((d) => !SCALAR_DIMS.has(d));
  return denominator.length === 0 ? dims[0] : null;
}

function branchDimension(thenDim, elseDim) {
  return thenDim === elseDim ? thenDim : null;
}

function operatorDimension(artifact, expr, dim) {
  const handler = OPERATOR_DIMS[expr.op];
  if (handler) return handler(artifact, dim, expr);
  return BOOLEAN_OPS.has(expr.op) ? "boolean" : null;
}

// `undefined` means "not an element alias", so a dotted ref that matched the
// alias but names no schema field still answers null instead of falling through.
function aliasDimension(elem, name) {
  if (!elem || typeof name !== "string" || !name.startsWith(elem.alias + ".")) return undefined;
  const spec = elem.schema?.[name.slice(elem.alias.length + 1)];
  return spec ? spec.dimension ?? spec.taxonomy ?? null : null;
}

function identityDimension(artifact, ref) {
  const schemaId = artifact.identity?.[ref.namespace];
  const spec = artifact.primitive_schemas?.[schemaId]?.[ref.suffix[0]];
  return spec ? spec.dimension ?? spec.taxonomy ?? null : null;
}

function boundaryOutputDimension(node, suffix) {
  const out = node.outputs?.[suffix];
  if (!out) return null;
  if (out.dimension) return out.dimension;
  if (out.taxonomy) return out.taxonomy;
  return out.type === "boolean" ? "boolean" : null;
}

function fieldSpecDimension(artifact, nodeId, suffix) {
  const spec = valueSpecOf(artifact, nodeId);
  const schemaId = spec?.schema ?? spec?.item_schema;
  const fieldSpec = artifact.primitive_schemas?.[schemaId]?.[suffix[0]];
  return fieldSpec ? fieldSpec.dimension ?? fieldSpec.taxonomy ?? null : null;
}

function nodeSuffixDimension(artifact, node, ref) {
  const suffix = ref.suffix.join(".");
  if (node?.kind === "boundary") return boundaryOutputDimension(node, suffix);
  if (node?.kind !== "selection" && node?.kind !== "collection") return null;
  return fieldSpecDimension(artifact, ref.nodeId, ref.suffix);
}

function referenceDimension(artifact, name, inputDims, ctx) {
  const alias = aliasDimension(ctx.elem, name);
  if (alias !== undefined) return alias;
  if (Object.prototype.hasOwnProperty.call(inputDims, name)) return inputDims[name];
  const ref = resolveReference(artifact, name);
  if (!ref) return null;
  if (ref.kind === "identity") return identityDimension(artifact, ref);
  if (ref.suffix.length === 0) return nodeDimension(artifact, ref.nodeId);
  return nodeSuffixDimension(artifact, artifact.nodes[ref.nodeId], ref);
}

function collectionItemSchema(artifact, expr, ctx) {
  const collName = expr.coll?.ref;
  if (!collName) return null;
  const known = ctx.collSchemas?.[collName];
  if (known) return known;
  const ref = resolveReference(artifact, collName);
  const node = ref?.kind === "node" ? artifact.nodes[ref.nodeId] : null;
  return node?.kind === "collection" ? node.item_schema : null;
}

function collectionDimension(artifact, expr, inputDims, ctx) {
  const itemSchema = collectionItemSchema(artifact, expr, ctx);
  const schema = itemSchema ? artifact.primitive_schemas?.[itemSchema] ?? {} : {};
  const bound = { ...ctx, elem: { alias: expr.as ?? "", schema } };
  const elemDim = (e) => inferExprDimension(artifact, e, inputDims, bound);
  const handler = COLLECTION_DIMS[expr.op];
  return handler ? handler(elemDim, expr) : null;
}

// The expression shapes, in the order the old switch checked them: a reduction
// carries `op` too, so `coll` wins when both are present.
const SHAPE_DIMS = {
  ref: (artifact, expr, dim, inputDims, ctx) => referenceDimension(artifact, expr.ref, inputDims, ctx),
  const: (artifact, expr) => artifact.constants[expr.const]?.dimension ?? null,
  call: (artifact, expr) => artifact.functions[expr.call]?.returns ?? null,
  op: (artifact, expr, dim) => operatorDimension(artifact, expr, dim),
  coll: (artifact, expr, dim, inputDims, ctx) => collectionDimension(artifact, expr, inputDims, ctx),
};

function shapeOf(expr) {
  if ("ref" in expr) return "ref";
  if ("const" in expr) return "const";
  if ("call" in expr) return "call";
  if ("coll" in expr) return "coll";
  if ("op" in expr) return "op";
  return "unknown";
}

export function inferExprDimension(artifact, expr, inputDims = {}, ctx = {}) {
  if (expr === null || typeof expr !== "object") {
    return typeof expr === "number" ? "dimensionless" : null;
  }
  const dim = (e) => inferExprDimension(artifact, e, inputDims, ctx);
  const handler = SHAPE_DIMS[shapeOf(expr)];
  return handler ? handler(artifact, expr, dim, inputDims, ctx) : null;
}

// Verify every root's non-literal default infers the root's declared dimension.
// Bare numbers are literals in the declared dimension; bare strings are only
// valid for reference roots.
function assertIfBranchesAgree(id, value, artifact) {
  if (value.op !== "if" || !Array.isArray(value.args) || value.args.length !== 3) return;
  const thenDimension = inferExprDimension(artifact, value.args[1], {});
  const elseDimension = inferExprDimension(artifact, value.args[2], {});
  if (thenDimension === null || elseDimension === null) return;
  if (thenDimension !== elseDimension) {
    throw new Error(
      `Root "${id}" default has if branches with dimensions "${thenDimension}" and "${elseDimension}"`
    );
  }
}

function assertRootDefaultDimension(id, node, value, artifact) {
  const inferred = inferExprDimension(artifact, value, {});
  if (inferred === null || inferred === node.dimension) return;
  throw new Error(
    `Root "${id}" declares dimension "${node.dimension}" but its default infers "${inferred}"`
  );
}

export function validateRootDefaults(artifact) {
  for (const [id, node] of Object.entries(artifact.nodes)) {
    if (node.kind !== "root") continue;
    const value = node.default;
    if (Array.isArray(value)) {
      throw new Error(`Root "${id}" default must be an expression or a scalar literal`);
    }
    if (value === null || typeof value !== "object") {
      if (typeof value === "string" && node.dimension !== "reference") {
        throw new Error(`Root "${id}" has a string default but dimension "${node.dimension}"`);
      }
      continue;
    }
    assertIfBranchesAgree(id, value, artifact);
    assertRootDefaultDimension(id, node, value, artifact);
  }
}

// Verify every dimensioned computed collection field is dimension-consistent.
// The field expression binds the reserved `row` alias to the item schema, so
// `row.pct` infers the authored field's dimension.
function fieldInputDimensions(spec, artifact) {
  const inputDims = {};
  for (const [alias, path] of Object.entries(spec.inputs ?? {})) {
    inputDims[alias] = inferExprDimension(artifact, { ref: path }, {});
  }
  return inputDims;
}

function assertCollectionFieldDimension(artifact, id, name, spec, schema) {
  const inputDims = fieldInputDimensions(spec, artifact);
  const inferred = inferExprDimension(artifact, spec.expr, inputDims, {
    elem: { alias: "row", schema },
  });
  if (inferred === null || inferred === spec.output.dimension) return;
  throw new Error(
    `Collection "${id}" field "${name}" declares dimension "${spec.output.dimension}" ` +
      `but its expression infers "${inferred}"`
  );
}

export function validateCollectionFields(artifact) {
  for (const [id, node] of Object.entries(artifact.nodes)) {
    if (node.kind !== "collection" || !node.fields) continue;
    const schema = artifact.primitive_schemas?.[node.item_schema] ?? {};
    for (const [name, spec] of Object.entries(node.fields)) {
      if (!spec.output?.dimension) continue;
      assertCollectionFieldDimension(artifact, id, name, spec, schema);
    }
  }
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
