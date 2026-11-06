// Pure payload shaping for the snapshot seam. The store owns engine reads,
// session/master access, and the Alpine proxy mutations; these helpers only map
// plain values into the persisted payload shape.

export function shapeFrozenValue(value, node) {
  if (value === undefined) return null;
  if (node.kind !== "boundary") return value;
  const outputs = value.outputs ?? {};
  return Object.fromEntries(
    Object.keys(node.outputs ?? {})
      .filter((key) => key in outputs)
      .map((key) => [key, outputs[key]])
  );
}

export function shapeDraftState({
  identity,
  hopStrategy,
  roots,
  collections,
  selections,
  schemaVersion,
}) {
  return {
    identity: { ...identity },
    hop_strategy: hopStrategy ?? "",
    roots,
    collections: { ...collections },
    selections: { ...selections },
    schema_version: schemaVersion,
  };
}

export function shapeProvenanceEntry(refValue) {
  return { source_template_id: refValue };
}

export function shapeFreezePayload({
  valuation,
  provenance,
  schemaVersion,
  valuationFormat,
  conformance,
}) {
  return {
    valuation,
    valuation_format: valuationFormat,
    provenance,
    schema_version: schemaVersion,
    conformance: conformance ?? null,
  };
}

export function shapeReportValidation({
  relations,
  domains,
  fieldDomains,
  collectionDomains,
}) {
  return {
    relations,
    domains,
    field_domains: fieldDomains,
    collection_domains: collectionDomains,
  };
}

export function shapeTelemetryEntry({ binding, fingerprint, extra }) {
  return {
    binding,
    fingerprint,
    telemetry: extra?.telemetry ?? [],
    warnings: extra?.warnings ?? [],
    notes: extra?.notes ?? [],
  };
}

export function shapeReportInputs({ validation, telemetry }) {
  return { validation, telemetry };
}
