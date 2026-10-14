import test from "node:test";
import assert from "node:assert/strict";

import { loadArtifact } from "./helpers.js";
import { ingestEquipment } from "../../frontend/src/store/equipmentIngest.js";

const artifact = loadArtifact();

const approx = (actual, expected, eps = 1e-6) =>
  assert.ok(Math.abs(actual - expected) < eps, `${actual} !== ${expected}`);

test("metric profile passes through unchanged", () => {
  const raw = {
    "herms-30l": {
      units: "metric",
      data: {
        id: "herms-30l",
        name: "HERMS 30L",
        description: "30 L rig",
        max_hlt_volume_l: 30,
        mash_tun_mass_kg: 6.5,
        conversion_efficiency: 0.9,
      },
    },
  };
  assert.deepEqual(ingestEquipment(raw, artifact), { "herms-30l": raw["herms-30l"].data });
});

test("imperial profile converts to metric and drops imperial keys", () => {
  const raw = {
    "ten-gal": {
      units: "imperial",
      data: {
        id: "ten-gal",
        name: "Ten Gal",
        description: "imperial rig",
        max_hlt_volume_gal: 10,
        boil_off_rate_gal_per_hr: 0.7925,
        grain_absorption_factor_qt_per_lb: 0.4601,
        mash_tun_mass_lb: 14.33,
        mash_tun_specific_heat_btu_per_lb_f: 0.12,
        conversion_efficiency: 0.9,
        shrinkage_pct: 0.04,
      },
    },
  };
  const out = ingestEquipment(raw, artifact)["ten-gal"];

  assert.equal(out.id, "ten-gal");
  assert.equal(out.name, "Ten Gal");
  assert.equal(out.description, "imperial rig");

  approx(out.max_hlt_volume_l, 10 * 3.785411784); // 37.854 L
  approx(out.boil_off_rate_l_per_hr, 0.7925 * 3.785411784); // ~3.0 L/hr
  approx(out.grain_absorption_factor_l_per_kg, 0.4601 * 2.08635); // ~0.96 L/kg
  approx(out.mash_tun_mass_kg, 14.33 * 0.45359237); // ~6.5 kg
  approx(out.mash_tun_specific_heat, 0.12); // BTU/(lb·°F) == kcal/(kg·°C)

  // Unitless fields are untouched.
  assert.equal(out.conversion_efficiency, 0.9);
  assert.equal(out.shrinkage_pct, 0.04);

  // No imperial-suffixed keys leak into the metric output.
  assert.ok(!("max_hlt_volume_gal" in out));
  assert.ok(!("mash_tun_mass_lb" in out));
  assert.ok(!("mash_tun_specific_heat_btu_per_lb_f" in out));
});

test("flat (unwrapped) profiles are treated as metric", () => {
  const raw = {
    legacy: { id: "legacy", name: "Legacy", max_hlt_volume_l: 20 },
  };
  assert.deepEqual(ingestEquipment(raw, artifact), { legacy: { id: "legacy", name: "Legacy", max_hlt_volume_l: 20 } });
});
