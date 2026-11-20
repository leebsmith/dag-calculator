// Allocation readouts for the hops card: the mode, the three-stage strip, and
// the count of charges that carry no share. Lazy descriptors, because the view
// does not exist when the card's surface is assembled.

import { HOP_NODES as N } from "../../views/registry/hops.js";
import { formatPercent, formatWithDecimals } from "../../utils.js";
import { resolveOrNull } from "./hopGetters.js";

function stageNote(massPool) {
  return massPool
    ? "Mass shares are authored across the boil + whirlpool pool; the IBU split follows from them and the target. Dry hops are weighed in grams and sit outside the pool."
    : "Stage masses and the IBU split are readouts of the solved bill; the two-pool IBU shares are authored in each hop table. Dry hops sit outside these totals.";
}

export function allocationDescriptors({ engine, getView, formatMass }) {
  const number = (path, decimals) => {
    const value = resolveOrNull(engine, path);
    return typeof value === "number" ? formatWithDecimals(value, decimals) : "—";
  };
  const percent = (path) => {
    const value = resolveOrNull(engine, path);
    return typeof value === "number" ? formatPercent(value, 1) : "—";
  };
  const mass = (path) => {
    const value = resolveOrNull(engine, path);
    return typeof value === "number" ? formatMass(value, getView().hopMassUnit) : "—";
  };
  return {
    hopAllocationMode: {
      configurable: true,
      get() {
        void getView().hopCardRevision;
        return resolveOrNull(engine, N.allocationMode) ?? "ibu_split";
      },
    },
    hopMassPool: {
      configurable: true,
      get() {
        void getView().hopCardRevision;
        return resolveOrNull(engine, N.allocationMode) === "mass_pool";
      },
    },
    hopStageRows: {
      configurable: true,
      get() {
        void getView().hopCardRevision;
        return [
          {
            key: "boil",
            label: "Boil",
            share: percent(N.boilMassShare),
            mass: mass(N.boilMass),
            ibu: number(N.boilIbuRealized, 1),
            ibuShare: percent(N.boilIbuShare),
          },
          {
            key: "hot",
            label: "Hot WP",
            share: percent(N.hotMassShare),
            mass: mass(N.whirlpoolHotMass),
            ibu: number(N.whirlpoolHotIbu, 1),
            ibuShare: percent(N.whirlpoolHotIbuShare),
          },
          {
            key: "cool",
            label: "Cool WP",
            share: percent(N.coolMassShare),
            mass: mass(N.whirlpoolCoolMass),
            ibu: number(N.whirlpoolCoolIbu, 1),
            ibuShare: percent(N.whirlpoolCoolIbuShare),
          },
          {
            key: "hot-side",
            label: "Boil + whirlpool total",
            share: "100 %",
            mass: mass(N.totalMass),
            ibu: number(N.realizedIbu, 1),
            ibuShare: "100 %",
          },
        ];
      },
    },
    hopStageNote: { configurable: true, get: () => stageNote(getView().hopMassPool) },
    hopUnsharedCount: {
      configurable: true,
      get() {
        const view = getView();
        const rows = [...(view.hopRows ?? []), ...(view.whirlpoolHopRows ?? [])];
        return rows.filter((row) => row?.mass_parts == null).length;
      },
    },
  };
}

export function massShareLabel(row) {
  return typeof row?.mass_pct === "number" ? formatPercent(row.mass_pct, 1) : "—";
}

export function hopMassPartsActions({ engine, getView }) {
  return {
    // One hot-side pool: editing any share re-normalizes both tables together.
    setHopMassParts(kind, index, value) {
      const view = getView();
      const nodeId = kind === "whirlpool" ? N.whirlpoolCollection : N.collection;
      const rows = (engine.get(nodeId) ?? []).map((row) => ({ ...row }));
      const row = rows[index];
      if (!row) return;
      const parts = Number(value);
      row.mass_parts = Number.isFinite(parts) ? Math.max(0, parts) : null;
      engine.setCollection(nodeId, rows);
      view.normalizeHopMassPool();
      view.scheduleSolve();
      view.notify();
    },
  };
}
