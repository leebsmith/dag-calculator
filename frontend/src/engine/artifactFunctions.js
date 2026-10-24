// Pure access to the artifact's declared constants and functions. No engine,
// session, or I/O: callers can use these from host-side math without
// duplicating formulas. The artifact remains the single source of truth.

import artifact from "./artifact.json" with { type: "json" };
import { evaluate } from "./ast.js";
import { getField } from "./paths.js";

export function artifactConstant(name) {
  const constant = artifact.constants?.[name];
  if (!constant) throw new Error(`Unknown artifact constant "${name}"`);
  return constant.value;
}

export function callArtifactFunction(fnId, args = []) {
  const fn = artifact.functions?.[fnId];
  if (!fn) throw new Error(`Unknown artifact function "${fnId}"`);
  const scope = Object.fromEntries(fn.params.map((param, index) => [param, args[index]]));

  const ctx = {
    resolveRef(name) {
      if (Object.prototype.hasOwnProperty.call(scope, name)) return scope[name];
      if (name.includes(".")) {
        const [head, ...rest] = name.split(".");
        if (Object.prototype.hasOwnProperty.call(scope, head)) {
          return getField(scope[head], rest.join("."));
        }
      }
      throw new Error(`Unresolved artifact function ref "${name}" in "${fnId}"`);
    },
    resolveConst(name) {
      return artifactConstant(name);
    },
    call(innerId, innerArgs) {
      return callArtifactFunction(innerId, innerArgs);
    },
  };

  return evaluate(fn.body, ctx);
}
