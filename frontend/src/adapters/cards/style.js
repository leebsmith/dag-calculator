// Style card: styleguide picker, fermentation-target navigator (OE/AE region),
// and the SRM/IBU/whirlpool target sliders. Bespoke (not a catalog draft
// editor); the region math lives in engine/fermentation.js.

import {
  styleCentroid,
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

const MAX_VISIBLE_STYLES = 25;

const normalizeTag = (t) => (t ?? "").trim().toLowerCase().replace(/\s+/g, "-");

function styleTagSet(style) {
  return new Set((style?.tags ?? "").split(",").map(normalizeTag));
}

function styleFermentation(style) {
  const tags = styleTagSet(style);
  const name = (style?.name ?? "").toLowerCase();
  if (tags.has("bottom-fermented")) return "lager";
  if (tags.has("wild-fermented") || tags.has("wild-fermentation")) return "wild";
  if (name.includes("mixed-fermentation")) return "mixed";
  return "ale";
}

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

    styleRangeText(s) {
      if (!s || s.og_min === undefined) return "";
      return `${s.og_min}–${s.og_max} / ${s.fg_min}–${s.fg_max}`;
    },

    styleGravity(s, field) {
      const v = s?.[field];
      return typeof v === "number" ? v.toFixed(3) : "";
    },

    selectStyle(id) {
      this.setRoot("batch.style_id", id);
      const style = cache.references.style[id];
      if (style) {
        for (const field of ["og_min", "og_max", "fg_min", "fg_max", "ibu_min", "ibu_max", "srm_min", "srm_max", "abv_min", "abv_max"]) {
          const value = style[field];
          if (typeof value === "number") this.setRoot(`batch.style_${field}`, value);
        }
        this.setRoot("batch.fermentation", styleFermentation(style));
        const centroid = styleCentroid(style);
        if (centroid) {
          this.setRoot("batch.apparent_attenuation", centroid.aa);
          this.setRoot("batch.target_abv", centroid.abv);
        }
        // Seed the color/bitterness targets at the envelope midpoint so the
        // sliders start inside the style's range.
        if (typeof style.srm_min === "number" && typeof style.srm_max === "number") {
          this.setRoot("batch.target_srm", (style.srm_min + style.srm_max) / 2);
        }
        if (typeof style.ibu_min === "number" && typeof style.ibu_max === "number") {
          this.setRoot("batch.target_ibu", (style.ibu_min + style.ibu_max) / 2);
        }
      }
      this.refreshTargets();
      this.scheduleSolve();
      this.notify();
    },

    clearStyleSelection() {
      this.setRoot("batch.style_id", "");
      this.setRoot("batch.fermentation", "ale");
      this.scheduleSolve();
      this.notify();
    },

    styleField(id) {
      return (this.fieldsBySlice.style ?? []).find((f) => f.id === id) ?? {};
    },

    // The batch AA / target-ABV roots are the source of truth; the picker's
    // slider positions are their inverse. The region comes from the envelope
    // (batch.style_* roots) so it tracks envelope edits (WYSIWYG).
    computeStyleTarget() {
      const envelope = {
        ogMin: engine.get("batch.style_og_min"),
        ogMax: engine.get("batch.style_og_max"),
        fgMin: engine.get("batch.style_fg_min"),
        fgMax: engine.get("batch.style_fg_max"),
        abvMin: engine.get("batch.style_abv_min"),
        abvMax: engine.get("batch.style_abv_max"),
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
      const aa = engine.get("batch.apparent_attenuation");
      const abv = engine.get("batch.target_abv");
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
      this.setRoot("batch.apparent_attenuation", target.aa);
      this.setRoot("batch.target_abv", target.abv);
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

    refreshTargets() {
      this.targetSrm = engine.get("batch.target_srm");
      this.targetIbu = engine.get("batch.target_ibu");
      this.whirlpoolFraction = engine.get("batch.whirlpool_ibu_fraction");
      this.boilIbu = engine.get("batch.boil_target_ibu");
      this.whirlpoolIbu = engine.get("batch.whirlpool_target_ibu");
    },

    setTargetSrm(value) {
      const n = Number(value);
      if (!Number.isFinite(n)) return;
      this.setRoot("batch.target_srm", Math.max(0, n));
      this.refreshTargets();
      this.scheduleSolve();
      this.notify();
    },

    setTargetIbu(value) {
      const n = Number(value);
      if (!Number.isFinite(n)) return;
      this.setRoot("batch.target_ibu", Math.max(0, n));
      this.refreshTargets();
      this.scheduleSolve();
      this.notify();
    },

    setWhirlpoolFraction(value) {
      const n = Number(value);
      if (!Number.isFinite(n)) return;
      this.setRoot("batch.whirlpool_ibu_fraction", Math.max(0, Math.min(1, n)));
      this.refreshTargets();
      this.scheduleSolve();
      this.notify();
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
        const min = Number(this.styleField("batch.style_srm_min").value);
        const max = Number(this.styleField("batch.style_srm_max").value);
        return Number.isFinite(min) && Number.isFinite(max) && min < max ? [min, max] : null;
      },
    },
    styleIbuBounds: {
      configurable: true,
      get() {
        const min = Number(this.styleField("batch.style_ibu_min").value);
        const max = Number(this.styleField("batch.style_ibu_max").value);
        return Number.isFinite(min) && Number.isFinite(max) && min < max ? [min, max] : null;
      },
    },
    // Planned bitterness balance: planned IBU over the planned OG's gravity
    // units (from the fermentation-target navigator), so it needs no solve.
    ibuGu: {
      configurable: true,
      get() {
        const og = this.styleTargetInfo?.og;
        const ibu = this.targetIbu;
        return typeof og === "number" && og > 1 && typeof ibu === "number"
          ? ibu / ((og - 1) * 1000)
          : null;
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
  app.selectedStyleId = ctx.engine.get("batch.style_id") || "";
  app.styleSource = ctx.engine.get("batch.style_source") || "styleguide";
  app.computeStyleTarget();
  app.refreshTargets();
}
