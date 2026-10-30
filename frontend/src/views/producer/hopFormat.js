// Hops card display formatters. Mass and temperature follow the batch's unit
// mode, so they need the artifact, the engine and the UI state.

import { displayValue, nonlinearFns } from "../producer.js";
import { UNIT_SYMBOLS, unitDecimals } from "../registry/units.js";
import { formatValueWithUnit, formatWithDecimals, unitSymbol } from "../../utils.js";

export function createHopFormatters({ artifact, engine, ui }) {
  const formatMass = (kg, unit) => {
    if (typeof kg !== "number" || !Number.isFinite(kg)) return "—";
    const value = displayValue(artifact, "mass", unit, kg, nonlinearFns(artifact, engine));
    return formatValueWithUnit(
      formatWithDecimals(value, unitDecimals("mass", unit)),
      unitSymbol(UNIT_SYMBOLS, "mass", unit),
      { dash: "—" }
    );
  };

  const formatTemp = (tempC) => {
    if (typeof tempC !== "number" || !Number.isFinite(tempC)) return "—";
    const unitId = ui.unitMode.temperature ?? "degC";
    const value = displayValue(
      artifact,
      "temperature",
      unitId,
      tempC,
      nonlinearFns(artifact, engine)
    );
    return formatValueWithUnit(
      formatWithDecimals(value, unitDecimals("temperature", unitId)),
      unitSymbol(UNIT_SYMBOLS, "temperature", unitId),
      { dash: "—" }
    );
  };

  return { formatMass, formatTemp };
}
