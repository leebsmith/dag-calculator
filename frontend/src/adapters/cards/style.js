// Style card: styleguide picker, fermentation-target navigator (OE/AE region),
// and the SRM/IBU/whirlpool target sliders. Bespoke (not a catalog draft
// editor); the region math lives in engine/fermentation.js.

import {
  feasibleVertices,
  polygonCentroid,
  pointInRegion,
  edgeMargin,
  chebyshevCenter,
  targetFromExtract,
  extractFromTarget,
  cutaiaAbv,
  limitHeadroom,
  raySegment,
  sgToPlato,
} from "../../engine/fermentation.js";
import { styleConformance } from "../../engine/styleConformance.js";
import { STYLE_NODES as N } from "../../views/registry/style.js";
import {
  bitternessRatio,
  boundsOf,
  fieldOr,
  formatGravity,
  formatGravityRange,
  formatWithDecimals,
  provenanceFor,
} from "../../utils.js";
import { reportError } from "../../observability.js";

// Envelope inputs, in display order, with their authored step size.
const ENVELOPE_INPUTS = [
  { id: N.envelope.ogMin, step: "0.001" },
  { id: N.envelope.ogMax, step: "0.001" },
  { id: N.envelope.fgMin, step: "0.001" },
  { id: N.envelope.fgMax, step: "0.001" },
  { id: N.envelope.ibuMin, step: "1" },
  { id: N.envelope.ibuMax, step: "1" },
  { id: N.envelope.srmMin, step: "1" },
  { id: N.envelope.srmMax, step: "1" },
  { id: N.envelope.abvMin, step: "0.1" },
  { id: N.envelope.abvMax, step: "0.1" },
];


const SCALE_PINS = [
  { value: "abv", label: "ABV" },
  { value: "og", label: "OG" },
  { value: "fg", label: "FG" },
];

function abvInterval(ray) {
  if (!ray) return null;
  const a = cutaiaAbv(ray.oeMin, ray.aeMin);
  const b = cutaiaAbv(ray.oeMax, ray.aeMax);
  return Number.isFinite(a) && Number.isFinite(b) ? [Math.min(a, b), Math.max(a, b)] : null;
}

export function registerStyleCard(app, ctx) {
  const { engine, cache } = ctx;

  Object.assign(app, {
    selectedStyleId: "",
    styleRegion: [],
    styleEnvelope: null,
    styleSafestPoint: null,
    styleExtract: null,
    styleConformance: null,
    styleSai: null,
    styleAbvTouched: false,
    styleAbvCentered: false,
    styleSolvedAa: null,
    styleSolvedCap: null,
    styleSolvedVolume: null,

    // Reactive mirrors of the target roots (refreshed in computeStyleCard).
    targetSrm: 0,
    targetIbu: 30,
    whirlpoolFraction: 0,
    boilIbu: 30,
    whirlpoolIbu: 0,

    styleGravity(s, field) {
      return formatGravity(s?.[field]);
    },

    styleVitals(s) {
      return `${formatGravityRange(s?.og_min, s?.og_max)} / ${formatGravityRange(
        s?.fg_min,
        s?.fg_max
      )}`;
    },

    // ABV is the control; the OE/AE point is its inverse on the fixed-AA ray.
    // The region comes from the envelope (batch.style_* roots) so it tracks
    // envelope edits (WYSIWYG).
    computeStyleTarget() {
      const envelope = {
        ogMin: engine.resolve(N.envelope.ogMin),
        ogMax: engine.resolve(N.envelope.ogMax),
        fgMin: engine.resolve(N.envelope.fgMin),
        fgMax: engine.resolve(N.envelope.fgMax),
        abvMin: engine.resolve(N.envelope.abvMin),
        abvMax: engine.resolve(N.envelope.abvMax),
      };
      const complete =
        envelope.ogMin < envelope.ogMax &&
        envelope.fgMin < envelope.fgMax &&
        envelope.abvMin < envelope.abvMax;
      this.styleEnvelope = complete ? envelope : null;
      this.styleRegion = complete ? feasibleVertices(envelope) : [];
      this.styleSafestPoint = this.styleRegion.length >= 3 ? chebyshevCenter(this.styleRegion) : null;
      this.styleExtract = null;
      if (this.styleRegion.length < 3) return;
      // The solved batch is the graph marker for every pin; the target inverse
      // is only the pre-solve fallback.
      const solvedOg = engine.resolve(N.realized.og);
      const solvedAa = engine.resolve(N.apparentAttenuation);
      if (
        typeof solvedOg === "number" &&
        Number.isFinite(solvedOg) &&
        solvedOg > 1.0 &&
        typeof solvedAa === "number" &&
        Number.isFinite(solvedAa)
      ) {
        const oe = sgToPlato(solvedOg);
        this.styleExtract = { oe, ae: oe * (1 - solvedAa) };
        return;
      }
      const aa = this.styleSolvedAa;
      const abv = engine.get(N.targetAbv);
      const inverse =
        typeof aa === "number" && typeof abv === "number" ? extractFromTarget(aa, abv) : null;
      if (
        inverse &&
        (pointInRegion(this.styleRegion, inverse.oe, inverse.ae) ||
          edgeMargin(this.styleRegion, inverse.oe, inverse.ae) < 1e-6)
      ) {
        this.styleExtract = inverse;
      } else {
        const ray = Number.isFinite(aa) ? raySegment(this.styleRegion, aa) : null;
        if (ray) {
          const oe = (ray.oeMin + ray.oeMax) / 2;
          this.styleExtract = { oe, ae: oe * (1 - aa) };
        } else {
          const centroid = polygonCentroid(this.styleRegion);
          if (centroid) this.styleExtract = { oe: centroid[0], ae: centroid[1] };
        }
      }
    },

    // Persist a free ABV target. The fixed-AA ray is a visualization, not a
    // constraint; the solver realizes OG/FG from the composition.
    writeStyleAbv(value) {
      if (!Number.isFinite(value) || value <= 0) return false;
      const aa = this.styleSolvedAa;
      if (Number.isFinite(aa) && aa < 1) {
        const inverse = extractFromTarget(aa, value);
        if (inverse) this.styleExtract = inverse;
      }
      this.setRoot(N.targetAbv, value);
      this.styleAbvCentered = true;
      return true;
    },

    setStyleTargetAbv(valueOrElement) {
      const element =
        valueOrElement && typeof valueOrElement === "object" ? valueOrElement : null;
      const raw = element ? element.value : valueOrElement;
      const previous = this.styleAbvTarget;
      const numeric = Number(raw);
      if (raw === "" || raw === null || !Number.isFinite(numeric) || numeric <= 0) {
        if (element) element.value = formatWithDecimals(previous, 1);
        return;
      }
      const target = Math.round(numeric * 10) / 10;
      if (!this.writeStyleAbv(target)) {
        if (element) element.value = formatWithDecimals(previous, 1);
        return;
      }
      this.styleAbvTouched = true;
      this.styleAbvCentered = true;
      if (element) element.value = formatWithDecimals(target, 1);
      this.scheduleSolve();
      this.notify();
    },

    centerOrClampStyleAbv() {
      return false;
    },

    afterCompute() {
      return;
    },

    onBatchLoad() {
      const hasTarget = this.master.getRoot(N.targetAbv) !== undefined;
      this.styleAbvTouched = hasTarget;
      this.styleAbvCentered = hasTarget;
      this.styleExtract = null;
      this.styleSolvedAa = null;
      this.styleSolvedCap = null;
      this.styleSolvedVolume = null;
    },

    resetStyleTarget() {
      this.resetScaleTarget();
    },

    setScalePin(value) {
      if (!SCALE_PINS.some((pin) => pin.value === value)) return;
      if (value === this.scalePin) return;
      this.setRoot(N.scalePin, value);
      this.scheduleSolve();
      this.notify();
    },

    setScaleTarget(value) {
      const numeric = Number(value);
      if (!Number.isFinite(numeric) || numeric <= 0) return;
      const target =
        this.scalePin === "abv" ? Math.round(numeric * 10) / 10 : numeric;
      this.setRoot(this.activeScaleTargetRoot, target);
      this.styleAbvTouched = this.scalePin === "abv" ? true : this.styleAbvTouched;
      this.scheduleSolve();
      this.notify();
    },

    resetScaleTarget() {
      this.unsetRoot(this.activeScaleTargetRoot);
      this.scheduleSolve();
      this.notify();
    },

    styleTargetNearest() {
      const nearest = this.styleTargetRisk?.nearest;
      if (!nearest) return "—";
      const headroom = formatWithDecimals(nearest.headroom, 3);
      return `${nearest.label} (${headroom} ${nearest.unit})`;
    },

    refreshTargets() {
      this.targetSrm = engine.get(N.targets.srm);
      this.targetIbu = engine.get(N.targets.ibu);
      this.whirlpoolFraction = engine.get(N.targets.whirlpoolFraction);
      this.boilIbu = engine.get(N.targets.boilIbu);
      this.whirlpoolIbu = engine.get(N.targets.whirlpoolIbu);
    },

    setTargetSrm(value) {
      const n = Number(value);
      if (!Number.isFinite(n)) return;
      this.setRoot(N.targets.srm, Math.max(0, n));
      this.refreshTargets();
      this.scheduleSolve();
      this.notify();
    },

    setTargetIbu(value) {
      const n = Number(value);
      if (!Number.isFinite(n)) return;
      this.setRoot(N.targets.ibu, Math.max(0, n));
      this.refreshTargets();
      this.scheduleSolve();
      this.notify();
    },

    setWhirlpoolFraction(value) {
      const n = Number(value);
      if (!Number.isFinite(n)) return;
      this.setRoot(N.targets.whirlpoolFraction, Math.max(0, Math.min(1, n)));
      this.refreshTargets();
      this.scheduleSolve();
      this.notify();
    },

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
    selectedStyle: {      configurable: true,
      get() {
        return this.selectedStyleId ? cache.references.style[this.selectedStyleId] ?? null : null;
      },
    },
    styleAbvBounds: {
      configurable: true,
      get() {
        if (!this.styleExtract) return null;
        const aa = this.styleSolvedAa;
        if (!Number.isFinite(aa) || aa >= 1) return null;
        return abvInterval(raySegment(this.styleRegion, aa));
      },
    },
    styleAbvTarget: {
      configurable: true,
      get() {
        const target = engine.get(N.targetAbv);
        if (Number.isFinite(target)) return target;
        return this.styleTargetInfo?.abv ?? null;
      },
    },
    scalePin: {
      configurable: true,
      get() {
        return engine.get(N.scalePin) ?? "abv";
      },
    },
    scalePinOptions: {
      configurable: true,
      get() {
        return SCALE_PINS;
      },
    },
    scalePinLabel: {
      configurable: true,
      get() {
        return SCALE_PINS.find((pin) => pin.value === this.scalePin)?.label ?? "ABV";
      },
    },
    activeScaleTargetRoot: {
      configurable: true,
      get() {
        if (this.scalePin === "og") return N.targetOg;
        if (this.scalePin === "fg") return N.targetFg;
        return N.targetAbv;
      },
    },
    activeScaleTargetLabel: {
      configurable: true,
      get() {
        return `Target ${this.scalePinLabel}`;
      },
    },
    activeScaleTarget: {
      configurable: true,
      get() {
        const value = engine.get(this.activeScaleTargetRoot);
        return typeof value === "number" && Number.isFinite(value) ? value : null;
      },
    },
    activeScaleTargetDisplay: {
      configurable: true,
      get() {
        const value = this.activeScaleTarget;
        if (value == null) return "";
        return this.scalePin === "abv"
          ? formatWithDecimals(value, 1)
          : formatGravity(value);
      },
    },
    activeScaleTargetUnit: {
      configurable: true,
      get() {
        return this.scalePin === "abv" ? "%" : "SG";
      },
    },
    activeScaleTargetStep: {
      configurable: true,
      get() {
        return this.scalePin === "abv" ? "0.1" : "0.001";
      },
    },
    styleTargetInfo: {
      configurable: true,
      get() {
        if (!this.styleExtract) return null;
        return targetFromExtract(this.styleExtract.oe, this.styleExtract.ae);
      },
    },
    styleTargetRisk: {
      configurable: true,
      get() {
        if (!this.styleExtract || !this.styleSafestPoint) return null;
        const margin = edgeMargin(this.styleRegion, this.styleExtract.oe, this.styleExtract.ae);
        const radius = this.styleSafestPoint.radius;
        const safety = radius > 0 ? Math.max(0, Math.min(1, margin / radius)) : null;
        const nearest = limitHeadroom(this.styleEnvelope, this.styleExtract.oe, this.styleExtract.ae);
        return { safety, nearest };
      },
    },
    // SVG geometry for the preview: the region polygon plus the marker/safest
    // points, in pixel space (no viewBox — an SVG `viewBox` binding is defeated
    // by HTML attribute lowercasing). The region is drawn at its true aspect
    // ratio, its longer side spanning REGION_PX, with PAD_PX around it; the
    // shorter side (and the vertical slider) is clamped to MIN_PX.
    stylePreview: {
      configurable: true,
      get() {
        const region = this.styleRegion;
        if (region.length < 3 || !this.styleExtract || !this.styleSafestPoint) return null;
        const xs = region.map(([x]) => x);
        const ys = region.map(([, y]) => y);
        const xMin = Math.min(...xs);
        const xMax = Math.max(...xs);
        const yMin = Math.min(...ys);
        const yMax = Math.max(...ys);
        const spanX = xMax - xMin || 1;
        const spanY = yMax - yMin || 1;
        const REGION_PX = 220;
        const PAD_PX = 16;
        const MIN_PX = 64;
        const scale = REGION_PX / Math.max(spanX, spanY);
        const regionW = spanX * scale;
        const regionH = spanY * scale;
        const width = Math.max(regionW + 2 * PAD_PX, MIN_PX);
        const height = Math.max(regionH + 2 * PAD_PX, MIN_PX);
        const xOffset = (width - regionW) / 2;
        const yOffset = (height - regionH) / 2;
        const sx = (x) => xOffset + (x - xMin) * scale;
        const sy = (y) => height - yOffset - (y - yMin) * scale;
        const aa = this.styleSolvedAa;
        const ray =
          this.scalePin === "abv" && Number.isFinite(aa)
            ? raySegment(region, aa)
            : null;
        return {
          width,
          height,
          polygon: region.map(([x, y]) => `${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join(" "),
          marker: { x: sx(this.styleExtract.oe).toFixed(1), y: sy(this.styleExtract.ae).toFixed(1) },
          safest: {
            x: sx(this.styleSafestPoint.oe).toFixed(1),
            y: sy(this.styleSafestPoint.ae).toFixed(1),
          },
          ray: ray
            ? {
                x1: sx(ray.oeMin).toFixed(1),
                y1: sy(ray.aeMin).toFixed(1),
                x2: sx(ray.oeMax).toFixed(1),
                y2: sy(ray.aeMax).toFixed(1),
              }
            : null,
        };
      },
    },
    styleSrmBounds: {
      configurable: true,
      get() {
        return boundsOf(this.fieldsById, N.envelope.srmMin, N.envelope.srmMax);
      },
    },
    styleIbuBounds: {
      configurable: true,
      get() {
        return boundsOf(this.fieldsById, N.envelope.ibuMin, N.envelope.ibuMax);
      },
    },
    // The SRM/IBU target roots live on the batch slice, but the style card shows
    // them as sliders; expose their field models (with `seeded`/`seededValue`)
    // for the seed provenance affordance.
    srmTargetField: {
      configurable: true,
      get() {
        return this.fieldsById?.[N.targets.srm] ?? null;
      },
    },
    ibuTargetField: {
      configurable: true,
      get() {
        return this.fieldsById?.[N.targets.ibu] ?? null;
      },
    },
    srmTargetProvenance: {
      configurable: true,
      get() {
        return provenanceFor(this.srmTargetField);
      },
    },
    ibuTargetProvenance: {
      configurable: true,
      get() {
        return provenanceFor(this.ibuTargetField);
      },
    },
    fermentationField: {
      configurable: true,
      get() {
        return fieldOr(this.fieldsById, N.fermentation);
      },
    },
    fermentationProvenance: {
      configurable: true,
      get() {
        return provenanceFor(this.fermentationField);
      },
    },
    // Envelope editors, in display order, with resolved field models and seed
    // provenance so the template stays a dumb x-for.
    styleEnvelopeFields: {
      configurable: true,
      get() {
        return ENVELOPE_INPUTS.map(({ id, step }) => {
          const field = fieldOr(this.fieldsById, id);
          return { id, step, field, provenance: provenanceFor(field) };
        });
      },
    },
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
    // Planned bitterness balance: planned IBU over the planned OG's gravity
    // units (from the fermentation-target navigator), so it needs no solve.
    ibuGu: {
      configurable: true,
      get() {
        return bitternessRatio(this.targetIbu, this.styleTargetInfo?.og);
      },
    },
    ibuGuDisplay: {
      configurable: true,
      get() {
        return typeof this.ibuGu === "number" ? this.ibuGu.toFixed(2) : "—";
      },
    },
    whirlpoolPctDisplay: {
      configurable: true,
      get() {
        const fraction = this.whirlpoolFraction;
        return typeof fraction === "number" ? Math.round(fraction * 100) : 0;
      },
    },
    boilIbuDisplay: {
      configurable: true,
      get() {
        const ibu = this.boilIbu;
        return typeof ibu === "number" ? ibu.toFixed(1) : "—";
      },
    },
    whirlpoolIbuDisplay: {
      configurable: true,
      get() {
        const ibu = this.whirlpoolIbu;
        return typeof ibu === "number" ? ibu.toFixed(1) : "—";
      },
    },
  });
}

export function refreshStyleCard(app, ctx) {
  app.selectedStyleId = ctx.engine.identity?.style?.id ?? "";
  const read = (path) => {
    try {
      return ctx.engine.resolve(path);
    } catch (err) {
      reportError("style.solvedAa", err);
      return undefined;
    }
  };
  app.styleSolvedAa = read(N.apparentAttenuation);
  app.styleSolvedCap = read(N.yeastCap);
  const postBoilVolume = read(N.postBoilVolume);
  app.styleSolvedVolume = Number.isFinite(postBoilVolume)
    ? postBoilVolume
    : ctx.engine.get(N.fermVolume);
  app.computeStyleTarget();
  app.refreshTargets();
}

export const KEYS = ["selectedStyleId", "styleRegion", "styleEnvelope", "styleSafestPoint", "styleExtract", "styleConformance", "styleSai", "styleAbvTouched", "styleAbvCentered", "styleSolvedAa", "styleSolvedCap", "styleSolvedVolume", "targetSrm", "targetIbu", "whirlpoolFraction", "boilIbu", "whirlpoolIbu", "styleGravity", "styleVitals", "computeStyleTarget", "writeStyleAbv", "setStyleTargetAbv", "centerOrClampStyleAbv", "afterCompute", "onBatchLoad", "resetStyleTarget", "scalePin", "scalePinOptions", "scalePinLabel", "activeScaleTargetRoot", "activeScaleTargetLabel", "activeScaleTarget", "activeScaleTargetDisplay", "activeScaleTargetUnit", "activeScaleTargetStep", "setScalePin", "setScaleTarget", "resetScaleTarget", "styleTargetNearest", "refreshTargets", "setTargetSrm", "setTargetIbu", "setWhirlpoolFraction", "styleConformanceReport", "selectedStyle", "styleAbvBounds", "styleAbvTarget", "styleTargetInfo", "styleTargetRisk", "stylePreview", "styleSrmBounds", "styleIbuBounds", "srmTargetField", "ibuTargetField", "srmTargetProvenance", "ibuTargetProvenance", "fermentationField", "fermentationProvenance", "styleEnvelopeFields", "ibuGu", "ibuGuDisplay", "whirlpoolPctDisplay", "boilIbuDisplay", "whirlpoolIbuDisplay"];
