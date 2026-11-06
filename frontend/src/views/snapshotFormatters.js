// Pure payload shaping for the snapshot seam. The store owns engine reads,
// session/master access, and the Alpine proxy mutations; these helpers only map
// plain values into the persisted payload shape.

/**
 * Shape one frozen node value for the persisted valuation.
 *
 * @pure
 * @param {unknown} value
 * @param {Readonly<{ readonly kind?: string, readonly outputs?: Readonly<Record<string, unknown>> }>} node
 * @returns {unknown}
 */
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

/**
 * Shape the editable draft snapshot.
 *
 * @pure
 * @param {{ readonly identity: Readonly<Record<string, unknown>>, readonly hopStrategy?: string, readonly roots: Readonly<Record<string, unknown>>, readonly collections: Readonly<Record<string, unknown>>, readonly selections: Readonly<Record<string, unknown>>, readonly schemaVersion: number }} args
 * @returns {{ readonly identity: object, readonly hop_strategy: string, readonly roots: object, readonly collections: object, readonly selections: object, readonly schema_version: number }}
 */
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

/**
 * Shape one provenance entry.
 *
 * @pure
 * @param {string} refValue
 * @returns {{ readonly source_template_id: string }}
 */
export function shapeProvenanceEntry(refValue) {
  return { source_template_id: refValue };
}

/**
 * Shape the frozen valuation payload.
 *
 * @pure
 * @param {{ readonly valuation: Readonly<Record<string, unknown>>, readonly provenance: Readonly<Record<string, unknown>>, readonly schemaVersion: number, readonly valuationFormat: string, readonly conformance?: object|null }} args
 * @returns {{ readonly valuation: object, readonly valuation_format: string, readonly provenance: object, readonly schema_version: number, readonly conformance: object|null }}
 */
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

/**
 * Shape the report validation block.
 *
 * @pure
 * @param {{ readonly relations: ReadonlyArray<object>, readonly domains: ReadonlyArray<object>, readonly fieldDomains: ReadonlyArray<object>, readonly collectionDomains: ReadonlyArray<object> }} args
 * @returns {{ readonly relations: ReadonlyArray<object>, readonly domains: ReadonlyArray<object>, readonly field_domains: ReadonlyArray<object>, readonly collection_domains: ReadonlyArray<object> }}
 */
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

/**
 * Shape one boundary telemetry entry.
 *
 * @pure
 * @param {{ readonly binding: string, readonly fingerprint: string, readonly extra?: Readonly<{ readonly telemetry?: ReadonlyArray<object>, readonly warnings?: ReadonlyArray<object>, readonly notes?: ReadonlyArray<object> }> }} args
 * @returns {{ readonly binding: string, readonly fingerprint: string, readonly telemetry: ReadonlyArray<object>, readonly warnings: ReadonlyArray<object>, readonly notes: ReadonlyArray<object> }}
 */
export function shapeTelemetryEntry({ binding, fingerprint, extra }) {
  return {
    binding,
    fingerprint,
    telemetry: extra?.telemetry ?? [],
    warnings: extra?.warnings ?? [],
    notes: extra?.notes ?? [],
  };
}

/**
 * Shape the report inputs payload.
 *
 * @pure
 * @param {{ readonly validation: Readonly<Record<string, unknown>>, readonly telemetry: Readonly<Record<string, unknown>> }} args
 * @returns {{ readonly validation: object, readonly telemetry: object }}
 */
export function shapeReportInputs({ validation, telemetry }) {
  return { validation, telemetry };
}
