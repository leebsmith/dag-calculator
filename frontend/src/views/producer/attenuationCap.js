// Display summary for apparent attenuation vs the yeast's malt cap.
// The cap is malt-only; a fully fermentable sugar share can lift the blend
// above it. The lift itself is the artifact value `batch.attenuation_above_cap`;
// this helper only normalizes the two figures the card prints beside it.

function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}

export function attenuationCapSummary(blend, cap) {
  return {
    blend: finite(blend) ? blend : null,
    cap: finite(cap) ? cap : null,
  };
}
