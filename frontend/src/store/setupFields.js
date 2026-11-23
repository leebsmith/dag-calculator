// Field schemas for the new-batch dialog: the modal shell config, the recipe
// file input and the identity quartet. Split from the store so the schemas are
// unit-testable against a plain stand-in and the store file stays small.

export function setupFieldActions() {
  return {
    newBatchConfig() {
      const setup = this;
      return {
        id: "new-batch",
        title: "New batch",
        cancel: () => setup.closeModal(),
        cancelLabel: "Cancel",
        cancelDisabled: () => setup.state.busy,
        save: () => (setup.state.mode === "scratch" ? setup.create() : setup.startImport()),
        saveLabel: () => (setup.state.mode === "scratch" ? "Create batch" : setup.primaryLabel()),
        saveDisabled: () =>
          setup.state.busy ||
          (setup.state.mode === "scratch" ? !setup.canCreate() : !setup.canStartImport()),
        escape: () => setup.closeModal(),
      };
    },

    recipeFileFields() {
      const setup = this;
      return [
        {
          id: "recipe-file",
          type: "file",
          label: "Recipe document (PDF)",
          when: () => setup.state.mode === "recipe",
          read: () => setup.state.file,
          write: (file) => setup.chooseFile(file),
          filename: () => setup.state.filename,
          attrs: { accept: "application/pdf" },
          hint: "The document is read once and not kept: only the transcription and your mapping persist.",
        },
      ];
    },

    batchIdentityFields() {
      const setup = this;
      const select = (id, label, key, options) => ({
        id,
        type: "select",
        label,
        read: () => setup.state[key],
        write: (value) => {
          setup.state[key] = value;
        },
        options: () => setup[options](),
        commit: "change",
      });
      return [
        {
          id: "batch-name",
          type: "text",
          label: "Batch name",
          placeholder: "e.g. House Pale",
          when: () => setup.state.mode === "scratch",
          read: () => setup.state.name,
          write: (value) => {
            setup.state.name = value;
          },
          commit: "input",
        },
        select("batch-style", "Style", "styleId", "styleOptions"),
        select("batch-rig", "Rig", "equipmentId", "equipmentOptions"),
        select("batch-fermenter", "Fermenter", "fermenterId", "fermenterOptions"),
        select("batch-water", "Water source", "waterId", "waterOptions"),
      ];
    },
  };
}
