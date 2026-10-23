// Style card: styleguide picker, fermentation-target navigator (OE/AE region),
// and the SRM/IBU/whirlpool target sliders. Bespoke (not a catalog draft
// editor); the region math lives in engine/fermentation.js.

import {
  styleCentroid,
  styleFermentation,
  styleTagSet,
  feasibleVertices,
  polygonCentroid,
  pointInRegion,
  edgeMargin,
  chebyshevCenter,
  targetFromExtract,
  extractFromTarget,
  limitHeadroom,
  oeSliceAt,
  aeSliceAt,
} from "../../engine/fermentation.js";
import { derivationsFor } from "../../views/seedDerivations.js";
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
  resultCounter,
  toggleFilter,
} from "../../utils.js";
import { reportError } from "../../observability.js";

const MAX_VISIBLE_STYLES = 25;

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

function styleStrength(style) {
  const tags = styleTagSet(style);
  if (tags.has("session-strength")) return "session";
  if (tags.has("standard-strength")) return "standard";
  if (tags.has("high-strength")) return "high";
  if (tags.has("very-high-strength")) return "very high";
  return "";
}

function styleColor(style) {
  const tags = styleTagSet(style);
  if (tags.has("pale-color")) return "pale";
  if (tags.has("amber-color")) return "amber";
  if (tags.has("dark-color")) return "dark";
  return "";
}

export function registerStyleCard(app, ctx) {
  const { engine, cache } = ctx;

  Object.assign(app, {
    selectedStyleId: "",
    styleSource: "styleguide",
    styleRegion: [],
    styleEnvelope: null,
    styleSafestPoint: null,
    styleExtract: null,
    styleConformance: null,
    styleSai: null,

    styleSearchQuery: "",
    styleCategoryFilter: "",
    styleStrengthFilter: "",
    styleColorFilter: "",
    styleFermentationFilter: "",

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

    toggleStyleStrength(value) {
      this.styleStrengthFilter = toggleFilter(this.styleStrengthFilter, value);
    },

    toggleStyleColor(value) {
      this.styleColorFilter = toggleFilter(this.styleColorFilter, value);
    },

    toggleStyleFermentation(value) {
      this.styleFermentationFilter = toggleFilter(this.styleFermentationFilter, value);
    },

    selectStyle(id) {
      this.setRoot(N.styleId, id);
      const style = cache.references.style[id];
      this.pickSelection(N.styleId, id);
      this.resetSeededRoots(N.selectionNode);
      if (style) {
        for (const { rootId, derive } of derivationsFor(N.selectionNode)) {
          const value = derive(style);
          if (typeof value === "number" || (typeof value === "string" && value !== "")) {
            this.setRoot(rootId, value);
          }
        }
      }
      this.refreshTargets();
      this.scheduleSolve();
      this.notify();
    },

    clearStyleSelection() {
      this.setRoot(N.styleId, "");
      this.pickSelection(N.styleId, "");
      this.resetSeededRoots(N.selectionNode);
      this.scheduleSolve();
      this.notify();
    },

    styleField(id) {
      return fieldOr(this.fieldsById, id);
    },

    // The batch AA / target-ABV roots are the source of truth; the picker's
    // slider positions are their inverse. The region comes from the envelope
    // (batch.style_* roots) so it tracks envelope edits (WYSIWYG).
    computeStyleTarget() {
      const envelope = {
        ogMin: engine.get(N.envelope.ogMin),
        ogMax: engine.get(N.envelope.ogMax),
        fgMin: engine.get(N.envelope.fgMin),
        fgMax: engine.get(N.envelope.fgMax),
        abvMin: engine.get(N.envelope.abvMin),
        abvMax: engine.get(N.envelope.abvMax),
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
      const aa = engine.get(N.apparentAttenuation);
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
        const centroid = polygonCentroid(this.styleRegion);
        if (centroid) this.styleExtract = { oe: centroid[0], ae: centroid[1] };
      }
    },

    applyStyleExtract(oe, ae) {
      const target = targetFromExtract(oe, ae);
      this.setRoot(N.apparentAttenuation, target.aa);
      this.setRoot(N.targetAbv, target.abv);
      this.scheduleSolve();
      this.notify();
    },

    setStyleTargetOe(value) {
      if (!this.styleExtract) return;
      const bounds = oeSliceAt(this.styleRegion, this.styleExtract.ae);
      if (!bounds) return;
      const oe = Math.max(bounds[0], Math.min(bounds[1], Number(value)));
      this.applyStyleExtract(oe, this.styleExtract.ae);
    },

    setStyleTargetAe(value) {
      if (!this.styleExtract) return;
      const bounds = aeSliceAt(this.styleRegion, this.styleExtract.oe);
      if (!bounds) return;
      const ae = Math.max(bounds[0], Math.min(bounds[1], Number(value)));
      this.applyStyleExtract(this.styleExtract.oe, ae);
    },

    resetStyleTarget() {
      const centroid = this.styleRegion.length >= 3 ? polygonCentroid(this.styleRegion) : null;
      if (centroid) this.applyStyleExtract(centroid[0], centroid[1]);
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
        ogMin: engine.get(N.envelope.ogMin),
        ogMax: engine.get(N.envelope.ogMax),
        fgMin: engine.get(N.envelope.fgMin),
        fgMax: engine.get(N.envelope.fgMax),
        abvMin: engine.get(N.envelope.abvMin),
        abvMax: engine.get(N.envelope.abvMax),
        ibuMin: engine.get(N.envelope.ibuMin),
        ibuMax: engine.get(N.envelope.ibuMax),
        srmMin: engine.get(N.envelope.srmMin),
        srmMax: engine.get(N.envelope.srmMax),
      };
      const report = styleConformance({ og, fg, abv, ibu, srm }, envelope);
      report.styleId = engine.get(N.styleId) || null;
      return report;
    },
  });

  Object.defineProperties(app, {
    styleCatalog: {
      configurable: true,
      get() {
        return Object.values(cache.references.style ?? {});
      },
    },
    styleCategories: {
      configurable: true,
      get() {
        return [...new Set(this.styleCatalog.map((s) => s.category_name).filter(Boolean))].sort();
      },
    },
    styleStrengths: {
      configurable: true,
      get() {
        return ["session", "standard", "high", "very high"];
      },
    },
    styleColors: {
      configurable: true,
      get() {
        return ["pale", "amber", "dark"];
      },
    },
    styleFermentations: {
      configurable: true,
      get() {
        return ["ale", "lager", "wild", "mixed"];
      },
    },
    filteredStyles: {
      configurable: true,
      get() {
        const q = this.styleSearchQuery.trim().toLowerCase();
        const cat = this.styleCategoryFilter;
        const strength = this.styleStrengthFilter;
        const color = this.styleColorFilter;
        const ferm = this.styleFermentationFilter;
        return this.styleCatalog.filter((s) => {
          const haystack = `${s.name ?? ""} ${s.id ?? ""} ${s.category_name ?? ""} ${s.tags ?? ""}`.toLowerCase();
          if (q && !haystack.includes(q)) return false;
          if (cat && s.category_name !== cat) return false;
          if (strength && styleStrength(s) !== strength) return false;
          if (color && styleColor(s) !== color) return false;
          if (ferm && styleFermentation(s) !== ferm) return false;
          return true;
        });
      },
    },
    visibleStyles: {
      configurable: true,
      get() {
        return this.filteredStyles.slice(0, MAX_VISIBLE_STYLES);
      },
    },
    styleResultCount: {
      configurable: true,
      get() {
        return this.filteredStyles.length;
      },
    },
    isStyleListTruncated: {
      configurable: true,
      get() {
        return this.styleResultCount > MAX_VISIBLE_STYLES;
      },
    },
    selectedStyle: {
      configurable: true,
      get() {
        return this.selectedStyleId ? cache.references.style[this.selectedStyleId] ?? null : null;
      },
    },
    selectedStyleTarget: {
      configurable: true,
      get() {
        const s = this.selectedStyle;
        if (!s) return null;
        return styleCentroid(s);
      },
    },
    styleOeBounds: {
      configurable: true,
      get() {
        if (!this.styleExtract) return null;
        return oeSliceAt(this.styleRegion, this.styleExtract.ae);
      },
    },
    styleAeBounds: {
      configurable: true,
      get() {
        if (!this.styleExtract) return null;
        return aeSliceAt(this.styleRegion, this.styleExtract.oe);
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
        return {
          width,
          height,
          polygon: region.map(([x, y]) => `${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join(" "),
          marker: { x: sx(this.styleExtract.oe).toFixed(1), y: sy(this.styleExtract.ae).toFixed(1) },
          safest: {
            x: sx(this.styleSafestPoint.oe).toFixed(1),
            y: sy(this.styleSafestPoint.ae).toFixed(1),
          },
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
    styleSourceModel: {
      configurable: true,
      get() {
        return fieldOr(this.fieldsById, N.styleSource);
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
    styleResultLabel: {
      configurable: true,
      get() {
        return resultCounter({
          shown: this.visibleStyles.length,
          total: this.styleResultCount,
          noun: "matching style",
          truncated: this.isStyleListTruncated,
          truncatedHint: "refine search",
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
  app.selectedStyleId = ctx.engine.get(N.styleId) || "";
  app.styleSource = ctx.engine.get(N.styleSource) || "styleguide";
  app.computeStyleTarget();
  app.refreshTargets();
}

export const KEYS = ["selectedStyleId", "styleSource", "styleRegion", "styleEnvelope", "styleSafestPoint", "styleExtract", "styleConformance", "styleSai", "styleSearchQuery", "styleCategoryFilter", "styleStrengthFilter", "styleColorFilter", "styleFermentationFilter", "targetSrm", "targetIbu", "whirlpoolFraction", "boilIbu", "whirlpoolIbu", "styleGravity", "styleVitals", "toggleStyleStrength", "toggleStyleColor", "toggleStyleFermentation", "selectStyle", "clearStyleSelection", "styleField", "computeStyleTarget", "applyStyleExtract", "setStyleTargetOe", "setStyleTargetAe", "resetStyleTarget", "styleTargetNearest", "refreshTargets", "setTargetSrm", "setTargetIbu", "setWhirlpoolFraction", "styleConformanceReport", "styleCatalog", "styleCategories", "styleStrengths", "styleColors", "styleFermentations", "filteredStyles", "visibleStyles", "styleResultCount", "isStyleListTruncated", "selectedStyle", "selectedStyleTarget", "styleOeBounds", "styleAeBounds", "styleTargetInfo", "styleTargetRisk", "stylePreview", "styleSrmBounds", "styleIbuBounds", "srmTargetField", "ibuTargetField", "srmTargetProvenance", "ibuTargetProvenance", "fermentationField", "fermentationProvenance", "styleSourceModel", "styleEnvelopeFields", "styleResultLabel", "conformanceSummary", "ibuGu", "ibuGuDisplay", "whirlpoolPctDisplay", "boilIbuDisplay", "whirlpoolIbuDisplay"];
