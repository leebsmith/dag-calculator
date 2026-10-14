import test from "node:test";
import assert from "node:assert/strict";

import { UNIT_DIMENSIONS } from "../../frontend/src/views/registry/units.js";
import { artifact } from "./util.js";

// The master unit menu must cover every artifact dimension that offers an
// alternate unit — otherwise those fields have no switch. And every menu entry
// must map to a real dimension with valid, base-first units (a typo'd unit id
// would otherwise only blow up at display time).
test("unit menu covers every dimension with alternate units", () => {
  const a = artifact();
  const menu = new Set(UNIT_DIMENSIONS.map((d) => d.id));
  const missing = Object.entries(a.dimensions)
    .filter(([, def]) => Object.keys(def.units ?? {}).length > 0)
    .map(([id]) => id)
    .filter((id) => !menu.has(id))
    .sort();
  assert.deepEqual(
    missing,
    [],
    `dimensions with switchable units missing from UNIT_DIMENSIONS: ${missing.join(", ")}`
  );
});

test("every menu dimension maps to base-first, valid artifact units", () => {
  const a = artifact();
  for (const d of UNIT_DIMENSIONS) {
    const def = a.dimensions[d.id];
    assert.ok(def, `UNIT_DIMENSIONS "${d.id}" has no artifact dimension`);
    assert.ok(d.group, `UNIT_DIMENSIONS "${d.id}" has no menu group (column)`);
    assert.equal(
      d.units[0]?.[0],
      def.base_unit,
      `"${d.id}" first menu unit must be the dimension's base unit`
    );
    for (const [unitId] of d.units) {
      assert.ok(
        unitId === def.base_unit ||
          Object.prototype.hasOwnProperty.call(def.units ?? {}, unitId),
        `"${d.id}" menu lists unknown unit "${unitId}"`
      );
    }
    if (d.default !== undefined) {
      assert.ok(
        d.default === def.base_unit ||
          Object.prototype.hasOwnProperty.call(def.units ?? {}, d.default),
        `"${d.id}" default unit "${d.default}" is not a valid unit`
      );
    }
  }
});
