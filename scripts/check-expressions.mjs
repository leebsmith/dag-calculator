import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { compileExpression } from "../frontend/src/engine/expression.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ARTIFACT = resolve(ROOT, "data/artifact.json");

function walk(node, visit) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) walk(item, visit);
    return;
  }
  visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (key === "_parent") continue;
    walk(value, visit);
  }
}

function transformArguments(ast) {
  const args = [];
  walk(ast, (node) => {
    if (node.type !== "FunctionCall" || node.pool !== "transforms") return;
    for (const arg of node.args ?? []) {
      if (arg?.type === "Literal" && typeof arg.value === "string") {
        args.push({ name: node.name, expression: arg.value });
      }
    }
  });
  return args;
}

function checkOne(label, expression, state, depth = 0) {
  if (typeof expression !== "string" || expression.trim() === "") {
    state.failures.push({
      label,
      expression,
      message: "expression must be a non-empty string",
    });
    return;
  }
  if (depth > 16) {
    state.failures.push({
      label,
      expression,
      message: "transform expression nesting is too deep",
    });
    return;
  }
  let record;
  try {
    record = compileExpression(expression);
  } catch (error) {
    state.failures.push({ label, expression, message: error.message });
    return;
  }
  state.compiled += 1;
  for (const arg of transformArguments(record.ast)) {
    state.nested += 1;
    checkOne(`${label} transform "${arg.name}"`, arg.expression, state, depth + 1);
  }
}

function addSurface(surfaces, label, expression) {
  if (expression === undefined || expression === null) return;
  surfaces.push({ label, expression });
}

function nodeSurfaces(nodeId, node, surfaces) {
  if ("expr" in node) addSurface(surfaces, `nodes.${nodeId}.expr`, node.expr);
  if ("default" in node) addSurface(surfaces, `nodes.${nodeId}.default`, node.default);
  if ("domain" in node && (typeof node.domain === "string" || !node.domain?.codes)) {
    addSurface(surfaces, `nodes.${nodeId}.domain`, node.domain);
  }
  for (const [field, spec] of Object.entries(node.fields ?? {})) {
    if ("expr" in spec) {
      addSurface(surfaces, `nodes.${nodeId}.fields.${field}.expr`, spec.expr);
    }
  }
}

function functionSurfaces(functions, surfaces) {
  for (const [id, fn] of Object.entries(functions ?? {})) {
    if ("body" in fn) addSurface(surfaces, `functions.${id}.body`, fn.body);
  }
}

function relationSurfaces(relations, surfaces) {
  for (const [index, relation] of (relations ?? []).entries()) {
    if ("predicate" in relation) {
      addSurface(surfaces, `relations[${index}].predicate`, relation.predicate);
    }
  }
}

function schemaSurfaces(schemas, surfaces) {
  for (const [schemaId, schema] of Object.entries(schemas ?? {})) {
    for (const [field, spec] of Object.entries(schema)) {
      if (spec && "domain" in spec) {
        addSurface(surfaces, `primitive_schemas.${schemaId}.${field}.domain`, spec.domain);
      }
    }
  }
}

export function expressionSurfaces(artifact) {
  const surfaces = [];
  for (const [id, node] of Object.entries(artifact.nodes ?? {})) {
    nodeSurfaces(id, node, surfaces);
  }
  functionSurfaces(artifact.functions, surfaces);
  relationSurfaces(artifact.relations, surfaces);
  schemaSurfaces(artifact.primitive_schemas, surfaces);
  return surfaces;
}

export function checkExpressions(artifact) {
  const state = { failures: [], compiled: 0, nested: 0 };
  for (const { label, expression } of expressionSurfaces(artifact)) {
    checkOne(label, expression, state);
  }
  return { failures: state.failures, compiled: state.compiled, nested: state.nested };
}

function main() {
  const artifact = JSON.parse(readFileSync(ARTIFACT, "utf8"));
  const { failures, compiled, nested } = checkExpressions(artifact);
  if (failures.length > 0) {
    console.error(`expression check: ${failures.length} failure(s)`);
    for (const failure of failures) {
      console.error(`  ${failure.label}: ${failure.message}`);
      console.error(`    ${String(failure.expression).slice(0, 160)}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log(`expression check: ${compiled} expression(s), ${nested} transform argument(s)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
