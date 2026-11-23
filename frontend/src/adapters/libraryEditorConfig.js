// The record editor's form schema, derived from the active kind's field specs.
// It lives here rather than inline in `x-data` so the partial stays markup and
// the mapping stays testable.

import { formBuilder } from "../components/formBuilder.js";

function specOf(view, name) {
  return view.libraryFields.find((entry) => entry.field === name) || null;
}

function pointSchema(view, list) {
  return list.fields.map((point) => ({
    id: `library-point-${point.field}`,
    type: point.kind === "number" ? "number" : "text",
    label: point.label,
    labelClass: "metric-cell-label",
    controlClass: "form-input text-xs",
    read: (context) => view.libraryPointDisplay(context.index, point.field),
    write: (value, context) => view.librarySetPointField(context.index, point.field, value),
    commit: "change",
    step: point.kind === "number" ? "any" : undefined,
  }));
}

function listFieldSchema(view, field) {
  return {
    id: `library-field-${field.field}`,
    type: "repeat",
    label: field.label,
    labelClass: "form-label text-xs",
    items: () => view.libraryPointRows(),
    key: (row, index) => String(index),
    schema: pointSchema(view, field),
    rowClass: "metric-strip",
    cellClass: "metric-cell",
    add: { label: "Add point", run: () => view.libraryAddPoint() },
    remove: { label: "Remove", run: (row, index) => view.libraryRemovePoint(index) },
  };
}

function baseFieldSchema(view, field) {
  return {
    id: `library-field-${field.field}`,
    label: () => {
      const current = specOf(view, field.field);
      return view.fmt.formatFieldLabel(current?.label ?? field.field, current?.symbol);
    },
    labelClass: "form-label text-xs",
    hint: () => specOf(view, field.field)?.hint,
  };
}

function choiceOptions(field) {
  return () => [
    { value: "", label: "—" },
    ...field.options.map((option) => ({
      value: option,
      label: field.optionLabels?.[option] ?? option,
    })),
  ];
}

const BOOLEAN_OPTIONS = [
  { value: "", label: "Unknown" },
  { value: "true", label: "Yes" },
  { value: "false", label: "No" },
];

function fieldSchema(view, field) {
  if (field.kind === "list") return listFieldSchema(view, field);

  const base = baseFieldSchema(view, field);
  const read = () => view.libraryFieldDisplay(field.field);
  const write = (value) => view.librarySetField(field.field, value);
  const controlClass = "form-input text-xs";

  if (field.kind === "select") {
    return {
      ...base,
      type: "select",
      read,
      write,
      options: choiceOptions(field),
      controlClass: "form-select text-xs",
      commit: "change",
    };
  }
  if (field.kind === "boolean") {
    return {
      ...base,
      type: "select",
      read,
      write,
      options: BOOLEAN_OPTIONS,
      controlClass: "form-select text-xs",
      commit: "change",
    };
  }
  if (field.kind === "number") {
    return {
      ...base,
      type: "number",
      read,
      draft: { read, write },
      write: () => view.libraryCommitField(field.field),
      readonly: () => specOf(view, field.field)?.readOnly === true,
      controlClass,
      step: "any",
      commit: "change",
    };
  }
  if (field.kind === "date") {
    return { ...base, type: "date", read, write, controlClass, commit: "change" };
  }
  return { ...base, type: "text", read, write, controlClass, commit: "input" };
}

export function buildLibraryEditorFields(view) {
  return { schema: view.libraryFields.map((field) => fieldSchema(view, field)) };
}

export function buildLibraryEditorConfig(view) {
  return formBuilder(buildLibraryEditorFields(view));
}
