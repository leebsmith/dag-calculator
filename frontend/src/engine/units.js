// Dimension system: unit conversion and dimension checking (dimensions.md).

import { compileExpression } from "./expression.js";
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

// Static dimension inference for Jexl expressions. Returns a dimension id,
// "boolean", "dimensionless", "collection", or null when indeterminate.
const SCALAR_DIMS = new Set(["dimensionless", "percentage"]);
const BOOLEAN_OPERATORS = new Set([
  "==",
  "!=",
  ">",
  ">=",
  "<",
  "<=",
  "&&",
  "||",
  "in",
]);

function identifierPath(node) {
  if (!node || node.type !== "Identifier") return null;
  const base = node.from ? identifierPath(node.from) : null;
  if (node.from && base === null) return null;
  return base ? `${base}.${node.value}` : node.value;
}

function literalValue(node) {
  return node?.type === "Literal" ? node.value : undefined;
}

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

function collectionSchemaFromAst(artifact, ast, ctx) {
  const path = identifierPath(ast);
  if (!path) return null;
  const known = ctx.collSchemas?.[path];
  if (known) return known;
  const ref = resolveReference(artifact, path);
  const node = ref?.kind === "node" ? artifact.nodes[ref.nodeId] : null;
  return node?.kind === "collection" ? node.item_schema : null;
}

function fieldDimension(artifact, schemaId, field) {
  if (!schemaId || typeof field !== "string") return null;
  const spec = artifact.primitive_schemas?.[schemaId]?.[field];
  return spec ? spec.dimension ?? spec.taxonomy ?? null : null;
}

function literalDimension(ast) {
  if (typeof ast.value === "number") return "dimensionless";
  if (typeof ast.value === "boolean") return "boolean";
  return null;
}

function identifierDimension(artifact, ast, inputDims, ctx) {
  const path = identifierPath(ast);
  if (!path) return null;
  if (path.startsWith("constants.")) {
    return artifact.constants?.[path.slice("constants.".length)]?.dimension ?? null;
  }
  return referenceDimension(artifact, path, inputDims, ctx);
}

function binaryDimension(artifact, ast, inputDims, ctx) {
  if (BOOLEAN_OPERATORS.has(ast.operator)) return "boolean";
  const left = () => dimensionFromAst(artifact, ast.left, inputDims, ctx);
  const right = () => dimensionFromAst(artifact, ast.right, inputDims, ctx);
  switch (ast.operator) {
    case "+":
      return inferAddDimension(artifact, left(), right());
    case "-":
      return inferSubDimension(artifact, left(), right());
    case "*":
      return productDimension([left(), right()]);
    case "/":
      return quotientDimension([left(), right()]);
    default:
      return null;
  }
}

function callDimension(artifact, ast, inputDims, ctx) {
  if (ast.pool === "transforms") return transformDimension(artifact, ast, inputDims, ctx);
  return artifact.functions?.[ast.name]?.returns ?? null;
}

function fieldTransformDimension(artifact, schema, name, field) {
  if (name !== "sum" && name !== "min" && name !== "max" && name !== "weighted_avg") {
    return undefined;
  }
  return fieldDimension(artifact, schema, field);
}

function exprTransformDimension(artifact, name, first, scope) {
  if (name === "map_expr" || name === "filter_expr") return "collection";
  if (
    name !== "sum_expr" &&
    name !== "min_expr" &&
    name !== "max_expr" &&
    name !== "weighted_avg_expr"
  ) {
    return null;
  }
  if (typeof first !== "string") return null;
  return inferExprDimension(artifact, first, scope.inputDims, {
    ...scope.ctx,
    elem: scope.elem,
  });
}

function transformDimension(artifact, ast, inputDims, ctx) {
  const [subject, ...args] = ast.args ?? [];
  const schemaId = collectionSchemaFromAst(artifact, subject, ctx);
  const elem = schemaId
    ? { alias: "row", schema: artifact.primitive_schemas?.[schemaId] ?? {} }
    : null;
  const first = literalValue(args[0]);
  const field = fieldTransformDimension(artifact, schemaId, ast.name, first);
  if (field !== undefined) return field;
  return exprTransformDimension(artifact, ast.name, first, { inputDims, ctx, elem });
}

function dimensionFromAst(artifact, ast, inputDims, ctx) {
  if (!ast || typeof ast !== "object") return null;
  if (ast.type === "Literal") return literalDimension(ast);
  if (ast.type === "Identifier") return identifierDimension(artifact, ast, inputDims, ctx);
  if (ast.type === "BinaryExpression") return binaryDimension(artifact, ast, inputDims, ctx);
  if (ast.type === "UnaryExpression") return ast.operator === "!" ? "boolean" : null;
  if (ast.type === "ConditionalExpression") {
    return branchDimension(
      dimensionFromAst(artifact, ast.consequent, inputDims, ctx),
      dimensionFromAst(artifact, ast.alternate, inputDims, ctx)
    );
  }
  if (ast.type === "FunctionCall") return callDimension(artifact, ast, inputDims, ctx);
  return null;
}

export function inferExprDimension(artifact, expression, inputDims = {}, ctx = {}) {
  if (typeof expression !== "string") return null;
  const record = compileExpression(expression);
  return dimensionFromAst(artifact, record.ast, inputDims, ctx);
}

function assertIfBranchesAgree(id, ast, artifact) {
  if (ast?.type !== "ConditionalExpression") return;
  const thenDimension = dimensionFromAst(artifact, ast.consequent, {}, {});
  const elseDimension = dimensionFromAst(artifact, ast.alternate, {}, {});
  if (thenDimension === null || elseDimension === null) return;
  if (thenDimension !== elseDimension) {
    throw new Error(
      `Root "${id}" default has if branches with dimensions "${thenDimension}" and "${elseDimension}"`
    );
  }
}

function assertRootDefaultDimension(id, node, ast, artifact) {
  const inferred = dimensionFromAst(artifact, ast, {}, {});
  if (inferred === null || inferred === node.dimension) return;
  throw new Error(
    `Root "${id}" declares dimension "${node.dimension}" but its default infers "${inferred}"`
  );
}

export function validateRootDefaults(artifact) {
  for (const [id, node] of Object.entries(artifact.nodes)) {
    if (node.kind !== "root") continue;
    const ast = compileExpression(node.default).ast;
    if (ast?.type === "Literal") {
      if (typeof ast.value === "string" && node.dimension !== "reference") {
        throw new Error(`Root "${id}" has a string default but dimension "${node.dimension}"`);
      }
      continue;
    }
    assertIfBranchesAgree(id, ast, artifact);
    assertRootDefaultDimension(id, node, ast, artifact);
  }
}

function fieldInputDimensions(spec, artifact) {
  const inputDims = {};
  for (const [alias, path] of Object.entries(spec.inputs ?? {})) {
    inputDims[alias] = inferExprDimension(artifact, path, {});
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

export function validateDerivedDimensions(artifact) {
  for (const [id, node] of Object.entries(artifact.nodes)) {
    if (node.kind !== "derived" || !node.output.dimension) continue;
    const inputDims = {};
    const collSchemas = {};
    for (const [alias, path] of Object.entries(node.inputs)) {
      inputDims[alias] = inferExprDimension(artifact, path, {});
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
