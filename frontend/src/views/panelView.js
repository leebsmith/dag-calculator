// Panel view: the six outcome cells (with the pin residual), the inline context
// line, the report-faithful details popover and the solver groups. Every value is
// a read of the engine through the same dimension-aware formatter the findings
// use, so the panel never invents a zero: an unresolved path displays as a dash.

import { strip, context, groups } from "./panel.js";
import { dimensionOf } from "./registry/catalog.js";
import { surfaceManifest } from "./registry/surface.generated.js";

const DASH = "—";
const PIN_TARGETS = {
  abv: "batch.target_abv",
  og: "batch.target_og",
  fg: "batch.target_fg",
};

const sentence = (value) => value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();

function display(read, format, artifact, path, { unit, casing } = {}) {
  if (!surfaceManifest.paths[path]) return DASH;
  const value = read(path);
  if (value === null) return DASH;
  if (typeof value === "string") {
    if (value === "") return DASH;
    return casing === "sentence" ? sentence(value) : value;
  }
  return format({ value, dimension: dimensionOf(artifact, path), unit });
}

function rowsOf(read, format, artifact, declared) {
  const rows = [];
  for (const row of declared) {
    // A dosed addition is only listed when it is nonzero, like the water card.
    if (row.unit && !(read(row.path) > 0)) continue;
    rows.push({
      path: row.path,
      label: row.label,
      display: display(read, format, artifact, row.path, { unit: row.unit, casing: row.case }),
    });
  }
  return rows;
}

function pinResidual(read, format, artifact, axis, realizedPath) {
  const targetPath = PIN_TARGETS[axis];
  if (!targetPath) return null;
  const realized = read(realizedPath);
  const target = read(targetPath);
  if (typeof realized !== "number" || typeof target !== "number") return null;
  const delta = realized - target;
  if (!Number.isFinite(delta)) return null;
  const magnitude = format({ value: Math.abs(delta), dimension: dimensionOf(artifact, realizedPath) });
  return `${delta < 0 ? "−" : "+"}${magnitude} vs target`;
}

function statusFor({ boundaryError, boundaryPending, boundaryStatuses, findings }) {
  if (boundaryError) return { tone: "error", text: `Blocked · ${boundaryError.label}` };
  if (boundaryPending) return { tone: "pending", text: "Solving…" };
  const failed = Object.values(boundaryStatuses ?? {}).filter((value) => value === "error");
  if (failed.length > 0) return { tone: "error", text: `Blocked · ${failed.length} solver` };
  const count = findings.length;
  return {
    tone: count > 0 ? "warning" : "ok",
    text: `Solves complete · ${count} finding${count === 1 ? "" : "s"}`,
  };
}

function contextLine(read) {
  const parts = [
    read("equipment.name"),
    read("equipment.description"),
    read("style.name"),
    read("water.source.name"),
  ].filter((part) => typeof part === "string" && part.trim() !== "");
  return parts.join(" · ");
}

function conformanceRows(conformance) {
  if (!conformance) return [];
  const rows = [{ path: "style.sai", label: "Style adherence", display: String(conformance.sai ?? DASH) }];
  for (const dimension of conformance.dimensions ?? []) {
    rows.push({
      path: `style.${dimension.id}`,
      label: dimension.label,
      display: `${dimension.value} — ${dimension.status}`,
    });
  }
  return rows;
}

export function buildPanel({
  artifact,
  read,
  format,
  conformance = null,
  findings = [],
  boundaryError = null,
  boundaryPending = false,
  boundaryStatuses = {},
}) {
  const pin = read("batch.scale_pin") ?? "abv";

  const cells = strip.map((cell) => ({
    id: cell.id,
    label: cell.label,
    display: display(read, format, artifact, cell.path),
    sub:
      cell.axis === pin
        ? pinResidual(read, format, artifact, cell.axis, cell.path) ?? "target"
        : "realized",
  }));

  return {
    status: statusFor({ boundaryError, boundaryPending, boundaryStatuses, findings }),
    cells,
    context: {
      line: contextLine(read),
      equipment: context.equipment.map((group) => ({
        id: group.id,
        title: group.title,
        rows: rowsOf(read, format, artifact, group.rows),
      })),
      brewhouse: rowsOf(read, format, artifact, context.brewhouse),
    },
    groups: [
      ...groups.map((group) => ({
        id: group.id,
        title: group.title,
        findings: group.findings === true,
        rows:
          group.computed === "conformance"
            ? conformanceRows(conformance)
            : rowsOf(read, format, artifact, group.rows ?? []),
        meta: group.findings === true ? String(findings.length) : String(group.rows?.length ?? 0),
      })),
    ],
    findings: findings.map((finding) => ({
      id: finding.id,
      label: finding.label,
      message: finding.message,
      severity: finding.severity ?? "warning",
    })),
  };
}
