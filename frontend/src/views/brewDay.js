import seed from "../../../data/seeds/brew-day-steps.json" with { type: "json" };

export const BREW_DAY_PROCESS = seed.process;
export const BREW_DAY_SECTIONS = seed.sections;
export const BREW_DAY_STEPS = seed.sections.flatMap((section) =>
  section.steps.map((step) => ({ ...step, section: section.id }))
);

export function defaultBrewDayRows() {
  return BREW_DAY_STEPS.map((step) => ({
    step_id: step.id,
    section: step.section,
    name: step.name,
    enabled: false,
    instructions: "",
  }));
}

export function materializeBrewDayRows(rows = []) {
  const byId = new Map((rows ?? []).map((row) => [row.step_id, row]));
  return BREW_DAY_STEPS.map((step) => ({
    step_id: step.id,
    section: step.section,
    name: step.name,
    enabled: !!byId.get(step.id)?.enabled,
    instructions: byId.get(step.id)?.instructions ?? "",
  }));
}

export function groupBrewDayRows(rows = []) {
  return BREW_DAY_SECTIONS.map((section) => {
    const steps = rows.filter((row) => row.section === section.id);
    return {
      id: section.id,
      name: section.name,
      steps,
      activeCount: steps.filter((row) => row.enabled).length,
    };
  });
}

export function buildBrewDayPayload(rows = [], defaultInstruction = () => "") {
  const sections = BREW_DAY_SECTIONS.map((section) => ({
    id: section.id,
    name: section.name,
    steps: rows
      .filter((row) => row.section === section.id && row.enabled)
      .map((row) => ({
        id: row.step_id,
        name: row.name,
        instructions: row.instructions || defaultInstruction(row.step_id),
      })),
  })).filter((section) => section.steps.length > 0);

  return { process: BREW_DAY_PROCESS, sections };
}
