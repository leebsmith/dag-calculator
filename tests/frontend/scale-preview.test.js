import test from "node:test";
import assert from "node:assert/strict";

import {
  scalePreviewCaption,
  scalePreviewRows,
  scalePreviewState,
} from "../../frontend/src/views/producer/scalePreview.js";

const STYLE = {
  og_min: 1.056,
  og_max: 1.075,
  fg_min: 1.01,
  fg_max: 1.018,
  abv_min: 5.5,
  abv_max: 7.5,
};

const ROWS = [
  { pin: "abv", ok: true, og: 1.06, fg: 1.013, abv: 6.2, sugar_extract_share: 0.081 },
  { pin: "og", ok: true, og: 1.07, fg: 1.015, abv: 7.2, sugar_extract_share: 0.087 },
  { pin: "fg", ok: false, reason: "" },
];

test("scalePreview: rows read the style envelope and mark the active pin", () => {
  const rows = scalePreviewRows({ rows: ROWS, style: STYLE, pin: "ob" });
  assert.equal(rows.length, 3);

  assert.deepEqual(rows[0], {
    pin: "abv",
    pinLabel: "ABV",
    active: false,
    ok: true,
    statusLabel: "",
    ogDisplay: "1.060",
    fgDisplay: "1.013",
    abvDisplay: "6.2",
    shareValue: 0.081,
    shareDisplay: "8.1%",
    ogClass: "status-badge-success",
    fgClass: "status-badge-success",
    abvClass: "status-badge-success",
  });

  assert.equal(scalePreviewRows({ rows: ROWS, style: STYLE, pin: "fg" })[2].active, true);
});

test("scalePreview: an out-of-envelope row reads as danger, an unreachable one as out", () => {
  const rows = scalePreviewRows({
    rows: [ROWS[1], ROWS[2]],
    style: { ...STYLE, og_max: 1.065 },
    pin: "og",
  });
  assert.equal(rows[0].ogClass, "text-danger");
  assert.equal(rows[0].fgClass, "status-badge-success");

  assert.equal(rows[1].ok, false);
  assert.equal(rows[1].statusLabel, "unreachable");
  assert.equal(rows[1].ogDisplay, "—");
  assert.equal(rows[1].shareValue, null);
  assert.equal(rows[1].shareDisplay, "—");
  assert.equal(rows[1].ogClass, "text-danger");
});

test("scalePreview: a row without a style envelope is not applicable", () => {
  const [row] = scalePreviewRows({ rows: [ROWS[0]], style: {}, pin: "abv" });
  assert.equal(row.ok, true);
  assert.equal(row.ogClass, "");
  assert.equal(row.shareDisplay, "8.1%");
});

test("scalePreview: share mode names the authored share", () => {
  const rows = scalePreviewRows({ rows: ROWS, style: STYLE, pin: "abv" });
  assert.equal(
    scalePreviewCaption({ intent: "share", share: 0.125, rows }),
    "Previews hold 12.5% of extract"
  );
});

test("scalePreview: dose mode names the dose and the reachable span", () => {
  const rows = scalePreviewRows({ rows: ROWS, style: STYLE, pin: "abv" });
  assert.equal(
    scalePreviewCaption({ intent: "dose", doseLabel: "0.50 kg", rows }),
    "Previews hold 0.50 kg sugar extract · 8.1–8.7% of extract"
  );
  assert.equal(
    scalePreviewCaption({ intent: "dose", doseLabel: "1.1 lb", rows: [ROWS[2]] }),
    "Previews hold 1.1 lb sugar extract"
  );
});

test("scalePreview: the composed state pairs rows and caption", () => {
  const state = scalePreviewState({
    rows: ROWS,
    style: STYLE,
    pin: "fg",
    intent: "share",
    share: 0.125,
  });
  assert.equal(state.rows.find((row) => row.active).pin, "fg");
  assert.equal(state.caption, "Previews hold 12.5% of extract");
});
