// Relation wording, severity, and optional actions. Pure presentation data:
// every message takes resolved operands plus a formatter, so units stay a
// render-time concern and no relation declares its own dimension.
//
// The artifact owns the relation set and (from Step 4) each relation's
// `blocking` flag. This registry must cover every `artifact.relations[].id`;
// tests/guards/findings-registry.test.js enforces that completeness.

export const RELATION_FINDINGS = {
  hlt_not_overfilled: {
    label: "HLT capacity",
    message: ({ lhs, rhs }, format) =>
      `HLT fill ${format(lhs)} exceeds the HLT capacity ${format(rhs)}.`,
  },
  hlt_above_coil_floor: {
    label: "HLT coil immersion",
    message: ({ lhs, rhs }, format) =>
      `HLT fill ${format(lhs)} is below the coil immersion floor ${format(rhs)}.`,
  },
  hlt_demand_not_overfilled: {
    label: "HLT liquor demand",
    message: ({ lhs, rhs }, format) =>
      `HLT top-up ${format(lhs)} exceeds the HLT capacity ${format(rhs)}.`,
  },
  kettle_not_overfilled: {
    label: "Kettle capacity",
    message: ({ lhs, rhs }, format) =>
      `Pre-boil volume ${format(lhs)} exceeds the kettle capacity ${format(rhs)}.`,
  },
  mash_tun_not_overfilled: {
    label: "Mash tun capacity",
    message: ({ lhs, rhs }, format) =>
      `Mash tun peak volume ${format(lhs)} exceeds the tun capacity ${format(rhs)}.`,
  },
  mash_thickness_above_equipment_floor: {
    label: "Rig mash thickness floor",
    message: ({ thickness, floor }, format) =>
      `Mash thickness ${format(thickness)} is below the rig's minimum ${format(floor)}.`,
  },
  mash_thickness_below_ceiling: {
    label: "Mash thickness ceiling",
    message: ({ thickness, ceiling }, format) =>
      `Mash thickness ${format(thickness)} exceeds the process ceiling ${format(ceiling)}.`,
    action: {
      handler: "pinMashThickness",
      label: "Use the rig-default mash thickness",
    },
  },
};

export function severityFor(relation) {
  return relation?.blocking ? "error" : "warning";
}

export function actionFor(relation) {
  return RELATION_FINDINGS[relation?.id]?.action ?? null;
}

// `operands` and `format` are optional so the metadata (id, label, severity,
// action) can be enumerated before a boundary solve produces values. Step 6
// supplies both to render the message.
export function findingFor(relation, operands, format) {
  const entry = RELATION_FINDINGS[relation?.id];
  if (!entry) return null;
  const message =
    operands && typeof format === "function" ? entry.message(operands, format) : null;
  return {
    id: relation.id,
    label: entry.label,
    severity: severityFor(relation),
    message,
    action: entry.action ?? null,
  };
}
