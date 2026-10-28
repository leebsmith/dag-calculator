// SVG projection for the fermentation-target navigator. The geometry (region
// vertices, iso-ABV contours, the composition locus) comes from
// engine/fermentation.js; this module only maps it onto the plot's coordinate
// space and formats the labels. Pure and precomputed: templates bind the model,
// they never measure.

import {
  abvContour,
  compositionLocus,
  cutaiaAbv,
  platoToSg,
  sgToPlato,
} from "../../engine/fermentation.js";
import { formatGravity, formatPercentValue, formatWithDecimals } from "../../utils.js";

// A fixed square plot keeps the SVG scalable: the coordinate space is constant,
// so the template can hardcode the viewBox.
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

/**
 * Project a fermentation region and the batch's extract point onto the plot.
 * Independent axis scales (the style window is ~8 x 2 °P, so the square is a 4x
 * vertical stretch); the static viewBox lets CSS scale the whole drawing.
 *
 * @param {object} plot
 * @param {Array<[number, number]>} plot.region OE/AE polygon vertices
 * @param {{oe: number, ae: number}|null} plot.point the batch's extract point
 * @param {{oe: number, ae: number, radius: number}|null} plot.safestPoint
 * @param {"abv"|"og"|"fg"} plot.pin the active scale pin
 * @param {number|null} plot.target the pinned target, in the pin's own unit
 * @returns {object|null} the plot model, or null when there is nothing to draw
 */
export function stylePlotModel({ region, point, safestPoint, pin, target }) {
  if (!Array.isArray(region) || region.length < 3 || !point || !safestPoint) return null;

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
  const contours = targets
    .map((abv) =>
      polylinePath(
        abvContour({ oeMin: xMin, oeMax: xMax, aeMin: yMin, aeMax: yMax, targetAbv: abv }),
        px,
        py
      )
    )
    .filter(Boolean)
    .join(" ");

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
      x: px(safestPoint.oe),
      y: py(safestPoint.ae),
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
}
