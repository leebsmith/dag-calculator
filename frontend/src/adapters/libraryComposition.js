// A record's second face: a yeast can be a strain or a blend, and the Library shows
// them apart without a second catalog kind. The composition is an authored field; a
// blend is simply a yeast record that carries one.

export const KEYS = ["libraryGroups", "libraryItemComposition"];

export function createLibraryComposition({ getView }) {
  return Object.defineProperties(
    {
      // What a blend is made of, for the record card. Blank for a strain.
      libraryItemComposition(item) {
        return item?.blend_of ? `Blend of ${item.blend_of}` : "";
      },
    },
    {
      // The yeast tab has two faces: a strain and a blend. One kind, grouped by
      // the composition field rather than by a second catalog.
      libraryGroups: {
        configurable: true,
        get() {
          const view = getView();
          const records = view.libraryRecords;
          if (view.activeKind !== "yeast") return [{ title: "", items: records }];
          return [
            { title: "Strains", items: records.filter((item) => !item.blend_of) },
            { title: "Blends", items: records.filter((item) => Boolean(item.blend_of)) },
          ];
        },
      },
    }
  );
}
