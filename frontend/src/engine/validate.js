// Artifact structural validation (grammar §5). Throws on structural problems.

import { compileExpression } from "./expression.js";
import { resolveReference } from "./paths.js";

const NODE_KINDS = ["root", "collection", "selection", "choice", "derived", "boundary"];
export const SUPPORTED_SCHEMA_VERSIONS = [11];

export function validateArtifact(artifact) {
  if (artifact === null || typeof artifact !== "object") {
    throw new Error("Artifact must be an object");
  }
  if (typeof artifact.schema_version !== "number") {
    throw new Error('Artifact must declare a numeric "schema_version"');
  }
  if (!SUPPORTED_SCHEMA_VERSIONS.includes(artifact.schema_version)) {
    throw new Error(
      `Unsupported schema_version ${artifact.schema_version}; expected one of ${SUPPORTED_SCHEMA_VERSIONS.join(", ")}`
    );
  }
  if (artifact.nodes === null || typeof artifact.nodes !== "object") {
    throw new Error('Artifact must declare a "nodes" object');
  }

  const dimensions = artifact.dimensions ?? {};
  const constants = artifact.constants ?? {};
  const taxonomies = artifact.taxonomies ?? {};
  const functions = artifact.functions ?? {};
  const schemas = artifact.primitive_schemas ?? {};

  validateSchemas(artifact, dimensions, taxonomies);
  validateIdentity(artifact, schemas);
  validateNodes(artifact, dimensions, taxonomies, constants, functions, schemas);
  validateRelationsAndFunctions(artifact, constants, functions);

  return artifact;
}

function validateNodes(artifact, dimensions, taxonomies, constants, functions, schemas) {
  for (const [id, node] of Object.entries(artifact.nodes)) {
    if (!NODE_KINDS.includes(node.kind)) {
      throw new Error(`Node "${id}" has unknown kind "${node.kind}"`);
    }
    if (typeof node.domain === "string") {
      checkExprIds(artifact, node.domain, constants, functions, `Node "${id}" domain`);
    }
    switch (node.kind) {
      case "root":
        if (!dimensions[node.dimension]) {
          throw new Error(`Root "${id}" references unknown dimension "${node.dimension}"`);
        }
        checkDefaultRefs(artifact, node, `Root "${id}"`);
        break;
      case "collection":
        validateCollection(artifact, id, node, dimensions, taxonomies, constants, functions);
        break;
      case "selection":
        if (!node.output || !node.output.schema) {
          throw new Error(`Selection "${id}" must declare an "output.schema"`);
        }
        if (!schemas[node.output.schema]) {
          throw new Error(
            `Selection "${id}" references unknown schema "${node.output.schema}"`
          );
        }
        checkRefResolves(artifact, node.ref, `Selection "${id}" ref`);
        break;
      case "choice":
        if (!taxonomies[node.taxonomy]) {
          throw new Error(`Choice "${id}" references unknown taxonomy "${node.taxonomy}"`);
        }
        checkChoiceDefault(id, node, taxonomies);
        checkDefaultRefs(artifact, node, `Choice "${id}"`);
        break;
      case "derived":
        validateDerived(artifact, id, node, constants, functions);
        break;
      case "boundary":
        validateBoundary(artifact, id, node, dimensions, taxonomies);
        break;
      default:
        break;
    }
  }
}

function validateRelationsAndFunctions(artifact, constants, functions) {
  for (const [id, fn] of Object.entries(functions)) {
    const aliases = Object.fromEntries(fn.params.map((param) => [param, true]));
    checkExprIds(artifact, fn.body, constants, functions, `Function "${id}" body`, {
      aliases,
    });
  }
  for (const relation of artifact.relations ?? []) {
    if (!relation || typeof relation !== "object" || !relation.id) {
      throw new Error("Each relation must be an object with an id");
    }
    if (typeof relation.blocking !== "boolean") {
      throw new Error(`Relation "${relation.id}" must declare a boolean "blocking"`);
    }
    checkExprIds(
      artifact,
      relation.predicate,
      constants,
      functions,
      `Relation "${relation.id}"`
    );
  }
}

const ROW_ALIAS = "row";

// A collection's `fields` are row-scoped computed values. They are shaped like a
// `derived` node without the node wrapper (inputs + expr + one value spec) and
// never appear in `item_schema`, which describes authored fields only.
function validateCollection(artifact, id, node, dimensions, taxonomies, constants, functions) {
  const schema = artifact.primitive_schemas?.[node.item_schema];
  if (!schema) {
    throw new Error(`Collection "${id}" references unknown schema "${node.item_schema}"`);
  }
  if (node.fields === undefined) return;
  if (node.fields === null || typeof node.fields !== "object" || Array.isArray(node.fields)) {
    throw new Error(`Collection "${id}" "fields" must be an object`);
  }
  for (const [name, spec] of Object.entries(node.fields)) {
    const label = `Collection "${id}" field "${name}"`;
    if (Object.prototype.hasOwnProperty.call(schema, name)) {
      throw new Error(`${label} shadows an item_schema field`);
    }
    if (spec === null || typeof spec !== "object") {
      throw new Error(`${label} must be an object`);
    }
    if (spec.inputs === null || typeof spec.inputs !== "object") {
      throw new Error(`${label} must declare an "inputs" object`);
    }
    for (const [alias, path] of Object.entries(spec.inputs)) {
      if (alias === ROW_ALIAS || alias.startsWith(`${ROW_ALIAS}.`)) {
        throw new Error(`${label} input "${alias}" collides with the reserved "row" alias`);
      }
      checkRefResolves(artifact, path, `${label} input "${alias}"`);
    }
    checkOutput(spec, label);
    if (spec.output.dimension && !dimensions[spec.output.dimension]) {
      throw new Error(`${label} has unknown dimension "${spec.output.dimension}"`);
    }
    if (spec.output.taxonomy && !taxonomies[spec.output.taxonomy]) {
      throw new Error(`${label} has unknown taxonomy "${spec.output.taxonomy}"`);
    }
    checkExprIds(artifact, spec.expr, constants, functions, `${label} expr`, {
      aliases: spec.inputs,
      rowSchema: schema,
    });
  }
}

function validateDerived(artifact, id, node, constants, functions) {
  if (node.inputs === null || typeof node.inputs !== "object") {
    throw new Error(`Derived "${id}" must declare an "inputs" object`);
  }
  for (const [alias, path] of Object.entries(node.inputs)) {
    checkRefResolves(artifact, path, `Derived "${id}" input "${alias}"`);
  }
  checkOutput(node, `Derived "${id}"`);
  checkExprIds(artifact, node.expr, constants, functions, `Derived "${id}" expr`, {
    aliases: node.inputs,
  });
}

function validateBoundary(artifact, id, node, dimensions, taxonomies) {
  if (!node.binding) throw new Error(`Boundary "${id}" must declare a "binding"`);
  if (node.inputs === null || typeof node.inputs !== "object") {
    throw new Error(`Boundary "${id}" must declare an "inputs" object`);
  }
  for (const [alias, path] of Object.entries(node.inputs)) {
    checkRefResolves(artifact, path, `Boundary "${id}" input "${alias}"`);
  }
  if (node.outputs === null || typeof node.outputs !== "object") {
    throw new Error(`Boundary "${id}" must declare an "outputs" object`);
  }
  const schemas = artifact.primitive_schemas ?? {};
  for (const [name, out] of Object.entries(node.outputs)) {
    if (out === null || typeof out !== "object") {
      throw new Error(`Boundary "${id}" output "${name}" must be an object`);
    }
    if (out.type === "collection") {
      if (!out.item_schema || !schemas[out.item_schema]) {
        throw new Error(
          `Boundary "${id}" output "${name}" has unknown item_schema "${out.item_schema}"`
        );
      }
      continue;
    }
    if (out.dimension && !dimensions[out.dimension]) {
      throw new Error(`Boundary "${id}" output "${name}" has unknown dimension "${out.dimension}"`);
    }
    if (out.taxonomy && !taxonomies[out.taxonomy]) {
      throw new Error(`Boundary "${id}" output "${name}" has unknown taxonomy "${out.taxonomy}"`);
    }
    if (!out.dimension && !out.taxonomy && out.type !== "boolean") {
      throw new Error(`Boundary "${id}" output "${name}" must declare a dimension, taxonomy, boolean, or collection type`);
    }
  }
}

function validateSchemas(artifact, dimensions, taxonomies) {
  for (const [sid, schema] of Object.entries(artifact.primitive_schemas ?? {})) {
    for (const [field, spec] of Object.entries(schema)) {
      if (spec === null || typeof spec !== "object") {
        throw new Error(`Schema "${sid}" field "${field}" must be an object`);
      }
      if (spec.dimension && !dimensions[spec.dimension]) {
        throw new Error(`Schema "${sid}" field "${field}" references unknown dimension "${spec.dimension}"`);
      }
      if (spec.taxonomy && !taxonomies[spec.taxonomy]) {
        throw new Error(`Schema "${sid}" field "${field}" references unknown taxonomy "${spec.taxonomy}"`);
      }
      if (spec.type !== undefined && spec.type !== "boolean") {
        throw new Error(`Schema "${sid}" field "${field}" has unsupported type "${spec.type}"`);
      }
      if (typeof spec.domain === "string") {
        checkExprIds(
          artifact,
          spec.domain,
          artifact.constants ?? {},
          artifact.functions ?? {},
          `Schema "${sid}" field "${field}" domain`
        );
      }
    }
  }
}

function checkOutput(node, label) {
  const out = node.output;
  if (!out) throw new Error(`${label} must declare an "output"`);
  const kinds = [out.dimension, out.taxonomy, out.type === "boolean"].filter(Boolean).length;
  if (kinds !== 1) {
    throw new Error(`${label} output must declare exactly one of dimension/taxonomy/boolean`);
  }
}

const TRANSFORM_NAMES = new Set([
  "sum",
  "min",
  "max",
  "weighted_avg",
  "sum_expr",
  "min_expr",
  "max_expr",
  "weighted_avg_expr",
  "map_expr",
  "filter_expr",
]);
const FIELD_TRANSFORMS = {
  sum: { fields: [1], where: 2 },
  min: { fields: [1], where: 2 },
  max: { fields: [1], where: 2 },
  weighted_avg: { fields: [1, 2], where: 3 },
};
const EXPR_TRANSFORMS = {
  sum_expr: { expressions: [1], where: 2 },
  min_expr: { expressions: [1], where: 2 },
  max_expr: { expressions: [1], where: 2 },
  weighted_avg_expr: { expressions: [1, 2], where: 3 },
  map_expr: { expressions: [1], where: 2 },
  filter_expr: { expressions: [1], where: 2 },
};

function identifierPath(node) {
  if (!node || node.type !== "Identifier") return null;
  const base = node.from ? identifierPath(node.from) : null;
  if (node.from && base === null) return null;
  return base ? `${base}.${node.value}` : node.value;
}

function literalValue(node) {
  return node?.type === "Literal" ? node.value : undefined;
}

function walkCalls(node, visit) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) walkCalls(item, visit);
    return;
  }
  if (node.type === "FunctionCall") visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (key === "_parent") continue;
    walkCalls(value, visit);
  }
}

function transformRowSchema(artifact, call, aliases) {
  const path = identifierPath(call.args?.[0]);
  if (!path) return null;
  const target = aliases[path] ?? path;
  const ref = resolveReference(artifact, target);
  if (ref?.kind !== "node" || ref.suffix.length > 0) return null;
  const node = artifact.nodes[ref.nodeId];
  if (node?.kind !== "collection") return null;
  return artifact.primitive_schemas?.[node.item_schema] ?? null;
}

function checkTransformCall(artifact, call, label, constants, functions, aliases) {
  if (!TRANSFORM_NAMES.has(call.name)) {
    throw new Error(`${label} references unknown transform "${call.name}"`);
  }
  const args = call.args ?? [];
  const rowSchema = transformRowSchema(artifact, call, aliases);
  const fieldForm = FIELD_TRANSFORMS[call.name];
  if (fieldForm) {
    for (const index of fieldForm.fields) {
      const field = literalValue(args[index]);
      if (rowSchema && typeof field === "string" && !(field in rowSchema)) {
        throw new Error(`${label} references unknown row field "row.${field}"`);
      }
    }
    checkWhere(args[fieldForm.where], artifact, label, constants, functions, aliases, rowSchema);
    return;
  }
  const exprForm = EXPR_TRANSFORMS[call.name];
  for (const index of exprForm.expressions) {
    const expression = literalValue(args[index]);
    if (typeof expression !== "string") continue;
    checkExprIds(artifact, expression, constants, functions, `${label} transform "${call.name}"`, {
      aliases,
      rowSchema,
    });
  }
  checkWhere(args[exprForm.where], artifact, label, constants, functions, aliases, rowSchema);
}

function checkWhere(ast, artifact, label, constants, functions, aliases, rowSchema) {
  const where = literalValue(ast);
  if (typeof where !== "string") return;
  checkExprIds(artifact, where, constants, functions, `${label} transform where`, {
    aliases,
    rowSchema,
  });
}

function checkExprIds(artifact, expression, constants, functions, label, options = {}) {
  const { aliases = {}, rowSchema = null } = options;
  const record = compileExpression(expression);
  for (const path of record.paths) {
    if (path === "$value" || path === "$context" || path === "constants") continue;
    if (path === "null") continue;
    if (path.startsWith("constants.")) {
      const id = path.slice("constants.".length);
      if (!(id in constants)) {
        throw new Error(`${label} references unknown constant "${id}"`);
      }
      continue;
    }
    if (path === "row" || path.startsWith("row.")) {
      if (!rowSchema) throw new Error(`${label} references row outside a collection field`);
      const field = path.slice("row.".length);
      if (!(field in rowSchema)) {
        throw new Error(`${label} references unknown row field "${path}"`);
      }
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(aliases, path)) continue;
    checkRefResolves(artifact, path, label);
  }
  walkCalls(record.ast, (call) => {
    if (call.pool === "functions" && !(call.name in functions)) {
      throw new Error(`${label} references unknown function "${call.name}"`);
    }
    if (call.pool === "transforms") {
      checkTransformCall(artifact, call, label, constants, functions, aliases);
    }
  });
}

function checkChoiceDefault(id, node, taxonomies) {
  const ast = compileExpression(node.default).ast;
  if (ast?.type !== "Literal" || typeof ast.value !== "string") return;
  if (!taxonomies[node.taxonomy].includes(ast.value)) {
    throw new Error(
      `Choice "${id}" default "${ast.value}" is not a member of taxonomy "${node.taxonomy}"`
    );
  }
}

function checkRefResolves(artifact, path, label) {
  if (typeof path !== "string") {
    throw new Error(`${label} must be a string path, got ${JSON.stringify(path)}`);
  }
  const resolved = resolveReference(artifact, path);
  if (!resolved) {
    throw new Error(`${label} references unknown node/field "${path}"`);
  }
  if (resolved.kind === "identity") {
    const schema = artifact.primitive_schemas?.[artifact.identity[resolved.namespace]];
    const field = resolved.suffix[0];
    if (!schema || field === undefined || !(field in schema)) {
      throw new Error(`${label} references unknown identity field "${path}"`);
    }
  }
}

function validateIdentity(artifact, schemas) {
  const identity = artifact.identity;
  if (identity === undefined) return;
  if (identity === null || typeof identity !== "object" || Array.isArray(identity)) {
    throw new Error('"identity" must be an object mapping a namespace to a primitive schema');
  }
  for (const [namespace, schemaId] of Object.entries(identity)) {
    if (!namespace.includes(".") && namespace === "") {
      throw new Error('Identity namespace must be a non-empty dotted slug');
    }
    if (!schemas[schemaId]) {
      throw new Error(`Identity namespace "${namespace}" references unknown schema "${schemaId}"`);
    }
    for (const id of Object.keys(artifact.nodes)) {
      if (id === namespace || id.startsWith(`${namespace}.`)) {
        throw new Error(
          `Identity namespace "${namespace}" collides with node "${id}"`
        );
      }
    }
  }
}

// Every identifier in a node's `default` expression must resolve.
function checkDefaultRefs(artifact, node, label) {
  checkExprIds(
    artifact,
    node.default,
    artifact.constants ?? {},
    artifact.functions ?? {},
    `${label} default`
  );
}
