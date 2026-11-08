// Jexl expression runtime. Expressions are compiled once; dotted references are
// resolved lazily so short-circuiting branches never touch an unread value.

import jexl from "jexl";

const parser = new jexl.Jexl();
const parserCache = new Map();
const runtimes = new WeakMap();
const facades = new WeakSet();

function functionCallAt(expression, index) {
  const match = /^functions\.([A-Za-z_][A-Za-z0-9_]*)\(/.exec(expression.slice(index));
  return match ? { length: match[0].length, name: match[1] } : null;
}

export function normalizeExpression(expression) {
  let result = "";
  let quote = null;
  for (let index = 0; index < expression.length; index += 1) {
    const char = expression[index];
    if (quote) {
      result += char;
      if (char === "\\" && index + 1 < expression.length) {
        result += expression[index + 1];
        index += 1;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      result += char;
      continue;
    }
    const call = char === "f" ? functionCallAt(expression, index) : null;
    if (call) {
      result += `${call.name}(`;
      index += call.length - 1;
      continue;
    }
    result += char;
  }
  return result;
}

function identifierPath(node) {
  if (!node || node.type !== "Identifier") return null;
  const base = node.from ? identifierPath(node.from) : null;
  if (node.from && base === null) return null;
  return base ? `${base}.${node.value}` : node.value;
}

function addIdentifier(node, paths) {
  const path = identifierPath(node);
  if (path) {
    paths.add(path);
    return;
  }
  if (node.from) walkIdentifiers(node.from, paths);
}

function walkChildren(node, paths) {
  for (const [key, value] of Object.entries(node)) {
    if (key === "_parent" || key === "from") continue;
    walkIdentifiers(value, paths);
  }
}

function walkIdentifiers(node, paths) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) walkIdentifiers(item, paths);
    return;
  }
  if (node.type === "Identifier") {
    addIdentifier(node, paths);
    return;
  }
  if (node.type === "FunctionCall") {
    for (const arg of node.args ?? []) walkIdentifiers(arg, paths);
    return;
  }
  walkChildren(node, paths);
}

export function collectIdentifierPaths(ast) {
  const paths = new Set();
  walkIdentifiers(ast, paths);
  return [...paths];
}

function compileWith(instance, expression) {
  if (typeof expression !== "string") {
    throw new Error(`Expression must be a Jexl string, got ${typeof expression}`);
  }
  const compiled = instance.compile(normalizeExpression(expression));
  return {
    expression,
    compiled,
    ast: compiled._ast,
    paths: collectIdentifierPaths(compiled._ast),
  };
}

export function compileExpression(expression) {
  let record = parserCache.get(expression);
  if (!record) {
    record = compileWith(parser, expression);
    parserCache.set(expression, record);
  }
  return record;
}

function constantValues(artifact) {
  return Object.fromEntries(
    Object.entries(artifact.constants ?? {}).map(([id, constant]) => [id, constant.value])
  );
}

function skippedPath(path, explicit) {
  if (path === "$value" || path === "$context" || path === "row" || path === "constants") {
    return true;
  }
  if (path === "null") return true;
  if (path.startsWith("row.") || path.startsWith("constants.")) return true;
  return Object.prototype.hasOwnProperty.call(explicit, path);
}

function addLazyPaths(tree, paths, resolve) {
  const leaves = [];
  for (const path of paths) {
    const segments = path.split(".");
    let node = tree;
    for (let index = 0; index < segments.length - 1; index += 1) {
      const segment = segments[index];
      if (!Object.prototype.hasOwnProperty.call(node, segment)) node[segment] = {};
      node = node[segment];
    }
    leaves.push({ path, parent: node, key: segments[segments.length - 1] });
  }
  for (const { path, parent, key } of leaves) {
    if (Object.prototype.hasOwnProperty.call(parent, key)) continue;
    Object.defineProperty(parent, key, {
      enumerable: true,
      configurable: true,
      get() {
        return resolve(path);
      },
    });
  }
}

class ExpressionScope {
  #runtime;
  #resolve;
  #explicit;

  constructor(runtime, resolve, explicit = {}) {
    this.#runtime = runtime;
    this.#resolve = resolve;
    this.#explicit = explicit;
  }

  withRow(row) {
    return new ExpressionScope(this.#runtime, this.#resolve, { ...this.#explicit, row });
  }

  withValue(value) {
    return new ExpressionScope(this.#runtime, this.#resolve, {
      ...this.#explicit,
      $value: value,
    });
  }

  evaluate(expression) {
    return this.#runtime.evaluate(expression, this);
  }

  facade() {
    const facade = { ...this.#explicit };
    facades.add(facade);
    Object.defineProperty(facade, "evaluate", {
      enumerable: false,
      value: (expression, row) => {
        const target = row === undefined ? this : this.withRow(row);
        return target.evaluate(expression);
      },
    });
    return facade;
  }

  context(record) {
    const context = { ...this.#explicit };
    context.constants = constantValues(this.#runtime.artifact);
    context.null = null;
    context.$context = this.facade();
    const tree = {};
    addLazyPaths(
      tree,
      record.paths.filter((path) => !skippedPath(path, this.#explicit)),
      (path) => this.#resolve(path)
    );
    for (const [key, value] of Object.entries(tree)) {
      if (!Object.prototype.hasOwnProperty.call(context, key)) context[key] = value;
    }
    return context;
  }
}

function evaluateFunction(runtime, fnId, args) {
  const fn = runtime.artifact.functions?.[fnId];
  if (!fn) throw new Error(`Unknown function "${fnId}"`);
  const explicit = {};
  fn.params.forEach((param, index) => {
    explicit[param] = args[index];
  });
  const scope = runtime.scope((path) => {
    throw new Error(`Unresolved function ref "${path}" in "${fnId}"`);
  }, explicit);
  return runtime.evaluate(fn.body, scope);
}

function splitScope(args) {
  const last = args[args.length - 1];
  if (last && facades.has(last)) {
    return { facade: last, args: args.slice(0, -1) };
  }
  return { facade: null, args };
}

function evaluateRow(runtime, facade, row, expression) {
  if (facade) return facade.evaluate(expression, row);
  return runtime.scope(() => undefined, {}).withRow(row).evaluate(expression);
}

function requireCollection(collection, op) {
  if (!Array.isArray(collection)) {
    throw new Error(`Reduction "${op}" requires a collection`);
  }
}

function matches(runtime, facade, row, where) {
  if (where === null || where === undefined) return true;
  return Boolean(evaluateRow(runtime, facade, row, where));
}

function sumField(runtime, collection, args, facade) {
  let total = 0;
  for (const row of collection) {
    if (matches(runtime, facade, row, args[1])) total += row[args[0]];
  }
  return total;
}

function sumExpr(runtime, collection, args, facade) {
  let total = 0;
  for (const row of collection) {
    if (matches(runtime, facade, row, args[1])) {
      total += evaluateRow(runtime, facade, row, args[0]);
    }
  }
  return total;
}

function weightedAvgField(runtime, collection, args, facade) {
  let numerator = 0;
  let denominator = 0;
  for (const row of collection) {
    if (!matches(runtime, facade, row, args[2])) continue;
    numerator += row[args[0]] * row[args[1]];
    denominator += row[args[1]];
  }
  return denominator === 0 ? 0 : numerator / denominator;
}

function weightedAvgExpr(runtime, collection, args, facade) {
  let numerator = 0;
  let denominator = 0;
  for (const row of collection) {
    if (!matches(runtime, facade, row, args[2])) continue;
    const value = evaluateRow(runtime, facade, row, args[0]);
    const weight = evaluateRow(runtime, facade, row, args[1]);
    numerator += value * weight;
    denominator += weight;
  }
  return denominator === 0 ? 0 : numerator / denominator;
}

function finiteValue(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function minMaxField(op, runtime, collection, args, facade) {
  let result;
  for (const row of collection) {
    if (!matches(runtime, facade, row, args[1])) continue;
    const value = row[args[0]];
    if (!finiteValue(value)) continue;
    if (result === undefined || (op === "min" ? value < result : value > result)) result = value;
  }
  return result;
}

function minMaxExpr(op, runtime, collection, args, facade) {
  let result;
  for (const row of collection) {
    if (!matches(runtime, facade, row, args[1])) continue;
    const value = evaluateRow(runtime, facade, row, args[0]);
    if (!finiteValue(value)) continue;
    if (result === undefined || (op === "min" ? value < result : value > result)) result = value;
  }
  return result;
}

function registerFunctions(runtime) {
  for (const fnId of Object.keys(runtime.artifact.functions ?? {})) {
    runtime.instance.addFunction(fnId, (...args) => evaluateFunction(runtime, fnId, args));
  }
}

function registerTransforms(runtime) {
  runtime.instance.addTransform("sum", (collection, ...rest) => {
    requireCollection(collection, "sum");
    const { facade, args } = splitScope(rest);
    return sumField(runtime, collection, args, facade);
  });
  runtime.instance.addTransform("sum_expr", (collection, ...rest) => {
    requireCollection(collection, "sum_expr");
    const { facade, args } = splitScope(rest);
    return sumExpr(runtime, collection, args, facade);
  });
  runtime.instance.addTransform("weighted_avg", (collection, ...rest) => {
    requireCollection(collection, "weighted_avg");
    const { facade, args } = splitScope(rest);
    return weightedAvgField(runtime, collection, args, facade);
  });
  runtime.instance.addTransform("weighted_avg_expr", (collection, ...rest) => {
    requireCollection(collection, "weighted_avg_expr");
    const { facade, args } = splitScope(rest);
    return weightedAvgExpr(runtime, collection, args, facade);
  });
  for (const op of ["min", "max"]) {
    runtime.instance.addTransform(op, (collection, ...rest) => {
      requireCollection(collection, op);
      const { facade, args } = splitScope(rest);
      return minMaxField(op, runtime, collection, args, facade);
    });
    runtime.instance.addTransform(`${op}_expr`, (collection, ...rest) => {
      requireCollection(collection, `${op}_expr`);
      const { facade, args } = splitScope(rest);
      return minMaxExpr(op, runtime, collection, args, facade);
    });
  }
  runtime.instance.addTransform("map_expr", (collection, ...rest) => {
    requireCollection(collection, "map_expr");
    const { facade, args } = splitScope(rest);
    return collection.map((row) => evaluateRow(runtime, facade, row, args[0]));
  });
  runtime.instance.addTransform("filter_expr", (collection, ...rest) => {
    requireCollection(collection, "filter_expr");
    const { facade, args } = splitScope(rest);
    return collection.filter((row) => Boolean(evaluateRow(runtime, facade, row, args[0])));
  });
}

function createRuntime(artifact) {
  const instance = new jexl.Jexl();
  const cache = new Map();
  const runtime = {
    artifact,
    instance,
    compile(expression) {
      let record = cache.get(expression);
      if (!record) {
        record = compileWith(instance, expression);
        cache.set(expression, record);
      }
      return record;
    },
    evaluate(expression, scope) {
      const record = runtime.compile(expression);
      return record.compiled.evalSync(scope.context(record));
    },
    scope(resolve, explicit = {}) {
      return new ExpressionScope(runtime, resolve, explicit);
    },
    callFunction(fnId, args = []) {
      return evaluateFunction(runtime, fnId, args);
    },
  };
  registerFunctions(runtime);
  registerTransforms(runtime);
  return runtime;
}

export function runtimeFor(artifact) {
  let runtime = runtimes.get(artifact);
  if (!runtime) {
    runtime = createRuntime(artifact);
    runtimes.set(artifact, runtime);
  }
  return runtime;
}
