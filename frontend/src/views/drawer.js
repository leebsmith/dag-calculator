// Drawer manifest: the bottom sidecar. Notes is one scroll of the four prose
// fields; Checklist is the brew-day surface that already exists. The keys are the
// plan's shortcuts (N, C).

export const drawerTabs = [
  { id: "notes", title: "Notes", key: "n" },
  { id: "checklist", title: "Checklist", key: "c" },
];

export const notes = [
  { id: "discussion", title: "Discussion", schema: "discussionFields", prose: "discussion" },
  { id: "hop_strategy", title: "Hop strategy", schema: "hopStrategyFields", prose: "hopStrategy" },
  {
    id: "fermentation_strategy",
    title: "Fermentation strategy",
    schema: "fermentationStrategyFields",
    prose: "fermentationStrategy",
  },
  { id: "process_notes", title: "Process notes", schema: "processNotesFields", prose: "processNotes" },
];
