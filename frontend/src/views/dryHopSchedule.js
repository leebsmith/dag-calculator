// Dry-hop schedule language: one charge's application instant and contact span.
// Pure and intent-only — nothing here is solved. See the spec decisions in the
// plan archive; the descriptor drives the UI, the validator and the renderer.

export const SCHEDULE_LANGUAGE = Object.freeze({
  time: Object.freeze({ unit: "day", decimals: 2 }),
  events: Object.freeze([
    { id: "pitch", label: "Pitch", rank: 0 },
    { id: "high_krausen", label: "High krausen", rank: 1 },
    { id: "mid_fermentation", label: "Mid fermentation", rank: 2 },
    { id: "terminal_gravity", label: "Terminal gravity", rank: 3 },
    { id: "post_diacetyl", label: "Post-diacetyl", rank: 4 },
    { id: "vdk_clearance", label: "VDK clearance", rank: 5 },
    { id: "hop_creep_plateau", label: "Hop-creep plateau", rank: 6 },
    { id: "biotransformation_equilibrium", label: "Biotransformation equilibrium", rank: 7 },
    { id: "cold_crash", label: "Cold crash", rank: 8 },
    { id: "packaging", label: "Packaging", rank: 9 },
  ]),
  application: Object.freeze([
    { id: "event", label: "Batch event", value: "event", offset: true },
    { id: "day", label: "Day of fermentation", value: "day" },
    { id: "after", label: "Another charge", value: "charge", offset: true },
  ]),
  contact: Object.freeze([
    { id: "for", label: "For a duration", value: "days" },
    { id: "until", label: "Until", value: "instant" },
    { id: "open", label: "No end recorded" },
  ]),
  references: Object.freeze([
    { id: "previous", label: "the previous charge", side: "earlier" },
    { id: "next", label: "the next charge", side: "later" },
    { id: "ordinal", label: "charge N", side: "either", arg: "ordinal" },
  ]),
});

const EVENTS = new Map(SCHEDULE_LANGUAGE.events.map((event) => [event.id, event]));
const DECIMALS = SCHEDULE_LANGUAGE.time.decimals;
const TOLERANCE = 1e-9;

export function eventLabel(id) {
  return EVENTS.get(id)?.label ?? String(id ?? "");
}

export function eventRank(id) {
  return EVENTS.get(id)?.rank ?? null;
}

export function formatDays(value) {
  const rounded = Math.round(Number(value) * 100) / 100;
  return `${rounded} d`;
}

export function validDays(value, { positive = false } = {}) {
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  if (value < 0 || (positive && value === 0)) return false;
  return Math.abs(value * 10 ** DECIMALS - Math.round(value * 10 ** DECIMALS)) < TOLERANCE;
}

export function defaultApplication() {
  return { kind: "event", event: "high_krausen" };
}

export function defaultContact() {
  return { kind: "open" };
}

export function defaultRowSchedule(row = {}) {
  return { ...row, application: defaultApplication(), contact: defaultContact() };
}

export function renderChargeRef(ref) {
  if (ref?.selector === "ordinal") return `charge ${ref.ordinal}`;
  if (ref?.selector === "next") return "the next charge";
  return "the previous charge";
}

export function renderInstant(instant) {
  if (!instant || typeof instant !== "object") return "—";
  if (instant.kind === "day") return `Day ${formatNumber(instant.day)}`;
  if (instant.kind === "event") {
    const offset = instant.offset_days ?? 0;
    const suffix = offset === 0 ? "" : ` ${signedDays(offset)}`;
    return `${eventLabel(instant.event)}${suffix}`;
  }
  if (instant.kind === "after") {
    const offset = instant.offset_days ?? 0;
    const suffix = offset === 0 ? "" : ` ${signedDays(offset)}`;
    return `${renderChargeRef(instant.charge)}${suffix}`;
  }
  return "—";
}

export function renderSpan(span) {
  if (!span || typeof span !== "object") return "—";
  if (span.kind === "for") return `for ${formatDays(span.days)}`;
  if (span.kind === "until") return `until ${renderInstant(span.instant)}`;
  return "no end recorded";
}

export function renderSchedule(row) {
  return { when: renderInstant(row?.application), contact: renderSpan(row?.contact) };
}

function formatNumber(value) {
  return String(Math.round(Number(value) * 100) / 100);
}

function signedDays(value) {
  const sign = value < 0 ? "−" : "+";
  return `${sign} ${formatDays(Math.abs(value))}`;
}

function resolvePrevious(index) {
  return index > 0 ? { index: index - 1 } : { error: "There is no previous charge." };
}

function resolveNext(charges, index) {
  return index + 1 < charges.length ? { index: index + 1 } : { open: true };
}

function resolveOrdinal(charges, index, ref, direction) {
  const ordinal = Number(ref.ordinal);
  if (!Number.isInteger(ordinal) || ordinal < 1 || ordinal > charges.length) {
    return { error: `Charge ${formatNumber(ordinal)} does not exist.` };
  }
  if (ordinal === index + 1) return { error: "A charge cannot follow itself." };
  const target = ordinal - 1;
  if (direction === "application" && target > index) {
    return { error: "An application can only follow an earlier charge." };
  }
  if (direction === "contact" && target < index) {
    return { error: "Contact can only end at a later charge." };
  }
  return { index: target };
}

function resolveRef(charges, index, ref, direction) {
  if (!ref || typeof ref !== "object") return { error: "A charge reference is missing." };
  if (ref.selector === "previous") {
    if (direction === "contact") return { error: "Contact can only end at a later charge." };
    return resolvePrevious(index);
  }
  if (ref.selector === "next") {
    if (direction === "application") return { error: "An application can only follow an earlier charge." };
    return resolveNext(charges, index);
  }
  if (ref.selector === "ordinal") return resolveOrdinal(charges, index, ref, direction);
  return { error: "Unknown charge reference." };
}

function resolveDayInstant(instant) {
  if (!validDays(instant.day)) {
    return { errors: ["A day must be zero or more, with at most two decimals."], warnings: [] };
  }
  return { anchor: { kind: "day", day: instant.day }, errors: [], warnings: [] };
}

function resolveEventInstant(instant) {
  if (!EVENTS.has(instant.event)) return { errors: ["Unknown event."], warnings: [] };
  const offset = instant.offset_days ?? 0;
  if (!validOffset(offset)) return { errors: ["Offsets use at most two decimals."], warnings: [] };
  return { anchor: { kind: "event", event: instant.event, offset }, errors: [], warnings: [] };
}

function combineAnchor(inner, offset) {
  if (inner.kind === "day") {
    const day = inner.day + offset;
    if (day < 0) return { errors: ["An application cannot land before pitch."], warnings: [] };
    return { anchor: { kind: "day", day }, errors: [], warnings: [] };
  }
  if (inner.kind === "event") {
    return {
      anchor: { kind: "event", event: inner.event, offset: inner.offset + offset },
      errors: [],
      warnings: [],
    };
  }
  return { anchor: null, errors: [], warnings: [] };
}

function resolveAfterInstant(charges, index, instant, direction) {
  const offset = instant.offset_days ?? 0;
  if (!validOffset(offset)) return { errors: ["Offsets use at most two decimals."], warnings: [] };
  const target = resolveRef(charges, index, instant.charge, direction);
  if (target.error) return { errors: [target.error], warnings: [] };
  if (target.open) {
    return { errors: [], warnings: ["No later charge: contact has no end event."], anchor: null };
  }
  const inner = resolveAnchor(charges, target.index, charges[target.index]?.application, "application");
  if (inner.errors.length || !inner.anchor) return { errors: inner.errors, warnings: inner.warnings };
  const combined = combineAnchor(inner.anchor, offset);
  return { ...combined, warnings: [...inner.warnings, ...combined.warnings] };
}

function resolveAnchor(charges, index, instant, direction) {
  if (!instant || typeof instant !== "object") {
    return { errors: ["The schedule entry is missing."], warnings: [] };
  }
  if (instant.kind === "day") return resolveDayInstant(instant);
  if (instant.kind === "event") return resolveEventInstant(instant);
  if (instant.kind === "after") return resolveAfterInstant(charges, index, instant, direction);
  return { errors: ["Unknown schedule expression."], warnings: [] };
}

function validOffset(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  return Math.abs(value * 10 ** DECIMALS - Math.round(value * 10 ** DECIMALS)) < TOLERANCE;
}

export function resolveApplication(charges, index) {
  return resolveAnchor(charges, index, charges[index]?.application, "application");
}

export function resolveContact(charges, index) {
  const contact = charges[index]?.contact;
  if (!contact || typeof contact !== "object") {
    return { errors: ["The contact entry is missing."], warnings: [] };
  }
  if (contact.kind === "open") return { errors: [], warnings: [], end: null };
  if (contact.kind === "for") {
    if (!validDays(contact.days, { positive: true })) {
      return { errors: ["Contact must be a positive number of days, with at most two decimals."], warnings: [] };
    }
    return { errors: [], warnings: [], end: { kind: "duration", days: contact.days } };
  }
  if (contact.kind === "until") {
    const inner = resolveAnchor(charges, index, contact.instant, "contact");
    return { errors: inner.errors, warnings: inner.warnings, end: inner.anchor ?? null };
  }
  return { errors: ["Unknown contact expression."], warnings: [] };
}

function compareDayAnchors(start, end) {
  return end.day > start.day ? null : "Contact ends before it starts.";
}

function compareEventAnchors(start, end) {
  const startRank = eventRank(start.event);
  const endRank = eventRank(end.event);
  if (startRank === null || endRank === null) return null;
  if (endRank < startRank) {
    return `Contact ends at ${eventLabel(end.event)}, before the charge is applied (${eventLabel(start.event)}).`;
  }
  if (endRank === startRank && end.offset <= start.offset) {
    return "Contact ends at the same event it starts from.";
  }
  return null;
}

function compareAnchors(start, end) {
  if (!start || !end) return null;
  if (start.kind === "day" && end.kind === "day") return compareDayAnchors(start, end);
  if (start.kind === "event" && end.kind === "event") return compareEventAnchors(start, end);
  return null;
}

function comparisonProblems(start, end, span) {
  const errors = [];
  const warnings = [];
  const problem = compareAnchors(start, end);
  if (problem) {
    const numeric = start.kind === "day" && end?.kind === "day";
    (numeric ? errors : warnings).push(problem);
  }
  if (start.kind === "event" && span?.kind === "duration" && span.days < 1) {
    warnings.push("Contact is shorter than a day; the event anchor is coarse.");
  }
  return { errors, warnings };
}

export function validateCharge(charges, index) {
  const application = resolveApplication(charges, index);
  const contact = resolveContact(charges, index);
  const errors = [...application.errors, ...contact.errors];
  const warnings = [...application.warnings, ...contact.warnings];

  if (application.anchor && contact.end) {
    const start = application.anchor;
    const end =
      contact.end.kind === "duration" && start.kind === "day"
        ? { kind: "day", day: start.day + contact.end.days }
        : contact.end.kind === "duration"
          ? null
          : contact.end;
    const check = comparisonProblems(start, end, contact.end);
    errors.push(...check.errors);
    warnings.push(...check.warnings);
  }

  return { errors, warnings };
}

export function validateCharges(charges) {
  return charges.map((_, index) => validateCharge(charges, index));
}

export function migrateLegacyRow(row) {
  const next = { ...row };
  const application =
    next.application && typeof next.application === "object"
      ? next.application
      : legacyApplication(next);
  const contact =
    next.contact && typeof next.contact === "object" ? next.contact : legacyContact(next);
  const trigger = typeof next.time_of_application === "string" ? next.time_of_application.trim() : "";
  const notes = [trigger, typeof next.notes === "string" ? next.notes.trim() : ""].filter(Boolean);
  delete next.application_event;
  delete next.contact_duration_min;
  delete next.contact_until;
  delete next.time_of_application;
  return { ...next, application, contact, notes: notes.join(" · ") };
}

function legacyApplication(row) {
  const id = row.application_event === "terminal" ? "terminal_gravity" : row.application_event;
  return { kind: "event", event: EVENTS.has(id) ? id : "high_krausen" };
}

function legacyContact(row) {
  const minutes = row.contact_duration_min;
  if (typeof minutes === "number" && Number.isFinite(minutes) && minutes > 0) {
    return { kind: "for", days: Math.round((minutes / 1440) * 100) / 100 };
  }
  if (row.contact_until === "next_charge") {
    return { kind: "until", instant: { kind: "after", charge: { selector: "next" }, offset_days: 0 } };
  }
  if (row.contact_until) {
    const id = row.contact_until === "terminal" ? "terminal_gravity" : row.contact_until;
    if (EVENTS.has(id)) return { kind: "until", instant: { kind: "event", event: id } };
  }
  return { kind: "open" };
}

export function migrateLegacyRows(rows) {
  return Array.isArray(rows) ? rows.map(migrateLegacyRow) : rows;
}
