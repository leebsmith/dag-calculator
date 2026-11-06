// Style card / conformance: the realized batch scored against the sealed style
// envelope. The report is built once per compute (stepView stores it before the
// producer runs, so downstream field models read the same verdicts).

import { styleConformance } from "../../../engine/styleConformance.js";
import { displayValue, nonlinearFns } from "../../../views/producer.js";
import { STYLE_NODES as N } from "../../../views/registry/style.js";
import { UNIT_SYMBOLS, masterUnit, unitDecimals } from "../../../views/registry/units.js";
import { formatWithDecimals, unitSymbol } from "../../../utils.js";
import { reportError } from "../../../observability.js";

const STATUS_LABELS = { within: "Within", grace: "Grace", drift: "Drift", severe: "Severe" };

function conformanceMeta(artifact, unitMode, nl) {
  const quantity = (dimension, value) => {
    const unitId = masterUnit(unitMode, dimension);
    const decimals = unitDecimals(dimension, unitId) ?? 1;
    const symbol = unitSymbol(UNIT_SYMBOLS, dimension, unitId);
    const shown = displayValue(artifact, dimension, unitId, value, nl);
    return `${formatWithDecimals(shown, decimals)} ${symbol}`;
  };
  return {
    og: { label: "Original gravity", format: (v) => quantity("gravity", v) },
    fg: { label: "Final gravity", format: (v) => quantity("gravity", v) },
    abv: { label: "ABV", format: (v) => `${formatWithDecimals(v, 1)}%` },
    ibu: { label: "IBU", format: (v) => `${formatWithDecimals(v, 0)} IBU` },
    srm: { label: "Color", format: (v) => quantity("beer_color", v) },
    aa: { label: "Attenuation", format: (v) => `${formatWithDecimals(v, 1)}%` },
    bugu: { label: "BU:GU", format: (v) => formatWithDecimals(v, 2) },
  };
}

export function createStyleConformance({ engine, artifact, getView }) {
  const nl = nonlinearFns(artifact, engine);
  const actions = {
    styleConformance: null,
    styleSai: null,

    styleConformanceReport() {
      const read = (path) => {
        try {
          return engine.resolve(path);
        } catch (err) {
          reportError("style.conformance.resolve", err);
          return undefined;
        }
      };
      const og = read(N.realized.og);
      const fg = read(N.realized.fg);
      const abv = read(N.realized.abv);
      const ibu = read(N.targets.ibu);
      const srm = read(N.realized.srm);
      if ([og, fg, abv, ibu, srm].some((v) => typeof v !== "number" || !Number.isFinite(v))) {
        return null;
      }
      const envelope = {
        ogMin: engine.resolve(N.envelope.ogMin),
        ogMax: engine.resolve(N.envelope.ogMax),
        fgMin: engine.resolve(N.envelope.fgMin),
        fgMax: engine.resolve(N.envelope.fgMax),
        abvMin: engine.resolve(N.envelope.abvMin),
        abvMax: engine.resolve(N.envelope.abvMax),
        ibuMin: engine.resolve(N.envelope.ibuMin),
        ibuMax: engine.resolve(N.envelope.ibuMax),
        srmMin: engine.resolve(N.envelope.srmMin),
        srmMax: engine.resolve(N.envelope.srmMax),
      };
      const report = styleConformance({ og, fg, abv, ibu, srm }, envelope);
      report.styleId = engine.identity?.style?.id ?? null;
      return report;
    },
  };

  Object.defineProperties(actions, {
    conformanceSummary: {
      configurable: true,
      get() {
        const view = getView();
        const c = view.styleConformance;
        if (!c || !c.hasBaseline) return null;
        const meta = conformanceMeta(artifact, view.unitMode, nl);
        const dimensions = Object.entries(c.dimensions)
          .filter(([, d]) => d)
          .map(([id, d]) => ({
            id,
            label: meta[id].label,
            value: meta[id].format(d.value),
            status: STATUS_LABELS[d.status],
            z: d.z,
          }));
        return { sai: c.sai, dimensions };
      },
    },
  });
  return actions;
}

export function registerStyleConformance(app, ctx = {}) {
  const actions = createStyleConformance({ ...ctx, getView: ctx.getView ?? (() => app) });
  Object.defineProperties(app, Object.getOwnPropertyDescriptors(actions));
  return actions;
}

export const KEYS = ["styleConformance", "styleSai", "styleConformanceReport", "conformanceSummary"];
