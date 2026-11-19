// Schema keys are transport names. The Library editor, record validation, and
// import verification must present a friendly label instead, so no field label
// may contain a raw underscore key.

import test from "node:test";
import assert from "node:assert/strict";

import { createLibraryFields } from "../../frontend/src/adapters/libraryFields.js";
import {
  fieldErrorText,
  fieldLabel,
  fieldLabelFromPath,
} from "../../frontend/src/views/registry/fieldLabels.js";
import { CATALOGS } from "../../frontend/src/store/userCatalog.js";
import { artifact } from "./util.js";

function fieldsFor(kind) {
  const view = { activeKind: kind, unitMode: {}, libraryDraft: {} };
  Object.defineProperties(
    view,
    Object.getOwnPropertyDescriptors(
      createLibraryFields({
        artifact: artifact(),
        cache: { references: {}, seeds: {} },
        getView: () => view,
      })
    )
  );
  return view.libraryFields;
}

function byField(fields, field) {
  return fields.find((entry) => entry.field === field);
}

test("every Library field and point label is reader-facing", () => {
  const offenders = [];
  for (const kind of Object.keys(CATALOGS)) {
    for (const field of fieldsFor(kind)) {
      if (!field.label || field.label.includes("_")) {
        offenders.push(`${kind}.${field.field} -> ${field.label}`);
      }
      if (field.kind !== "list") continue;
      for (const point of field.fields ?? []) {
        if (!point.label || point.label.includes("_")) {
          offenders.push(`${kind}.${field.field}.${point.field} -> ${point.label}`);
        }
      }
    }
  }
  assert.deepEqual(offenders, []);
});

test("the cooling-curve fields read as the form they describe", () => {
  const fields = fieldsFor("cooling_curve");
  assert.equal(byField(fields, "measured_at").label, "Measured");
  assert.equal(byField(fields, "equipment_id").label, "Equipment");
  assert.equal(byField(fields, "ambient_temp_c").label, "Ambient temperature");
  assert.equal(byField(fields, "start_temp_c").label, "Start temperature");
  assert.equal(byField(fields, "points").label, "Points");
  assert.equal(byField(fields, "points").fields[0].label, "Time");
  assert.equal(byField(fields, "points").fields[1].label, "Temperature");
});

test("errors and import paths resolve through the same labels", () => {
  assert.equal(
    fieldErrorText({ field: "ambient_temp_c", message: "must be a number" }),
    "Ambient temperature: must be a number"
  );
  assert.equal(fieldErrorText({ field: "*", message: "form-level" }), "form-level");
  assert.equal(fieldLabelFromPath("targets.ibu"), "IBU");
  assert.equal(fieldLabelFromPath("mashes[0].duration_min"), "Duration");
  assert.equal(fieldLabel("some_new_key"), "Some new key");
});
