import test from "node:test";
import assert from "node:assert/strict";

import {
  defaultApplication,
  defaultContact,
  migrateLegacyRow,
  migrateLegacyRows,
  renderInstant,
  renderSchedule,
  renderSpan,
  resolveApplication,
  resolveContact,
  validateCharges,
} from "../../frontend/src/views/dryHopSchedule.js";

function charge(application, contact = { kind: "open" }) {
  return { application, contact };
}

const at = (event, offset = 0) => ({ kind: "event", event, offset_days: offset });
const on = (day) => ({ kind: "day", day });
const after = (selector, offset = 0, ordinal = undefined) => ({
  kind: "after",
  charge: ordinal === undefined ? { selector } : { selector, ordinal },
  offset_days: offset,
});
const forDays = (days) => ({ kind: "for", days });
const until = (instant) => ({ kind: "until", instant });

test("renders every instant and span shape", () => {
  assert.equal(renderInstant(at("terminal_gravity")), "Terminal gravity");
  assert.equal(renderInstant(at("terminal_gravity", 2)), "Terminal gravity + 2 d");
  assert.equal(renderInstant(at("packaging", -3)), "Packaging − 3 d");
  assert.equal(renderInstant(on(3)), "Day 3");
  assert.equal(renderInstant(after("previous", 3)), "the previous charge + 3 d");
  assert.equal(renderInstant(after("ordinal", 0, 2)), "charge 2");
  assert.equal(renderSpan(forDays(7)), "for 7 d");
  assert.equal(renderSpan(until(at("packaging"))), "until Packaging");
  assert.equal(renderSpan({ kind: "open" }), "no end recorded");
});

test("renders a schedule pair for a row", () => {
  const row = charge(after("previous", 3), forDays(4));
  assert.deepEqual(renderSchedule(row), { when: "the previous charge + 3 d", contact: "for 4 d" });
});

test("a relative application resolves through the charge it names", () => {
  const charges = [
    charge(at("terminal_gravity")),
    charge(after("previous", 3), forDays(4)),
    charge(after("ordinal", 2, 1), forDays(2)),
  ];
  const application = resolveApplication(charges, 2);
  assert.deepEqual(application.errors, []);
  assert.equal(application.anchor.kind, "event");
  assert.equal(application.anchor.event, "terminal_gravity");
  assert.equal(application.anchor.offset, 2);

  const contact = resolveContact(charges, 2);
  assert.deepEqual(contact.errors, []);
  assert.deepEqual(contact.end, { kind: "duration", days: 2 });
});

test("application references must point backwards", () => {
  const charges = [charge(at("high_krausen")), charge(after("next", 1))];
  assert.deepEqual(validateCharges(charges)[1].errors, [
    "An application can only follow an earlier charge.",
  ]);

  const self = [charge(after("ordinal", 0, 1))];
  assert.deepEqual(validateCharges(self)[0].errors, ["A charge cannot follow itself."]);

  const missing = [charge(at("pitch")), charge(after("ordinal", 0, 5))];
  assert.deepEqual(validateCharges(missing)[1].errors, ["Charge 5 does not exist."]);

  const first = [charge(after("previous", 1))];
  assert.deepEqual(validateCharges(first)[0].errors, ["There is no previous charge."]);
});

test("contact until the next charge resolves, and warns when there is none", () => {
  const charges = [charge(at("terminal_gravity"), until(after("next"))), charge(on(4))];
  assert.deepEqual(validateCharges(charges)[0].errors, []);
  assert.equal(resolveContact(charges, 0).end.kind, "day");

  const last = [charge(at("terminal_gravity"), until(after("next")))];
  const result = validateCharges(last)[0];
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, ["No later charge: contact has no end event."]);
  assert.equal(resolveContact(last, 0).end, null);
});

test("contact cannot point backwards", () => {
  const charges = [charge(at("pitch")), charge(on(2), until(after("previous")))];
  assert.deepEqual(validateCharges(charges)[1].errors, [
    "Contact can only end at a later charge.",
  ]);
});

test("numeric contact must end after it starts", () => {
  const charges = [charge(on(5), until(on(5)))];
  assert.deepEqual(validateCharges(charges)[0].errors, ["Contact ends before it starts."]);

  const duration = [charge(on(5), forDays(1))];
  assert.deepEqual(validateCharges(duration)[0].errors, []);
});

test("a sub-day contact on an event anchor warns, and a day anchor does not", () => {
  const event = [charge(at("high_krausen"), forDays(0.5))];
  assert.deepEqual(validateCharges(event)[0].warnings, [
    "Contact is shorter than a day; the event anchor is coarse.",
  ]);

  const day = [charge(on(2), forDays(0.5))];
  assert.deepEqual(validateCharges(day)[0].warnings, []);
});

test("event rank violations are warnings, not errors", () => {
  const charges = [charge(at("packaging"), until(at("terminal_gravity")))];
  const result = validateCharges(charges)[0];
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, [
    "Contact ends at Terminal gravity, before the charge is applied (Packaging).",
  ]);

  const same = [charge(at("terminal_gravity"), until(at("terminal_gravity")))];
  assert.deepEqual(validateCharges(same)[0].warnings, [
    "Contact ends at the same event it starts from.",
  ]);

  const later = [charge(at("terminal_gravity"), until(at("terminal_gravity", 2)))];
  assert.deepEqual(validateCharges(later)[0].warnings, []);
});

test("days and offsets reject more than two decimals", () => {
  assert.deepEqual(validateCharges([charge(on(1.255))])[0].errors, [
    "A day must be zero or more, with at most two decimals.",
  ]);
  assert.deepEqual(validateCharges([charge(at("pitch", 0.255))])[0].errors, [
    "Offsets use at most two decimals.",
  ]);
  assert.deepEqual(validateCharges([charge(on(1), forDays(0))])[0].errors, [
    "Contact must be a positive number of days, with at most two decimals.",
  ]);
});

test("fractional days survive rendering and resolution", () => {
  const charges = [charge(on(2), forDays(0.25)), charge(after("previous", 0.5), forDays(0.75))];
  assert.equal(renderSchedule(charges[1]).when, "the previous charge + 0.5 d");
  assert.equal(renderSchedule(charges[1]).contact, "for 0.75 d");
  assert.deepEqual(validateCharges(charges).flatMap((result) => result.errors), []);
});

test("defaults are high krausen and open", () => {
  assert.deepEqual(defaultApplication(), { kind: "event", event: "high_krausen" });
  assert.deepEqual(defaultContact(), { kind: "open" });
  assert.deepEqual(renderSchedule({ application: defaultApplication(), contact: defaultContact() }), {
    when: "High krausen",
    contact: "no end recorded",
  });
});

test("legacy rows migrate to the language and keep their prose", () => {
  const migrated = migrateLegacyRow({
    hop_id: "citra",
    application_event: "terminal",
    contact_duration_min: 10080,
    time_of_application: "day 3",
    notes: "whole cone",
  });
  assert.deepEqual(migrated.application, { kind: "event", event: "terminal_gravity" });
  assert.deepEqual(migrated.contact, { kind: "for", days: 7 });
  assert.equal(migrated.notes, "day 3 · whole cone");
  assert.equal("application_event" in migrated, false);
  assert.equal("contact_duration_min" in migrated, false);
  assert.equal("time_of_application" in migrated, false);
});

test("legacy end events and next charge migrate", () => {
  const event = migrateLegacyRow({ application_event: "high_krausen", contact_until: "vdk_clearance" });
  assert.deepEqual(event.contact, {
    kind: "until",
    instant: { kind: "event", event: "vdk_clearance" },
  });

  const next = migrateLegacyRow({ contact_until: "next_charge" });
  assert.deepEqual(next.contact, {
    kind: "until",
    instant: { kind: "after", charge: { selector: "next" }, offset_days: 0 },
  });

  const open = migrateLegacyRow({ application_event: "terminal_gravity" });
  assert.deepEqual(open.contact, { kind: "open" });
  assert.deepEqual(open.application, { kind: "event", event: "terminal_gravity" });
});

test("a blank schedule migrates to the defaults", () => {
  const row = migrateLegacyRow({ application: "", contact: "", notes: "" });
  assert.deepEqual(row.application, { kind: "event", event: "high_krausen" });
  assert.deepEqual(row.contact, { kind: "open" });
});

test("migration is idempotent and maps rows", () => {
  const rows = [{ application_event: "pitch" }, { application: at("pitch"), contact: { kind: "open" } }];
  const twice = migrateLegacyRows(migrateLegacyRows(rows));
  assert.deepEqual(twice, migrateLegacyRows(rows));
});
