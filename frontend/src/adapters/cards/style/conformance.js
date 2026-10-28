// Style card / conformance: the realized batch scored against the sealed style
// envelope. The report is built once per compute (stepView stores it before the
// producer runs, so downstream field models read the same verdicts).

import { styleConformance } from "../../../engine/styleConformance.js";
import { STYLE_NODES as N } from "../../../views/registry/style.js";
import { formatGravity, formatWithDecimals } from "../../../utils.js";
import { reportError } from "../../../observability.js";

export function registerStyleConformance(app, ctx) {
  const { engine } = ctx;

  Object.assign(app, {
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
  });

  Object.defineProperties(app, {
    conformanceSummary: {
      configurable: true,
      get() {
        const c = this.styleConformance;
        if (!c || !c.hasBaseline) return null;
        const meta = {
          og: { label: "Original gravity", fmt: formatGravity, unit: " SG" },
          fg: { label: "Final gravity", fmt: formatGravity, unit: " SG" },
          abv: { label: "ABV", fmt: (v) => formatWithDecimals(v, 1), unit: "%" },
          ibu: { label: "IBU", fmt: (v) => formatWithDecimals(v, 0), unit: " IBU" },
          srm: { label: "SRM", fmt: (v) => formatWithDecimals(v, 0), unit: " SRM" },
          aa: { label: "Attenuation", fmt: (v) => formatWithDecimals(v, 1), unit: "%" },
          bugu: { label: "BU:GU", fmt: (v) => formatWithDecimals(v, 2), unit: "" },
        };
        const statusLabel = { within: "Within", grace: "Grace", drift: "Drift", severe: "Severe" };
        const dimensions = Object.entries(c.dimensions)
          .filter(([, d]) => d)
          .map(([id, d]) => ({
            id,
            label: meta[id].label,
            value: meta[id].fmt(d.value) + meta[id].unit,
            status: statusLabel[d.status],
            z: d.z,
          }));
        return { sai: c.sai, dimensions };
      },
    },
  });
}

export const KEYS = ["styleConformance", "styleSai", "styleConformanceReport", "conformanceSummary"];
