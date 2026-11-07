// Seed-to-record actions: forks are styles with lineage; clones are any other
// seed copied into an editable draft that is sealed only on Save.

export function createLibrarySeedActions({ getView, titleOf, identityOf, Catalog }) {
  return {
    // Fork a sealed style: copy its declaration, drop the identity field, record
    // display lineage. The server assigns the new id, so the record is immutable
    // from the moment it is saved.
    forkLibraryItem(item) {
      if (!getView().canForkRecord || !item) return;
      const meta = Catalog[getView().activeKind];
      const id = identityOf(meta, item);
      const draft = { ...item };
      delete draft[meta.idField];
      delete draft.id;
      draft.name = `${titleOf(meta, item)} (copy)`;
      draft.forked_from_id = id;
      draft.forked_from_name = titleOf(meta, item);
      getView().libraryDraft = draft;
      getView().libraryCloneOf = "";
      getView().libraryErrors = [];
      getView().libraryNotice = `Forked from ${titleOf(meta, item)}. Edit the declaration, then save.`;
    },

    // Clone a seed into a draft. Unlike a fork, this is not a lineage record: it
    // starts as the seed's values and is sealed only when the user saves.
    cloneLibraryItem(item) {
      if (!getView().canCloneRecord || !item) return;
      const meta = Catalog[getView().activeKind];
      const draft = { ...item };
      delete draft[meta.idField];
      delete draft.id;
      draft[meta.titleField ?? "name"] = `${titleOf(meta, item)} (copy)`;
      getView().libraryDraft = draft;
      getView().libraryCloneOf = titleOf(meta, item);
      getView().libraryErrors = [];
      getView().libraryNotice = `Cloned from ${titleOf(meta, item)}. Edit it and save to seal.`;
    },
  };
}

export const KEYS = ["forkLibraryItem", "cloneLibraryItem"];
