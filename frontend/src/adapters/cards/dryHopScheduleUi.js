// Dry-hop schedule editing: the inspector's application/contact controls and the
// table sentences. The language lives in views/dryHopSchedule.js; this adapter
// reads and writes the active draft row and builds the option lists.

import {
  SCHEDULE_LANGUAGE,
  defaultApplication,
  defaultContact,
  renderSchedule,
} from "../../views/dryHopSchedule.js";

function numberOrNull(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function parseRef(key) {
  const text = String(key ?? "");
  if (text.startsWith("ordinal:")) {
    return { selector: "ordinal", ordinal: Number(text.slice("ordinal:".length)) };
  }
  return { selector: text === "next" ? "next" : "previous" };
}

function refKey(ref) {
  return ref?.selector === "ordinal" ? `ordinal:${ref.ordinal}` : ref?.selector ?? "previous";
}

function scheduleCore(getView) {
  const active = () => getView().dryHopActiveRow ?? {};
  const index = () => getView().dryHopActiveIndex;
  const application = () => active().application ?? defaultApplication();
  const contact = () => active().contact ?? defaultContact();
  const untilInstant = () => contact().instant ?? { kind: "event", event: "packaging" };
  const patch = (value) => getView().patchDraftRow(index(), value);

  function refOptions(side) {
    const total = getView().draftRows?.length ?? 0;
    const at = index();
    const charges = [];
    if (side === "earlier") {
      for (let ordinal = 1; ordinal <= at; ordinal += 1) charges.push(`ordinal:${ordinal}`);
      return [{ value: "previous", label: "the previous charge" }, ...charges.map(chargeOption)];
    }
    for (let ordinal = at + 2; ordinal <= total; ordinal += 1) charges.push(`ordinal:${ordinal}`);
    return [{ value: "next", label: "the next charge" }, ...charges.map(chargeOption)];
  }

  return { application, contact, untilInstant, patch, refOptions };
}

function chargeOption(value) {
  return { value, label: `charge ${value.split(":")[1]}` };
}

function readActions(core) {
  return {
    dryHopApplicationKindOptions: SCHEDULE_LANGUAGE.application,
    dryHopContactKindOptions: SCHEDULE_LANGUAGE.contact,
    dryHopInstantKindOptions: SCHEDULE_LANGUAGE.application,
    dryHopEventOptions: SCHEDULE_LANGUAGE.events.map((event) => ({
      value: event.id,
      label: event.label,
    })),
    dryHopApplicationRefOptions: () => core.refOptions("earlier"),
    dryHopContactRefOptions: () => core.refOptions("later"),
    dryHopWhen: (row) => renderSchedule(row).when,
    dryHopContact: (row) => renderSchedule(row).contact,
    dryHopApplicationKind: () => core.application().kind,
    dryHopApplicationEvent: () => core.application().event ?? "high_krausen",
    dryHopApplicationDay: () => core.application().day ?? 0,
    dryHopApplicationRefKey: () => refKey(core.application().charge),
    dryHopApplicationOffset: () => core.application().offset_days ?? 0,
    dryHopContactKind: () => core.contact().kind,
    dryHopContactDays: () => core.contact().days ?? 1,
    dryHopContactUntilKind: () => core.untilInstant().kind,
    dryHopContactUntilEvent: () => core.untilInstant().event ?? "packaging",
    dryHopContactUntilDay: () => core.untilInstant().day ?? 0,
    dryHopContactUntilRefKey: () => refKey(core.untilInstant().charge),
    dryHopContactUntilOffset: () => core.untilInstant().offset_days ?? 0,
  };
}

function applicationActions(core) {
  return {
    setDryHopApplicationKind(value) {
      const next =
        value === "day"
          ? { kind: "day", day: 0 }
          : value === "after"
            ? { kind: "after", charge: { selector: "previous" }, offset_days: 0 }
            : defaultApplication();
      core.patch({ application: next });
    },
    setDryHopApplicationEvent(value) {
      core.patch({ application: { ...core.application(), event: value } });
    },
    setDryHopApplicationDay(value) {
      core.patch({ application: { kind: "day", day: numberOrNull(value) ?? 0 } });
    },
    setDryHopApplicationRef(value) {
      core.patch({ application: { ...core.application(), charge: parseRef(value) } });
    },
    setDryHopApplicationOffset(value) {
      core.patch({ application: { ...core.application(), offset_days: numberOrNull(value) ?? 0 } });
    },
  };
}

function contactActions(core) {
  return {
    setDryHopContactKind(value) {
      const next =
        value === "for"
          ? { kind: "for", days: 1 }
          : value === "until"
            ? { kind: "until", instant: { kind: "event", event: "packaging" } }
            : { kind: "open" };
      core.patch({ contact: next });
    },
    setDryHopContactDays(value) {
      core.patch({ contact: { kind: "for", days: numberOrNull(value) ?? 1 } });
    },
    setDryHopContactUntilKind(value) {
      const instant =
        value === "day"
          ? { kind: "day", day: 0 }
          : value === "after"
            ? { kind: "after", charge: { selector: "next" }, offset_days: 0 }
            : { kind: "event", event: "packaging" };
      core.patch({ contact: { kind: "until", instant } });
    },
    setDryHopContactUntilEvent(value) {
      core.patch({ contact: { kind: "until", instant: { ...core.untilInstant(), event: value } } });
    },
    setDryHopContactUntilDay(value) {
      core.patch({ contact: { kind: "until", instant: { kind: "day", day: numberOrNull(value) ?? 0 } } });
    },
    setDryHopContactUntilRef(value) {
      core.patch({ contact: { kind: "until", instant: { ...core.untilInstant(), charge: parseRef(value) } } });
    },
    setDryHopContactUntilOffset(value) {
      core.patch({
        contact: { kind: "until", instant: { ...core.untilInstant(), offset_days: numberOrNull(value) ?? 0 } },
      });
    },
  };
}

export function dryHopScheduleActions({ getView }) {
  const core = scheduleCore(getView);
  return { ...readActions(core), ...applicationActions(core), ...contactActions(core) };
}

export const KEYS = [
  "dryHopApplicationKindOptions",
  "dryHopContactKindOptions",
  "dryHopInstantKindOptions",
  "dryHopEventOptions",
  "dryHopApplicationRefOptions",
  "dryHopContactRefOptions",
  "dryHopWhen",
  "dryHopContact",
  "dryHopApplicationKind",
  "dryHopApplicationEvent",
  "dryHopApplicationDay",
  "dryHopApplicationRefKey",
  "dryHopApplicationOffset",
  "dryHopContactKind",
  "dryHopContactDays",
  "dryHopContactUntilKind",
  "dryHopContactUntilEvent",
  "dryHopContactUntilDay",
  "dryHopContactUntilRefKey",
  "dryHopContactUntilOffset",
  "setDryHopApplicationKind",
  "setDryHopApplicationEvent",
  "setDryHopApplicationDay",
  "setDryHopApplicationRef",
  "setDryHopApplicationOffset",
  "setDryHopContactKind",
  "setDryHopContactDays",
  "setDryHopContactUntilKind",
  "setDryHopContactUntilEvent",
  "setDryHopContactUntilDay",
  "setDryHopContactUntilRef",
  "setDryHopContactUntilOffset",
];
