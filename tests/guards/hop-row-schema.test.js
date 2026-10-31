// A picker may seed a field the row schema does not declare, and nothing fails at
// write time: the row keeps the extra key, and the report catalog — built from
// declared paths — cannot cover it, so the bundle is rejected at preview. The
// makers are the only writers, so their output is where the contract is checked.

import test from "node:test";
import assert from "node:assert/strict";

import { makeBoilRow } from "../../frontend/src/views/producer/boilPolicy.js";
import { makeWhirlpoolRow } from "../../frontend/src/views/producer/whirlpoolPolicy.js";
import { WHIRLPOOL_ROW_DEFAULTS } from "../../frontend/src/views/registry/hops.js";
import { artifact, read } from "./util.js";

const seeds = () => [
  ...Object.values(JSON.parse(read("data/seeds/hops.json"))),
  ...Object.values(JSON.parse(read("data/seeds/hop-products.json"))),
];

test("every hop row maker seeds only schema-declared fields", () => {
  const a = artifact();
  const allowed = {
    "boil_hop_row": new Set(Object.keys(a.primitive_schemas["boil_hop_row"])),
    "whirlpool_hop_row": new Set(Object.keys(a.primitive_schemas["whirlpool_hop_row"])),
  };
  const offenders = [];
  for (const item of seeds()) {
    const rows = [
      ["boil_hop_row", makeBoilRow(item)],
      ["whirlpool_hop_row", makeWhirlpoolRow(item, WHIRLPOOL_ROW_DEFAULTS)],
    ];
    for (const [schema, row] of rows) {
      for (const key of Object.keys(row)) {
        if (!allowed[schema].has(key)) offenders.push(`${schema}:${item.id}.${key}`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    "a seeded field must be declared, or the report catalog cannot cover the row"
  );
});
