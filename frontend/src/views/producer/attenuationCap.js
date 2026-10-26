// Display summary for apparent attenuation vs the yeast's malt cap.
// The cap is malt-only; a fully fermentable sugar share can lift the blend
// above it. This helper is pure and is the single source for the readout.

function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}

export function attenuationCapSummary(blend, cap) {
  const blendValue = finite(blend) ? blend : null;
  const capValue = finite(cap) ? cap : null;
  return {
    blend: blendValue,
    cap: capValue,
    lift:
      blendValue != null && capValue != null
        ? Math.max(0, blendValue - capValue)
        : null,
  };
}
