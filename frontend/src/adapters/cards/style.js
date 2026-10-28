// Style card: styleguide picker, fermentation-target navigator (OE/AE region),
// and the SRM/IBU/whirlpool target sliders. Bespoke (not a catalog draft
// editor); the region math lives in engine/fermentation.js.

import {
  abvContour,
  chebyshevCenter,
  compositionLocus,
  cutaiaAbv,
  edgeMargin,
  extractFromTarget,
  feasibleVertices,
  limitHeadroom,
  platoToSg,
  pointInRegion,
  polygonCentroid,
  raySegment,
  sgToPlato,
  targetFromExtract,
} from "../../engine/fermentation.js";
import { styleConformance } from "../../engine/styleConformance.js";
import { attenuationCapSummary } from "../../views/producer/attenuationCap.js";
import { STYLE_NODES as N } from "../../views/registry/style.js";
import {
  bitternessRatio,
  boundsOf,
  fieldOr,
  formatGravity,
  formatGravityRange,
  formatPercentValue,
  formatWithDecimals,
  provenanceFor,
  toPercentValue,
} from "../../utils.js";
import { reportError } from "../../observability.js";

// Fermentation plane geometry. A fixed square plot keeps the SVG scalable: the
// coordinate space is constant, so the template can hardcode the viewBox.
const PLOT_PX = 320;
const PLOT_MARGIN = { left: 44, right: 12, top: 12, bottom: 34 };
const PLOT_WIDTH = PLOT_MARGIN.left + PLOT_PX + PLOT_MARGIN.right;
const PLOT_HEIGHT = PLOT_MARGIN.top + PLOT_PX + PLOT_MARGIN.bottom;
const TICK_COUNT = 5;

function tickValues(min, max) {
  return Array.from(
    { length: TICK_COUNT },
    (_, index) => min + ((max - min) * index) / (TICK_COUNT - 1)
  );
}

function polylinePath(points, px, py) {
  if (!points || points.length < 2) return "";
  return points
    .map(([x, y], index) => `${index === 0 ? "M" : "L"}${px(x)} ${py(y)}`)
    .join(" ");
}

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
    // Reactive mirrors of the active pin/target. Alpine only re-renders on
    // property assignments; getters over the non-reactive engine go stale.
    scalePin: "abv",
    scalePinLabel: "ABV",
    activeScaleTargetRoot: N.targetAbv,
    activeScaleTarget: null,
    activeScaleTargetLabel: "Target ABV",
    activeScaleTargetDisplay: "",
    activeScaleTargetUnit: "%",
    activeScaleTargetStep: "0.1",
    scaleTargetMismatch: "",
    attenuationBlend: null,
    attenuationCap: null,
    attenuationSugarLift: null,

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

    syncScalePinState() {
      const pin = engine.get(N.scalePin) ?? "abv";
      const root =
        pin === "og" ? N.targetOg : pin === "fg" ? N.targetFg : N.targetAbv;
      const label = SCALE_PINS.find((entry) => entry.value === pin)?.label ?? "ABV";
      const raw = engine.get(root);
      const value = typeof raw === "number" && Number.isFinite(raw) ? raw : null;
      this.scalePin = pin;
      this.scalePinLabel = label;
      this.activeScaleTargetRoot = root;
      this.activeScaleTarget = value;
      this.activeScaleTargetLabel = `Target ${label}`;
      this.activeScaleTargetUnit = pin === "abv" ? "%" : "SG";
      this.activeScaleTargetStep = pin === "abv" ? "0.1" : "0.001";
      this.activeScaleTargetDisplay =
        value == null
          ? ""
          : pin === "abv"
            ? formatWithDecimals(value, 1)
            : formatGravity(value);
    },

    setScalePin(value) {
      if (!SCALE_PINS.some((pin) => pin.value === value)) return;
      if (value === this.scalePin) return;
      this.setRoot(N.scalePin, value);
      this.clearInputDraft(this.inputKey("field", "scale-target"));
      this.syncScalePinState();
      this.syncScalePreviewState?.();
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
      this.syncScalePinState();
      this.scheduleSolve();
      this.notify();
    },

    editScaleTargetInput(raw) {
      const key = this.inputKey("field", "scale-target");
      this.setInputDraft(key, raw);
      this.setScaleTarget(raw);
    },

    commitScaleTargetInput(raw) {
      this.clearInputDraft(this.inputKey("field", "scale-target"));
      this.setScaleTarget(raw);
    },

    resetScaleTarget() {
      this.unsetRoot(this.activeScaleTargetRoot);
      this.syncScalePinState();
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
    scalePinOptions: {
      configurable: true,
      get() {
        return SCALE_PINS;
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
    // SVG geometry for the fermentation plane. A fixed 320 px square plot with
    // independent axis scales (the style window is ~8 x 2 °P, so the square is a
    // 4x vertical stretch); the static viewBox lets CSS scale the whole drawing.
    // Everything is precomputed here: templates bind, they never measure.
    stylePreview: {
      configurable: true,
      get() {
        const region = this.styleRegion;
        const point = this.styleExtract;
        if (region.length < 3 || !point || !this.styleSafestPoint) return null;

        const xs = region.map(([x]) => x);
        const ys = region.map(([, y]) => y);
        const padX = ((Math.max(...xs) - Math.min(...xs)) || 1) * 0.03;
        const padY = ((Math.max(...ys) - Math.min(...ys)) || 1) * 0.03;
        const xMin = Math.min(...xs) - padX;
        const xMax = Math.max(...xs) + padX;
        const yMin = Math.min(...ys) - padY;
        const yMax = Math.max(...ys) + padY;

        const left = PLOT_MARGIN.left;
        const top = PLOT_MARGIN.top;
        const right = left + PLOT_PX;
        const bottom = top + PLOT_PX;
        const sx = (oe) => left + ((oe - xMin) / (xMax - xMin)) * PLOT_PX;
        const sy = (ae) => bottom - ((ae - yMin) / (yMax - yMin)) * PLOT_PX;
        const px = (value) => formatWithDecimals(sx(value), 1);
        const py = (value) => formatWithDecimals(sy(value), 1);

        const corners = [
          [xMin, yMin],
          [xMin, yMax],
          [xMax, yMin],
          [xMax, yMax],
        ].map(([oe, ae]) => cutaiaAbv(oe, ae));
        const abvLow = Math.min(...corners);
        const abvHigh = Math.max(...corners);
        const targets = [];
        for (let abv = Math.ceil(abvLow); abv <= Math.floor(abvHigh); abv += 1) {
          targets.push(abv);
        }
        const step = targets.length > 6 ? 2 : 1;
        const contours = targets
          .filter((_, index) => index % step === 0)
          .map((abv) =>
            polylinePath(
              abvContour({ oeMin: xMin, oeMax: xMax, aeMin: yMin, aeMax: yMax, targetAbv: abv }),
              px,
              py
            )
          )
          .filter(Boolean)
          .join(" ");

        const pin = this.scalePin;
        const target = this.activeScaleTarget;
        let pinPath = "";
        let pinLabel = "";
        let pinLabelAt = { x: 0, y: 0, anchor: "start" };
        if (Number.isFinite(target)) {
          if (pin === "og") {
            const x = sx(sgToPlato(target));
            pinPath = `M${px(sgToPlato(target))} ${top} L${px(sgToPlato(target))} ${bottom}`;
            pinLabel = `OG ${formatGravity(target)}`;
            pinLabelAt = { x: formatWithDecimals(x + 4, 1), y: top + 12, anchor: "start" };
          } else if (pin === "fg") {
            const y = sy(sgToPlato(target));
            pinPath = `M${left} ${py(sgToPlato(target))} L${right} ${py(sgToPlato(target))}`;
            pinLabel = `FG ${formatGravity(target)}`;
            pinLabelAt = { x: right - 4, y: formatWithDecimals(y - 4, 1), anchor: "end" };
          } else {
            const contour = abvContour({
              oeMin: xMin,
              oeMax: xMax,
              aeMin: yMin,
              aeMax: yMax,
              targetAbv: target,
            });
            pinPath = polylinePath(contour, px, py);
            if (pinPath) {
              pinLabel = `ABV ${formatPercentValue(target, 1)}`;
              const topMost = contour.slice().sort((a, b) => b[1] - a[1])[0];
              pinLabelAt = {
                x: px(topMost[0]),
                y: formatWithDecimals(sy(topMost[1]) + 12, 1),
                anchor: "middle",
              };
            }
          }
        }

        const locus = polylinePath(
          compositionLocus({
            oeMin: xMin,
            oeMax: xMax,
            aeMin: yMin,
            aeMax: yMax,
            oe: point.oe,
            ae: point.ae,
          }),
          px,
          py
        );

        const abvNow = cutaiaAbv(point.oe, point.ae);
        return {
          width: PLOT_WIDTH,
          height: PLOT_HEIGHT,
          plot: { x: left, y: top, w: PLOT_PX, h: PLOT_PX },
          polygon: region.map(([oe, ae]) => `${px(oe)},${py(ae)}`).join(" "),
          contours,
          locus,
          pinPath,
          pinLabel,
          pinLabelX: pinLabelAt.x,
          pinLabelY: pinLabelAt.y,
          pinLabelAnchor: pinLabelAt.anchor,
          marker: { x: px(point.oe), y: py(point.ae) },
          safest: {
            x: px(this.styleSafestPoint.oe),
            y: py(this.styleSafestPoint.ae),
          },
          ticks: {
            x: tickValues(xMin, xMax).map((value) => ({
              x: px(value),
              y: bottom + 14,
              label: formatWithDecimals(value, 1),
            })),
            y: tickValues(yMin, yMax).map((value) => ({
              x: left - 6,
              y: formatWithDecimals(sy(value) + 3, 1),
              label: formatWithDecimals(value, 1),
            })),
          },
          tickMarks: [
            ...tickValues(xMin, xMax).map(
              (value) => `M${px(value)} ${bottom} L${px(value)} ${bottom + 4}`
            ),
            ...tickValues(yMin, yMax).map(
              (value) => `M${left} ${py(value)} L${left - 4} ${py(value)}`
            ),
          ].join(" "),
          summary:
            `Fermentation space: OG ${formatGravity(platoToSg(point.oe))}, ` +
            `FG ${formatGravity(platoToSg(point.ae))}, ` +
            `ABV ${formatPercentValue(abvNow, 1)}. ` +
            "Contours are iso-ABV every 1%; the line is this batch's composition.",
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
        return formatWithDecimals(this.ibuGu, 2, { dash: "—" });
      },
    },
    whirlpoolPctDisplay: {
      configurable: true,
      get() {
        const fraction = this.whirlpoolFraction;
        return typeof fraction === "number" ? toPercentValue(fraction, 0) : 0;
      },
    },
    boilIbuDisplay: {
      configurable: true,
      get() {
        const ibu = this.boilIbu;
        return typeof ibu === "number" ? formatWithDecimals(ibu, 1) : "—";
      },
    },
    whirlpoolIbuDisplay: {
      configurable: true,
      get() {
        const ibu = this.whirlpoolIbu;
        return typeof ibu === "number" ? formatWithDecimals(ibu, 1) : "—";
      },
    },
  });
}

function fmtTarget(pin, value) {
  if (pin === "abv") return `${formatWithDecimals(value, 1)}%`;
  return formatGravity(value);
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
  const attenuation = attenuationCapSummary(app.styleSolvedAa, app.styleSolvedCap);
  app.attenuationBlend = attenuation.blend;
  app.attenuationCap = attenuation.cap;
  // The delta is the artifact's value, so the card and the report cannot drift.
  // It is null when nothing exceeds the cap, which the partial renders as "—".
  app.attenuationSugarLift = read(N.aboveCap) ?? null;
  const postBoilVolume = read(N.postBoilVolume);
  app.styleSolvedVolume = Number.isFinite(postBoilVolume)
    ? postBoilVolume
    : ctx.engine.get(N.fermVolume);
  app.syncScalePinState();
  app.computeStyleTarget();
  app.refreshTargets();

  const target = app.activeScaleTarget;
  const info = app.styleTargetInfo;
  let mismatch = "";
  if (target != null && info) {
    const realized =
      app.scalePin === "abv" ? info.abv : app.scalePin === "og" ? info.og : info.fg;
    const tolerance = app.scalePin === "abv" ? 0.15 : 0.002;
    if (Number.isFinite(realized) && Math.abs(realized - target) > tolerance) {
      const status = app.boundaryStatuses?.[N.solverBatch] ?? "unknown";
      mismatch =
        `Target ${fmtTarget(app.scalePin, target)} vs realized ` +
        `${fmtTarget(app.scalePin, realized)} — solve ${status}.`;
    }
  }
  app.scaleTargetMismatch = mismatch;
}

export const KEYS = ["selectedStyleId", "styleRegion", "styleEnvelope", "styleSafestPoint", "styleExtract", "styleConformance", "styleSai", "styleAbvTouched", "styleAbvCentered", "styleSolvedAa", "styleSolvedCap", "styleSolvedVolume", "targetSrm", "targetIbu", "whirlpoolFraction", "boilIbu", "whirlpoolIbu", "styleGravity", "styleVitals", "computeStyleTarget", "writeStyleAbv", "setStyleTargetAbv", "centerOrClampStyleAbv", "afterCompute", "onBatchLoad", "resetStyleTarget", "syncScalePinState", "scalePin", "scalePinOptions", "scalePinLabel", "activeScaleTargetRoot", "activeScaleTargetLabel", "activeScaleTarget", "activeScaleTargetDisplay", "activeScaleTargetUnit", "activeScaleTargetStep", "scaleTargetMismatch", "attenuationBlend", "attenuationCap", "attenuationSugarLift", "editScaleTargetInput", "commitScaleTargetInput", "setScalePin", "setScaleTarget", "resetScaleTarget", "styleTargetNearest", "refreshTargets", "setTargetSrm", "setTargetIbu", "setWhirlpoolFraction", "styleConformanceReport", "selectedStyle", "styleAbvBounds", "styleAbvTarget", "styleTargetInfo", "styleTargetRisk", "stylePreview", "styleSrmBounds", "styleIbuBounds", "srmTargetField", "ibuTargetField", "srmTargetProvenance", "ibuTargetProvenance", "fermentationField", "fermentationProvenance", "styleEnvelopeFields", "ibuGu", "ibuGuDisplay", "whirlpoolPctDisplay", "boilIbuDisplay", "whirlpoolIbuDisplay"];
