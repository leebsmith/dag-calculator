import test from "node:test";
import assert from "node:assert/strict";
import { artifact } from "./util.js";

// A3: the artifact is domain-only. No presentation vocabulary may leak in.
// NOTE: `unit`/`units`/`factor`/`offset`/`domain`/`kind` are domain and allowed.
const DENY =
  /^(label|title|control|controlKind|css|class|className|rounding|decimals|sentinel|layout|order|help|display|displayName|format|render|colSpan)$/i;

test("A3: no presentation vocabulary in the artifact", () => {
  const offenders = [];
  (function rec(obj, path) {
    if (Array.isArray(obj)) {
      obj.forEach((v, i) => rec(v, `${path}[${i}]`));
    } else if (obj && typeof obj === "object") {
      for (const [k, v] of Object.entries(obj)) {
        const p = path ? `${path}.${k}` : k;
        if (DENY.test(k)) offenders.push(p);
        rec(v, p);
      }
    }
  })(artifact(), "");

  assert.deepEqual(offenders, [], `Presentation keys in artifact:\n${offenders.join("\n")}`);
});
