// SVG projection for the fermentation-target navigator. The geometry (region
// vertices, iso-ABV contours, the composition locus) comes from
// engine/fermentation.js in its native °P space; this module maps it onto the
// plot's coordinate space and formats the labels.
//
// The static geometry (region, contours, band, frame) lives in stylePlotBase.js
// and is cached by the plot window. This module adds the pieces that move with
// the batch: the marker, the composition locus, and the pinned target.

import { abvContour, compositionLocus, cutaiaAbv } from "../../engine/fermentation.js";
import { formatPercentValue, formatWithDecimals } from "../../utils.js";
import { gravityDisplay } from "./gravityDisplay.js";
import {
  clamp,
  plotBase,
  polylinePath,
  PLOT_CENTER,
  PLOT_HEIGHT,
  PLOT_WIDTH,
} from "./stylePlotBase.js";

const LABEL_HALF = 30;

// The pinned target's geometry, in the display unit. Labels are clamped so a
// target outside the frame still names itself inside the plot instead of running
// over the border.
function gravityPin({ pin, target, gravity, frame, project }) {
  const { left, top, right, bottom } = frame;
  const { sx, sy, px, py } = project;
  // Gravity targets are stored in SG; the plane wants the display unit.
  const shown = gravity.fromSg(target);
  const pinLabel = `${pin === "og" ? "OG" : "FG"} ${formatWithDecimals(
    shown,
    gravity.decimals
  )} ${gravity.symbol}`;
  if (pin === "og") {
    const x = sx(shown);
    return {
      pinPath: `M${px(shown)} ${top} L${px(shown)} ${bottom}`,
      pinLabel,
      pinLabelAt: {
        x: formatWithDecimals(Math.min(Math.max(x + 4, left + 2), right - LABEL_HALF * 2), 1),
        y: top + 12,
        anchor: "start",
      },
    };
  }
  const y = sy(shown);
  return {
    pinPath: `M${left} ${py(shown)} L${right} ${py(shown)}`,
    pinLabel,
    pinLabelAt: {
      x: right - 4,
      y: formatWithDecimals(Math.min(Math.max(y - 4, top + 12), bottom - 8), 1),
      anchor: "end",
    },
  };
}

// The ABV label takes the contour sample farthest from the batch marker: the
// topmost sample is where the marker lands at the target ABV, which used to draw
// the dot inside the text.
function abvPin({ target, gravity, bounds, frame, marker, project }) {
  const { left, right, top, bottom } = frame;
  const { sx, sy, pdx, pdy } = project;
  const contour = abvContour({ ...bounds, targetAbv: target });
  const pinPath = polylinePath(contour, pdx, pdy);
  if (!pinPath) return { pinPath, pinLabel: "", pinLabelAt: { x: 0, y: 0, anchor: "start" } };
  let best = { x: left + LABEL_HALF, y: top + 12, distance: -1 };
  for (const [oe, ae] of contour) {
    const x = sx(gravity.fromPlato(oe));
    const y = sy(gravity.fromPlato(ae));
    const distance = (x - marker.x) ** 2 + (y - marker.y) ** 2;
    if (distance > best.distance) best = { x, y, distance };
  }
  return {
    pinPath,
    pinLabel: `ABV ${formatPercentValue(target, 1)}`,
    pinLabelAt: {
      x: formatWithDecimals(clamp(best.x, left + LABEL_HALF, right - LABEL_HALF), 1),
      y: formatWithDecimals(clamp(best.y + 12, top + 12, bottom - 6), 1),
      anchor: "middle",
    },
  };
}

function pinModel({ pin, target, gravity, bounds, frame, marker, project }) {
  if (!Number.isFinite(target)) {
    return { pinPath: "", pinLabel: "", pinLabelAt: { x: 0, y: 0, anchor: "start" } };
  }
  return pin === "abv"
    ? abvPin({ target, gravity, bounds, frame, marker, project })
    : gravityPin({ pin, target, gravity, frame, project });
}

function plotSummary({ point, gravity }) {
  const gravityText = (extract) =>
    `${formatWithDecimals(gravity.fromPlato(extract), gravity.decimals)} ${gravity.symbol}`;
  return (
    `Fermentation space: OG ${gravityText(point.oe)}, ` +
    `FG ${gravityText(point.ae)}, ` +
    `ABV ${formatPercentValue(cutaiaAbv(point.oe, point.ae), 1)}. ` +
    "Contours are iso-ABV every 1%; the line is this batch's composition."
  );
}

/**
 * Project a fermentation region and the batch's extract point onto the plot.
 * Independent axis scales (the style window is ~8 x 2 °P, so the square is a 4x
 * vertical stretch); the static viewBox lets CSS scale the whole drawing. The
 * axes are linear in `gravity`'s display unit.
 *
 * @param {object} plot
 * @param {Array<[number, number]>} plot.region OE/AE polygon vertices (°P)
 * @param {{oe: number, ae: number}|null} plot.point the batch's extract point (°P)
 * @param {{oe: number, ae: number, radius: number}|null} plot.safestPoint
 * @param {"abv"|"og"|"fg"} plot.pin the active scale pin
 * @param {number|null} plot.target the pinned target, in the pin's own unit
 * @param {object} [plot.gravity] the display context from `gravityDisplay`
 * @param {{min: number, max: number}|null} [plot.band] the style's ABV limits
 * @returns {object|null} the plot model, or null when there is nothing to draw
 */
export function stylePlotModel({
  region,
  point,
  safestPoint,
  pin,
  target,
  gravity = gravityDisplay("Plato"),
  band = null,
}) {
  if (!Array.isArray(region) || region.length < 3 || !point || !safestPoint) return null;

  const base = plotBase({ region, point, safestPoint, gravity, band });
  const pointDisplay = { oe: gravity.fromPlato(point.oe), ae: gravity.fromPlato(point.ae) };
  const marker = { x: base.px(pointDisplay.oe), y: base.py(pointDisplay.ae) };
  const pinModelOut = pinModel({
    pin,
    target,
    gravity,
    bounds: base.bounds,
    frame: base.frame,
    marker,
    project: base.project,
  });

  return {
    width: base.width,
    height: base.height,
    viewBox: base.viewBox,
    axes: base.axes,
    plot: base.plot,
    center: base.center,
    polygon: base.polygon,
    contours: base.contours,
    contourLabels: base.contourLabels,
    bandPath: base.bandPath,
    locus: polylinePath(
      compositionLocus({ ...base.bounds, oe: point.oe, ae: point.ae }),
      base.project.pdx,
      base.project.pdy
    ),
    pinPath: pinModelOut.pinPath,
    pinLabel: pinModelOut.pinLabel,
    pinLabelX: pinModelOut.pinLabelAt.x,
    pinLabelY: pinModelOut.pinLabelAt.y,
    pinLabelAnchor: pinModelOut.pinLabelAt.anchor,
    marker,
    safest: base.safest,
    ticks: base.ticks,
    tickMarks: base.tickMarks,
    summary: plotSummary({ point, gravity }),
  };
}

/**
 * The unsolved plot: a placeholder that says so. There is no realized OE/AE
 * point to draw, and the style region alone is not this batch, so the drawing
 * carries no geometry — only the centred reason.
 *
 * @param {string} reason the message to centre the plot
 * @returns {object} the placeholder model, shaped like a plot but without geometry
 */
export function stylePlaceholderModel(reason = "Blocked/Unsolved") {
  return {
    width: PLOT_WIDTH,
    height: PLOT_HEIGHT,
    viewBox: `0 0 ${PLOT_WIDTH} ${PLOT_HEIGHT}`,
    center: PLOT_CENTER,
    placeholder: reason,
    summary: `Fermentation space: ${reason.toLowerCase()}.`,
  };
}
