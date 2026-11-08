// Pure access to the artifact's declared constants and functions. No engine,
// session, or I/O: callers can use these from host-side math without
// duplicating formulas. The artifact remains the single source of truth.

import artifact from "./artifact.json" with { type: "json" };
import { runtimeFor } from "./expression.js";

export function artifactConstant(name) {
  const constant = artifact.constants?.[name];
  if (!constant) throw new Error(`Unknown artifact constant "${name}"`);
  return constant.value;
}

export function callArtifactFunction(fnId, args = []) {
  if (!artifact.functions?.[fnId]) throw new Error(`Unknown artifact function "${fnId}"`);
  return runtimeFor(artifact).callFunction(fnId, args);
}
