import test from "node:test";
import assert from "node:assert/strict";

import { createBrewDayCard } from "../../frontend/src/adapters/cards/brew-day.js";
import { createMashCard } from "../../frontend/src/adapters/cards/mash.js";
import { createProseFields } from "../../frontend/src/adapters/cards/proseFields.js";

function prose() {
  const view = { discussion: "", fermentationStrategy: "", notify() {} };
  return { view, fields: createProseFields({ getView: () => view }) };
}

test("discussionFields wires read and write to the app member", () => {
  const { view, fields } = prose();
  const context = { discussion: "seed", setDiscussion: fields.setDiscussion.bind(fields) };
  const [field] = fields.discussionFields.call(context);

  assert.equal(field.id, "discussion");
  assert.equal(field.read(), "seed");
  field.write("changed");
  assert.equal(view.discussion, "changed");
  assert.equal(field.attrs.maxlength, 4000);
});

test("fermentationStrategyFields wires read and write to the app member", () => {
  const { view, fields } = prose();
  const context = {
    fermentationStrategy: "cool",
    setFermentationStrategy: fields.setFermentationStrategy.bind(fields),
  };
  const [field] = fields.fermentationStrategyFields.call(context);

  assert.equal(field.id, "fermentation-strategy");
  assert.equal(field.read(), "cool");
  field.write("warm");
  assert.equal(view.fermentationStrategy, "warm");
});

test("mashPresetFields builds options from the preset labels", () => {
  const card = createMashCard({
    engine: { get: () => null, setRoot() {}, setCollection() {} },
    artifact: {},
    getView: () => ({ notify() {}, compute() {}, unitMode: {} }),
    observability: { reportError() {} },
  });
  const context = {
    mashPresetId: "single",
    mashPresetLabels: { single: "Single infusion", step: "Step mash" },
    onMashPresetChange: () => {},
  };
  const [field] = card.mashPresetFields.call(context);

  assert.equal(field.id, "mash-preset-selector");
  assert.equal(field.read(), "single");
  assert.deepEqual(field.options(), [
    { value: "single", label: "Single infusion" },
    { value: "step", label: "Step mash" },
  ]);
});

test("mashModalConfig maps the shell callbacks and validity", () => {
  const card = createMashCard({
    engine: { get: () => null, setRoot() {}, setCollection() {} },
    artifact: {},
    getView: () => ({ notify() {}, compute() {}, unitMode: {} }),
    observability: { reportError() {} },
  });
  const calls = [];
  const context = {
    closeMashModal: () => calls.push("close"),
    commitMashSchedule: () => calls.push("save"),
    isMashDraftValid: false,
  };
  const config = card.mashModalConfig.call(context);

  assert.equal(config.id, "mash-rests");
  assert.equal(config.saveDisabled(), true);
  config.cancel();
  config.save();
  assert.deepEqual(calls, ["close", "save"]);
});

test("brewDayLevelFields exposes the level select", () => {
  const card = createBrewDayCard({
    engine: { get: () => null, setRoot() {}, setCollection() {} },
    artifact: {},
    getView: () => ({ notify() {}, compute() {}, brewDayRows: [] }),
    observability: { reportError() {} },
  });
  const context = {
    brewDayLevel: "standard",
    brewDayLevels: [{ id: "critical", name: "Critical path" }],
    setBrewDayLevel: () => {},
  };
  const [field] = card.brewDayLevelFields.call(context);

  assert.equal(field.id, "checklist-level");
  assert.equal(field.read(), "standard");
  assert.deepEqual(field.options(), [{ value: "critical", label: "Critical path" }]);
});
