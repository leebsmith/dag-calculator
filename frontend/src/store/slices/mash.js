// Master-store slice descriptor: the roots this slice owns (roots only).
// Derived values are never stored — they are computed by the engine.
export const mashSlice = {
  id: "mash",
  roots: {
    // Unset roots fall back to their artifact defaults.
  },
};
