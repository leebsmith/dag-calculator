// Flat-list editor for non-DAG library records. One list field per record kind;
// the cooling curve's point rows are the first consumer.

import { schemaFor } from "../store/userCatalog.js";
import { toBase } from "../engine/units.js";
import { displayValue, nonlinearFns } from "../views/producer.js";
import { formatWithDecimals } from "../utils.js";

export function createLibraryListEditor({ artifact, engine, getView }) {
  const nl = () => nonlinearFns(artifact, engine);

  return {
    libraryListField() {
      return getView().libraryFields.find((field) => field.kind === "list") ?? null;
    },

    libraryPointRows() {
      const view = getView();
      const listField = view.libraryListField();
      return listField ? view.libraryDraft?.[listField.field] ?? [] : [];
    },
    libraryPointSpec(field) {
      return getView().libraryListField()?.fields.find((entry) => entry.field === field) ?? null;
    },

    libraryPointDisplay(index, field) {
      const view = getView();
      const value = view.libraryPointRows()[index]?.[field];
      if (value === undefined || value === null || value === "") return "";
      const spec = view.libraryPointSpec(field);
      if (!spec || spec.kind !== "number" || !spec.unitId || spec.dimension == null) return value;
      const shown = displayValue(artifact, spec.dimension, spec.unitId, value, nl());
      return formatWithDecimals(shown, spec.decimals);
    },

    librarySetPointField(index, field, value) {
      const view = getView();
      const listField = view.libraryListField();
      if (!listField) return;
      const rows = [...view.libraryPointRows()];
      const spec = view.libraryPointSpec(field);
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
      view.libraryDraft = { ...view.libraryDraft, [listField.field]: rows };
    },

    libraryAddPoint() {
      const view = getView();
      const listField = view.libraryListField();
      if (!listField) return;
      const row = Object.fromEntries(
        listField.fields.map((field) => [field.field, field.kind === "number" ? 0 : ""])
      );
      view.libraryDraft = {
        ...view.libraryDraft,
        [listField.field]: [...view.libraryPointRows(), row],
      };
    },

    libraryRemovePoint(index) {
      const view = getView();
      const listField = view.libraryListField();
      if (!listField) return;
      const rows = view.libraryPointRows().filter((_, rowIndex) => rowIndex !== index);
      view.libraryDraft = { ...view.libraryDraft, [listField.field]: rows };
    },

    librarySortPoints() {
      const view = getView();
      const listField = view.libraryListField();
      const schema = schemaFor(view.activeKind)?.fields?.[listField?.field];
      if (!listField || !schema?.ordered_by) return;
      const rows = [...view.libraryPointRows()].sort(
        (left, right) => Number(left[schema.ordered_by]) - Number(right[schema.ordered_by])
      );
      view.libraryDraft = { ...view.libraryDraft, [listField.field]: rows };
    },
  };
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
