// The active share column pair for a hop allocation mode. One descriptor is
// consumed by the main hop tables and the Hop Schedule Editor, so the modal can
// never edit a field the solver ignores.

const MASS_POOL = {
  massPool: true,
  shareId: "mass_parts",
  shareLabel: "Share",
  shareHint: "Share of the boil + whirlpool mass",
  shareAria: "Mass share parts for ",
  derivedId: "mass_pct",
  derivedLabel: "Mass share",
};

const IBU_SPLIT = {
  massPool: false,
  shareId: "parts",
  shareLabel: "Parts",
  shareHint: "Share of the stage IBU pool",
  shareAria: "IBU share parts for ",
  derivedId: "pct",
  derivedLabel: "IBU share",
};

export function hopShareFields(mode) {
  return mode === "mass_pool" ? MASS_POOL : IBU_SPLIT;
}

export const HOP_SHARE_FIELDS = ["parts", "pct", "mass_parts", "mass_pct"];
