// SVG projection for the fermentation-target navigator. The geometry (region
// vertices, iso-ABV contours, the composition locus) comes from
// engine/fermentation.js in its native °P space; this module maps it onto the
// plot's coordinate space and formats the labels.
//
// The plotted plane follows the gravity unit control: the axes are linear in the
// display unit, so equal pixel spacing means equal displayed values. The
// geometry is always sampled in °P and converted once, through the same
// `gravityDisplay` context the card's readouts use — SG is a projection, never a
// second solver. Pure and precomputed: templates bind the model, they never
// measure.

import { abvContour, compositionLocus, cutaiaAbv } from "../../engine/fermentation.js";
import { formatPercent, formatPercentValue, formatWithDecimals } from "../../utils.js";
import { gravityDisplay } from "./gravityDisplay.js";

// A fixed square plot keeps the SVG scalable: the coordinate space is constant,
// so the template can hardcode the viewBox.
const PLOT_PX = 320;
const PLOT_MARGIN = { left: 44, right: 12, top: 12, bottom: 34 };
const PLOT_WIDTH = PLOT_MARGIN.left + PLOT_PX + PLOT_MARGIN.right;
const PLOT_HEIGHT = PLOT_MARGIN.top + PLOT_PX + PLOT_MARGIN.bottom;
// The plot's centre in SVG coordinates: where the unsolved message sits.
const PLOT_CENTER = {
  x: formatWithDecimals(PLOT_MARGIN.left + PLOT_PX / 2, 1),
  y: formatWithDecimals(PLOT_MARGIN.top + PLOT_PX / 2, 1),
};
const TICK_COUNT = 5;
const LABEL_HALF = 30;

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

// Axis captions: the y caption rotates into the left margin so it never collides
// with the tick column; the x caption sits centered under the plot.
function plotAxes(left, top, symbol) {
  const midX = left + PLOT_PX / 2;
  const midY = top + PLOT_PX / 2;
  return {
    y: {
      x: left - 34,
      y: midY,
      anchor: "middle",
      transform: `rotate(-90 ${left - 34} ${midY})`,
      label: `AE (${symbol})`,
    },
    x: {
      x: midX,
      y: PLOT_HEIGHT - 6,
      anchor: "middle",
      label: `OE (${symbol})`,
    },
  };
}

// The window is the union of the style region and the batch's extract point: a
// batch outside the envelope still shows its dot instead of being clipped by the
// frame. The safest point is inside the region by construction, but it joins the
// union so the model stays correct if that ever changes. The 5% inset keeps the
// marker clear of the frame (16 px at PLOT_PX), not just inside it.
const WINDOW_INSET = 0.05;

function plotWindow(region, point, safestPoint) {
  const xs = region.map(([x]) => x).concat([point.oe, safestPoint.oe]);
  const ys = region.map(([, y]) => y).concat([point.ae, safestPoint.ae]);
  const padX = ((Math.max(...xs) - Math.min(...xs)) || 1) * WINDOW_INSET;
  const padY = ((Math.max(...ys) - Math.min(...ys)) || 1) * WINDOW_INSET;
  return {
    xMin: Math.min(...xs) - padX,
    xMax: Math.max(...xs) + padX,
    yMin: Math.min(...ys) - padY,
    yMax: Math.max(...ys) + padY,
  };
}

// Project the geometry into the display plane and keep the native °P window the
// contours and the locus are sampled in. The display map is monotone, so the
// window corners map back one-to-one.
function projectPlot({ region, point, safestPoint, gravity }) {
  const toDisplay = (extract) => ({
    oe: gravity.fromPlato(extract.oe),
    ae: gravity.fromPlato(extract.ae),
  });
  const regionDisplay = region.map(([oe, ae]) => [gravity.fromPlato(oe), gravity.fromPlato(ae)]);
  const pointDisplay = toDisplay(point);
  const safestDisplay = toDisplay(safestPoint);
  const { xMin, xMax, yMin, yMax } = plotWindow(regionDisplay, pointDisplay, safestDisplay);
  const bounds = {
    oeMin: gravity.toPlato(xMin),
    oeMax: gravity.toPlato(xMax),
    aeMin: gravity.toPlato(yMin),
    aeMax: gravity.toPlato(yMax),
  };
  return { regionDisplay, pointDisplay, safestDisplay, xMin, xMax, yMin, yMax, bounds };
}

function clamp(value, low, high) {
  return Math.min(Math.max(value, low), high);
}

// The integer ABV range the window spans.
function abvRange(bounds) {
  const corners = [
    [bounds.oeMin, bounds.aeMin],
    [bounds.oeMin, bounds.aeMax],
    [bounds.oeMax, bounds.aeMin],
    [bounds.oeMax, bounds.aeMax],
  ].map(([oe, ae]) => cutaiaAbv(oe, ae));
  return [Math.ceil(Math.min(...corners)), Math.floor(Math.max(...corners))];
}

// Every integer ABV in the window as one path.
function abvContourPaths({ bounds, project }) {
  const [low, high] = abvRange(bounds);
  const paths = [];
  for (let abv = low; abv <= high; abv += 1) {
    paths.push(polylinePath(abvContour({ ...bounds, targetAbv: abv }), project.pdx, project.pdy));
  }
  return paths.filter(Boolean).join(" ");
}

// The style's own ABV limits, drawn as emphasised contours so the region's two
// diagonal cuts read as limits rather than unexplained slopes.
function bandPaths({ bounds, band, project }) {
  if (!band) return "";
  return [band.min, band.max]
    .filter((value) => Number.isFinite(value))
    .map((value) => polylinePath(abvContour({ ...bounds, targetAbv: value }), project.pdx, project.pdy))
    .filter(Boolean)
    .join(" ");
}

// A label sits a third of the way along its contour, clamped inside the frame so
// it never runs over the border.
function contourLabel(points, { gravity, frame, project }) {
  const at = points[Math.floor((points.length - 1) * 0.35)] ?? points[0];
  return {
    x: formatWithDecimals(
      clamp(project.sx(gravity.fromPlato(at[0])), frame.left + 12, frame.right - 12),
      1
    ),
    y: formatWithDecimals(
      clamp(project.sy(gravity.fromPlato(at[1])) - 4, frame.top + 10, frame.bottom - 6),
      1
    ),
  };
}

// The label is positioned as a percentage of the viewBox so the HTML overlay that
// draws it (an SVG template cannot loop) scales with the drawing.
function labelEntry(text, points, context) {
  const { x, y } = contourLabel(points, context);
  return {
    text,
    x,
    y,
    key: `${text}@${x},${y}`,
    style: `left:${formatPercent(Number(x) / PLOT_WIDTH, 2)};top:${formatPercent(
      Number(y) / PLOT_HEIGHT,
      2
    )}`,
  };
}

// One label per integer contour plus a label for each non-integer band edge (an
// integer edge already carries the contour's own label).
function contourLabels({ bounds, band, gravity, frame, project }) {
  const context = { gravity, frame, project };
  const labels = [];
  const [low, high] = abvRange(bounds);
  for (let abv = low; abv <= high; abv += 1) {
    const points = abvContour({ ...bounds, targetAbv: abv });
    if (points.length) labels.push(labelEntry(`${abv}%`, points, context));
  }
  for (const edge of [band?.min, band?.max]) {
    if (!Number.isFinite(edge) || Number.isInteger(edge)) continue;
    const points = abvContour({ ...bounds, targetAbv: edge });
    if (points.length) labels.push(labelEntry(`${formatWithDecimals(edge, 1)}%`, points, context));
  }
  return labels;
}

// Pixel mappings for the display-space window. `pdx`/`pdy` sample geometry in
// °P and project it, so every path uses the same conversion as the marker.
function plotProjection({ xMin, xMax, yMin, yMax, gravity, left, top }) {
  const sx = (value) => left + ((value - xMin) / (xMax - xMin)) * PLOT_PX;
  const sy = (value) => top + PLOT_PX - ((value - yMin) / (yMax - yMin)) * PLOT_PX;
  const px = (value) => formatWithDecimals(sx(value), 1);
  const py = (value) => formatWithDecimals(sy(value), 1);
  return {
    sx,
    sy,
    px,
    py,
    frame: { left, top, right: left + PLOT_PX, bottom: top + PLOT_PX },
    project: {
      sx,
      sy,
      px,
      py,
      pdx: (oe) => px(gravity.fromPlato(oe)),
      pdy: (ae) => py(gravity.fromPlato(ae)),
    },
  };
}

function plotTicks({ xMin, xMax, yMin, yMax, gravity, left, bottom, px, py, sy }) {
  const label = (value) => formatWithDecimals(value, gravity.decimals);
  const xs = tickValues(xMin, xMax);
  const ys = tickValues(yMin, yMax);
  return {
    ticks: {
      x: xs.map((value) => ({ x: px(value), y: bottom + 14, label: label(value) })),
      y: ys.map((value) => ({
        x: left - 6,
        y: formatWithDecimals(sy(value) + 3, 1),
        label: label(value),
      })),
    },
    tickMarks: [
      ...xs.map((value) => `M${px(value)} ${bottom} L${px(value)} ${bottom + 4}`),
      ...ys.map((value) => `M${left} ${py(value)} L${left - 4} ${py(value)}`),
    ].join(" "),
  };
}

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

  const { regionDisplay, pointDisplay, safestDisplay, xMin, xMax, yMin, yMax, bounds } =
    projectPlot({ region, point, safestPoint, gravity });
  const left = PLOT_MARGIN.left;
  const top = PLOT_MARGIN.top;
  const { sx, sy, px, py, frame, project } = plotProjection({
    xMin,
    xMax,
    yMin,
    yMax,
    gravity,
    left,
    top,
  });
  const marker = { x: sx(pointDisplay.oe), y: sy(pointDisplay.ae) };
  const pinModelOut = pinModel({ pin, target, gravity, bounds, frame, marker, project });
  const { ticks, tickMarks } = plotTicks({
    xMin,
    xMax,
    yMin,
    yMax,
    gravity,
    left,
    bottom: frame.bottom,
    px,
    py,
    sy,
  });

  return {
    width: PLOT_WIDTH,
    height: PLOT_HEIGHT,
    viewBox: `0 0 ${PLOT_WIDTH} ${PLOT_HEIGHT}`,
    axes: plotAxes(left, top, gravity.symbol),
    plot: { x: left, y: top, w: PLOT_PX, h: PLOT_PX },
    center: PLOT_CENTER,
    polygon: regionDisplay.map(([oe, ae]) => `${px(oe)},${py(ae)}`).join(" "),
    contours: abvContourPaths({ bounds, project }),
    contourLabels: contourLabels({ bounds, band, gravity, frame, project }),
    bandPath: bandPaths({ bounds, band, project }),
    locus: polylinePath(
      compositionLocus({ ...bounds, oe: point.oe, ae: point.ae }),
      project.pdx,
      project.pdy
    ),
    pinPath: pinModelOut.pinPath,
    pinLabel: pinModelOut.pinLabel,
    pinLabelX: pinModelOut.pinLabelAt.x,
    pinLabelY: pinModelOut.pinLabelAt.y,
    pinLabelAnchor: pinModelOut.pinLabelAt.anchor,
    marker: { x: px(pointDisplay.oe), y: py(pointDisplay.ae) },
    safest: { x: px(safestDisplay.oe), y: py(safestDisplay.ae) },
    ticks,
    tickMarks,
    summary: plotSummary({ point, gravity }),
  };
}

/**
 * The unsolved plot: a placeholder that says so. There is no realized OE/AE
 * point to draw, and the style region alone is not this batch, so the drawing
 * carries no geometry — only the centred reason.
 *
 * @param {string} reason the message to centre in the plot
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
