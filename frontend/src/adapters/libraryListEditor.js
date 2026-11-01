// Flat-list editor for non-DAG library records. One list field per record kind;
// the cooling curve's point rows are the first consumer.

import { schemaFor } from "../store/userCatalog.js";
import { toBase } from "../engine/units.js";
import { displayValue, nonlinearFns } from "../views/producer.js";
import { formatWithDecimals } from "../utils.js";

export function installLibraryListEditor(app, ctx) {
  const { artifact, engine } = ctx;
  const nl = () => nonlinearFns(artifact, engine);

  Object.assign(app, {
    libraryListField() {
      return this.libraryFields.find((field) => field.kind === "list") ?? null;
    },

    libraryPointRows() {
      const listField = this.libraryListField();
      return listField ? this.libraryDraft?.[listField.field] ?? [] : [];
    },

    libraryPointSpec(field) {
      return this.libraryListField()?.fields.find((entry) => entry.field === field) ?? null;
    },

    libraryPointDisplay(index, field) {
      const value = this.libraryPointRows()[index]?.[field];
      if (value === undefined || value === null || value === "") return "";
      const spec = this.libraryPointSpec(field);
      if (!spec || spec.kind !== "number" || !spec.unitId || spec.dimension == null) return value;
      const shown = displayValue(artifact, spec.dimension, spec.unitId, value, nl());
      return formatWithDecimals(shown, spec.decimals);
    },

    librarySetPointField(index, field, value) {
      const listField = this.libraryListField();
      if (!listField) return;
      const rows = [...this.libraryPointRows()];
      const spec = this.libraryPointSpec(field);
      let next = value;
      if (value === "") {
        next = 0;
      } else if (spec?.kind === "number") {
        let n = Number(value);
        if (Number.isFinite(n) && spec.unitId && spec.dimension != null) {
          n = toBase(artifact, spec.dimension, spec.unitId, n, nl());
        }
        next = Number.isFinite(n) ? n : 0;
      }
      rows[index] = { ...rows[index], [field]: next };
      this.libraryDraft = { ...this.libraryDraft, [listField.field]: rows };
    },

    libraryAddPoint() {
      const listField = this.libraryListField();
      if (!listField) return;
      const row = Object.fromEntries(
        listField.fields.map((field) => [field.field, field.kind === "number" ? 0 : ""])
      );
      this.libraryDraft = {
        ...this.libraryDraft,
        [listField.field]: [...this.libraryPointRows(), row],
      };
    },

    libraryRemovePoint(index) {
      const listField = this.libraryListField();
      if (!listField) return;
      const rows = this.libraryPointRows().filter((_, rowIndex) => rowIndex !== index);
      this.libraryDraft = { ...this.libraryDraft, [listField.field]: rows };
    },

    librarySortPoints() {
      const listField = this.libraryListField();
      const schema = schemaFor(this.activeKind)?.fields?.[listField?.field];
      if (!listField || !schema?.ordered_by) return;
      const rows = [...this.libraryPointRows()].sort(
        (left, right) => Number(left[schema.ordered_by]) - Number(right[schema.ordered_by])
      );
      this.libraryDraft = { ...this.libraryDraft, [listField.field]: rows };
    },
  });
}

export const KEYS = [
  "libraryListField",
  "libraryPointRows",
  "libraryPointSpec",
  "libraryPointDisplay",
  "librarySetPointField",
  "libraryAddPoint",
  "libraryRemovePoint",
  "librarySortPoints",
];
