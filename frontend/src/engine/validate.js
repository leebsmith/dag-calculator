// Artifact structural validation (grammar §5). Throws on structural problems.

import { resolveReference } from "./paths.js";

const NODE_KINDS = ["root", "collection", "selection", "choice", "derived", "boundary"];
const SUPPORTED_SCHEMA_VERSIONS = [1, 2];

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

  for (const [id, node] of Object.entries(artifact.nodes)) {
    if (!NODE_KINDS.includes(node.kind)) {
      throw new Error(`Node "${id}" has unknown kind "${node.kind}"`);
    }
    switch (node.kind) {
      case "root":
        if (!dimensions[node.dimension]) {
          throw new Error(`Root "${id}" references unknown dimension "${node.dimension}"`);
        }
        break;
      case "collection":
        if (!schemas[node.item_schema]) {
          throw new Error(`Collection "${id}" references unknown schema "${node.item_schema}"`);
        }
        break;
      case "selection":
        if (!schemas[node.schema]) {
          throw new Error(`Selection "${id}" references unknown schema "${node.schema}"`);
        }
        checkRefResolves(artifact, node.ref, `Selection "${id}" ref`);
        break;
      case "choice":
        if (!taxonomies[node.taxonomy]) {
          throw new Error(`Choice "${id}" references unknown taxonomy "${node.taxonomy}"`);
        }
        if (typeof node.default === "string" && !taxonomies[node.taxonomy].includes(node.default)) {
          throw new Error(
            `Choice "${id}" default "${node.default}" is not a member of taxonomy "${node.taxonomy}"`
          );
        }
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

  return artifact;
}

function validateDerived(artifact, id, node, constants, functions) {
  if (node.inputs === null || typeof node.inputs !== "object") {
    throw new Error(`Derived "${id}" must declare an "inputs" object`);
  }
  for (const [alias, path] of Object.entries(node.inputs)) {
    checkRefResolves(artifact, path, `Derived "${id}" input "${alias}"`);
  }
  checkOutput(node, `Derived "${id}"`);
  checkExprIds(artifact, node.expr, constants, functions, `Derived "${id}" expr`);
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
  for (const [name, out] of Object.entries(node.outputs)) {
    if (out.dimension && !dimensions[out.dimension]) {
      throw new Error(`Boundary "${id}" output "${name}" has unknown dimension "${out.dimension}"`);
    }
    if (out.taxonomy && !taxonomies[out.taxonomy]) {
      throw new Error(`Boundary "${id}" output "${name}" has unknown taxonomy "${out.taxonomy}"`);
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

function checkExprIds(artifact, expr, constants, functions, label) {
  if (expr === null || typeof expr !== "object") return;
  if ("const" in expr && !(expr.const in constants)) {
    throw new Error(`${label} references unknown constant "${expr.const}"`);
  }
  if ("call" in expr && !(expr.call in functions)) {
    throw new Error(`${label} references unknown function "${expr.call}"`);
  }
  if ("args" in expr && Array.isArray(expr.args)) {
    expr.args.forEach((a) => checkExprIds(artifact, a, constants, functions, label));
  }
  if ("body" in expr) checkExprIds(artifact, expr.body, constants, functions, label);
  if ("coll" in expr) checkExprIds(artifact, expr.coll, constants, functions, label);
  if ("value" in expr) checkExprIds(artifact, expr.value, constants, functions, label);
  if ("weight" in expr) checkExprIds(artifact, expr.weight, constants, functions, label);
}

function checkRefResolves(artifact, path, label) {
  if (typeof path !== "string") {
    throw new Error(`${label} must be a string path, got ${JSON.stringify(path)}`);
  }
  const resolved = resolveReference(artifact, path);
  if (!resolved) {
    throw new Error(`${label} references unknown node/field "${path}"`);
  }
}
