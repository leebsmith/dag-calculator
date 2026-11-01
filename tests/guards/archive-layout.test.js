// Archive layout: completed plans live in completion-month buckets. The flat
// root holds only the index; a loose plan is a structural regression, not a
// filing preference.

import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ARCHIVE = fileURLToPath(new URL("../../plans/archive", import.meta.url));
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;

function entries(path) {
  return readdirSync(path, { withFileTypes: true });
}

test("the archive root holds only the index and month buckets", () => {
  const offenders = entries(ARCHIVE)
    .filter((entry) => entry.name !== "README.md" && !(entry.isDirectory() && MONTH.test(entry.name)))
    .map((entry) => entry.name);
  assert.deepEqual(offenders, [], `archive root must be README.md plus YYYY-MM/ folders: ${offenders.join(", ")}`);
});

test("each month bucket holds only slugged plan files", () => {
  const offenders = [];
  for (const bucket of entries(ARCHIVE)) {
    if (!bucket.isDirectory() || !MONTH.test(bucket.name)) continue;
    const plans = entries(`${ARCHIVE}/${bucket.name}`);
    if (plans.length === 0) offenders.push(`${bucket.name}/ is empty`);
    for (const plan of plans) {
      if (!plan.isFile() || !SLUG.test(plan.name)) {
        offenders.push(`${bucket.name}/${plan.name}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `archive buckets must hold lowercase-hyphen .md plans: ${offenders.join(", ")}`);
});
