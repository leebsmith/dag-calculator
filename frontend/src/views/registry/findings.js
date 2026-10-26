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

// Host-only advisories: they describe a missing input rather than a numerical
// violation, so they have no artifact relation. Never blocking.
export const HOST_FINDINGS = {
  sta1_unknown: {
    label: "Diastaticus status unknown",
    message: () =>
      "The selected strain does not publish a STA1 result. The model treats it as " +
      "non-diastaticus (d = 0); confirm with the lab before packaging.",
  },
};

export function hostFinding(id) {
  const entry = HOST_FINDINGS[id];
  if (!entry) return null;
  return {
    id,
    label: entry.label,
    severity: "warning",
    message: entry.message(),
    action: null,
  };
}

export function severityFor(relation) {
  return relation?.blocking ? "error" : "warning";
}

export function actionFor(relation) {
  return RELATION_FINDINGS[relation?.id]?.action ?? null;
}

// Operand paths per relation. The dimension comes from the artifact via the
// caller's `read`; nothing here declares a unit.
export function findingOperands(id, read, readConstant = () => ({ value: undefined, dimension: null })) {
  switch (id) {
    case "hlt_not_overfilled":
      return {
        lhs: read("batch.hlt_starting_volume_l"),
        rhs: read("equipment.max_hlt_volume_l"),
      };
    case "hlt_above_coil_floor":
      return {
        lhs: read("batch.hlt_starting_volume_l"),
        rhs: read("equipment.hlt_coil_floor_l"),
      };
    case "hlt_demand_not_overfilled":
      return {
        lhs: read("solver.batch.hlt.v_hlt_top_up"),
        rhs: read("equipment.max_hlt_volume_l"),
      };
    case "kettle_not_overfilled":
      return {
        lhs: read("solver.batch.v_pre_boil"),
        rhs: read("equipment.max_kettle_volume_l"),
      };
    case "mash_tun_not_overfilled": {
      const mash = read("mash.mash_phase_volume_l");
      const sparge = read("mash.sparge_phase_volume_l");
      const peak = (mash.value ?? -Infinity) >= (sparge.value ?? -Infinity) ? mash : sparge;
      return { lhs: peak, rhs: read("equipment.max_mash_tun_volume_l") };
    }
    case "mash_thickness_above_equipment_floor":
      return {
        thickness: read("solver.batch.mash_thickness_l_per_kg"),
        floor: read("equipment.min_lgr_l_per_kg"),
      };
    case "mash_thickness_below_ceiling":
      return {
        thickness: read("solver.batch.mash_thickness_l_per_kg"),
        ceiling: readConstant("max_mash_thickness_l_per_kg"),
      };
    default:
      return {};
  }
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
