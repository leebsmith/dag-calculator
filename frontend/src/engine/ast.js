// Expression AST interpreter (expression-language.md). Pure: no I/O, no state.

import { getField } from "./paths.js";

function isObjectWithKey(expr, key) {
  return expr !== null && typeof expr === "object" && Object.prototype.hasOwnProperty.call(expr, key);
}

function evaluateLeaf(expr, ctx) {
  if (isObjectWithKey(expr, "ref")) return ctx.resolveRef(expr.ref);
  if (isObjectWithKey(expr, "const")) return ctx.resolveConst(expr.const);
  if (isObjectWithKey(expr, "call")) {
    const args = expr.args.map((a) => evaluate(a, ctx));
    return ctx.call(expr.call, args);
  }
  if (isObjectWithKey(expr, "coll")) {
    return applyReduction(expr, ctx);
  }
  if (isObjectWithKey(expr, "op")) {
    // Boolean operators and `if` short-circuit: only the taken branch is
    // evaluated. This lets a predicate guard access to a node that may be
    // unresolvable (e.g. an unset optional selection).
    switch (expr.op) {
      case "and": {
        const lhs = evaluate(expr.args[0], ctx);
        return lhs ? evaluate(expr.args[1], ctx) : lhs;
      }
      case "or": {
        const lhs = evaluate(expr.args[0], ctx);
        return lhs ? lhs : evaluate(expr.args[1], ctx);
      }
      case "if":
        return evaluate(expr.args[0], ctx)
          ? evaluate(expr.args[1], ctx)
          : evaluate(expr.args[2], ctx);
      default:
        return applyOperator(expr.op, expr.args.map((a) => evaluate(a, ctx)));
    }
  }
  throw new Error(`Unknown expression node: ${JSON.stringify(expr)}`);
}

function applyOperator(op, args) {
  switch (op) {
    case "+":
      return args[0] + args[1];
    case "-":
      return args[0] - args[1];
    case "*":
      return args[0] * args[1];
    case "/":
      return args[0] / args[1];
    case "neg":
      return -args[0];
    case "pow":
      return Math.pow(args[0], args[1]);
    case "gt":
      return args[0] > args[1];
    case "ge":
      return args[0] >= args[1];
    case "lt":
      return args[0] < args[1];
    case "le":
      return args[0] <= args[1];
    case "eq":
      return args[0] === args[1];
    case "ne":
      return args[0] !== args[1];
    case "and":
      return args[0] && args[1];
    case "or":
      return args[0] || args[1];
    case "not":
      return !args[0];
    case "if":
      return args[0] ? args[1] : args[2];
    default:
      throw new Error(`Unknown operator: ${op}`);
  }
}

function applyReduction(expr, ctx) {
  const coll = evaluate(expr.coll, ctx);
  if (!Array.isArray(coll)) {
    throw new Error(`Reduction "${expr.op}" requires a collection`);
  }
  const alias = expr.as;
  const withElement = (el) => ({
    ...ctx,
    resolveRef(name) {
      if (name === alias) return el;
      if (name.startsWith(alias + ".")) return getField(el, name.slice(alias.length + 1));
      return ctx.resolveRef(name);
    },
  });

  // Filter-then-reduce: an optional `where` predicate selects the items each
  // value-reduction (sum / weighted_avg / min) operates over. Truthiness is
  // plain JS truthiness (undefined / null / false / 0 / "" are excluded).
  const items = expr.where
    ? coll.filter((el) => Boolean(evaluate(expr.where, withElement(el))))
    : coll;

  switch (expr.op) {
    case "map":
      return coll.map((el) => evaluate(expr.body, withElement(el)));
    case "filter":
      return coll.filter((el) => evaluate(expr.body, withElement(el)));
    case "sum": {
      let total = 0;
      for (const el of items) total += evaluate(expr.body, withElement(el));
      return total;
    }
    case "weighted_avg": {
      let num = 0;
      let den = 0;
      for (const el of items) {
        const value = evaluate(expr.value, withElement(el));
        const weight = evaluate(expr.weight, withElement(el));
        num += value * weight;
        den += weight;
      }
      return den === 0 ? 0 : num / den;
    }
    case "min": {
      // Minimum of the finite `value`s; undefined when none remain.
      let result;
      for (const el of items) {
        const value = evaluate(expr.value, withElement(el));
        if (typeof value !== "number" || !Number.isFinite(value)) continue;
        if (result === undefined || value < result) result = value;
      }
      return result;
    }
    case "max": {
      // Maximum of the finite `value`s; undefined when none remain.
      let result;
      for (const el of items) {
        const value = evaluate(expr.value, withElement(el));
        if (typeof value !== "number" || !Number.isFinite(value)) continue;
        if (result === undefined || value > result) result = value;
      }
      return result;
    }
    default:
      throw new Error(`Unknown reduction op: ${expr.op}`);
  }
}

export function evaluate(expr, ctx) {
  if (expr === null || typeof expr !== "object") {
    return expr; // bare literal (number / string / boolean)
  }
  return evaluateLeaf(expr, ctx);
}
