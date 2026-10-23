import test from "node:test";
import assert from "node:assert/strict";

import {
  coolingTemperature,
  effectiveWhirlpoolMinutes,
  productFormUtilization,
  relativeIsomerizationRate,
  whirlpoolIbu,
  whirlpoolMassKg,
  whirlpoolUtilization,
} from "../../frontend/src/views/whirlpool.js";

const BASE = {
  durationMin: 30,
  initialTempC: 99,
  ambientTempC: 20,
  kPerMin: 0.0092,
};

test("Arrhenius relative rate matches the reference benchmarks", () => {
  const cases = [
    [100, 1.009],
    [90, 0.4907],
    [80, 0.229],
    [70, 0.1022],
    [60, 0.0435],
    [50, 0.0175],
  ];
  for (const [tempC, expected] of cases) {
    const actual = relativeIsomerizationRate(tempC);
    assert.ok(Math.abs(actual - expected) < 0.004, `${tempC}C: ${actual}`);
  }
});

test("passive 30-minute rest integrates to the reference effective time", () => {
  const effective = effectiveWhirlpoolMinutes(BASE);
  assert.ok(Math.abs(effective - 14.795001104424578) < 1e-9, `t_eff=${effective}`);
});

test("isothermal boil and cool sub-isomerization windows match the reference vectors", () => {
  const boiling = effectiveWhirlpoolMinutes({
    durationMin: 30,
    initialTempC: 100,
    ambientTempC: 100,
    kPerMin: 0,
  });
  assert.ok(Math.abs(boiling - 30.276952309409356) < 1e-9, `boiling t_eff=${boiling}`);

  const cool = effectiveWhirlpoolMinutes({
    durationMin: 20,
    initialTempC: 60,
    ambientTempC: 20,
    kPerMin: 0,
  });
  assert.ok(Math.abs(cool - 0.8696428564474775) < 1e-9, `cool t_eff=${cool}`);
});

test("50 g at 10% AA in 20 L of 1.050 during the passive rest yields 28.33 IBU", () => {
  const result = whirlpoolIbu({
    massKg: 0.05,
    alphaFraction: 0.1,
    volumeL: 20,
    gravity: 1.05,
    ...BASE,
  });
  assert.ok(Math.abs(result.ibu - 28.327469657064622) < 1e-6, `IBU=${result.ibu}`);
  assert.ok(Math.abs(result.utilization - 0.11330987862825846) < 1e-9);
});

test("mass back-calculation inverts the forward model", () => {
  const mass = whirlpoolMassKg({
    ibu: 28.327469657064622,
    alphaFraction: 0.1,
    volumeL: 20,
    gravity: 1.05,
    ...BASE,
  });
  assert.ok(Math.abs(mass - 0.05) < 1e-12, `mass=${mass}`);
});

test("flowable extract applies the 1.20 utilization scalar", () => {
  assert.equal(productFormUtilization("t90_pellet"), 1);
  assert.equal(productFormUtilization("flowable_extract"), 1.2);

  const common = {
    alphaFraction: 0.45,
    volumeL: 20,
    gravity: 1.05,
    ...BASE,
  };
  const pelletMass = whirlpoolMassKg({ ibu: 30, ...common, productForm: "t90_pellet" });
  const extractMass = whirlpoolMassKg({ ibu: 30, ...common, productForm: "flowable_extract" });
  assert.ok(Math.abs(pelletMass / extractMass - 1.2) < 1e-12);
  assert.ok(Math.abs(whirlpoolMassKg({ ibu: 30, ...common }) - pelletMass) < 1e-12);

  const pellet = whirlpoolIbu({ massKg: 0.02, ...common, productForm: "t90_pellet" });
  const extract = whirlpoolIbu({ massKg: 0.02, ...common, productForm: "flowable_extract" });
  assert.ok(Math.abs(extract.ibu / pellet.ibu - 1.2) < 1e-12);
});

test("cooling temperature follows Newton decay", () => {
  const t = coolingTemperature(30, 99, 20, 0.0092);
  assert.ok(t > 79 && t < 81, `T(30)=${t}`);
  assert.equal(coolingTemperature(0, 99, 20, 0.0092), 99);
});

test("invalid inputs are guarded", () => {
  assert.equal(effectiveWhirlpoolMinutes({ durationMin: 0 }), 0);
  assert.equal(effectiveWhirlpoolMinutes({ durationMin: -1 }), 0);
  assert.equal(relativeIsomerizationRate(-273.15), 0);
  assert.equal(whirlpoolUtilization(0, 10), 0);
  assert.deepEqual(
    whirlpoolIbu({ massKg: 0, alphaFraction: 0.1, volumeL: 20, gravity: 1.05, ...BASE }),
    { ibu: 0, effectiveMinutes: 0, utilization: 0 }
  );
  assert.equal(
    whirlpoolMassKg({ ibu: 0, alphaFraction: 0.1, volumeL: 20, gravity: 1.05, ...BASE }),
    null
  );
  assert.equal(
    whirlpoolMassKg({ ibu: 20, alphaFraction: 0, volumeL: 20, gravity: 1.05, ...BASE }),
    null
  );
});
