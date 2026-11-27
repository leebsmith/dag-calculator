// Wall navigation: the chip row and the scroll region share one cursor. The
// scroll spy is a pure function of section tops so the DOM seam stays thin: the
// factory only reads geometry, scrolls, and moves focus, never field state.

const CONTROL =
  'input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [role="tab"]:not(:disabled)';
const HEADING = "legend, .card-title";
const SPY_SUPPRESSION_MS = 700;
const LANDING_MS = 1200;
const SPY_TOP_OFFSET = 40;
const END_SLOP_PX = 2;

/** The chip a scroll position belongs to: the last section at or above the fold. */
export function nearestChip(ids, tops, { top, atEnd = false }) {
  if (ids.length === 0) return null;
  if (atEnd) return ids[ids.length - 1];
  let current = ids[0];
  for (let index = 0; index < ids.length; index += 1) {
    if (tops[index] <= top) current = ids[index];
  }
  return current;
}

function focusEntry(section) {
  let target = section.querySelector?.(CONTROL) ?? null;
  if (!target) {
    target = section.querySelector?.(HEADING) ?? null;
    if (target) target.tabIndex = -1;
  }
  target?.focus?.({ preventScroll: true });
}

/** Open one determination group and move focus to its summary. */
export function focusPanelGroup(documentRef, id) {
  const group = documentRef?.querySelector?.(`[data-panel-group="${id}"]`) ?? null;
  if (!group) return;
  group.open = true;
  group.scrollIntoView?.({ block: "nearest" });
  const summary = group.querySelector?.("summary") ?? null;
  if (summary) {
    summary.tabIndex = -1;
    summary.focus?.({ preventScroll: true });
  }
}

export function createWallActions({
  fieldsets,
  getView,
  documentRef = globalThis.document,
  now = () => globalThis.performance?.now?.() ?? 0,
  schedule = (fn, ms) => setTimeout(fn, ms),
}) {
  const chips = fieldsets.map(({ id, title, width }) => ({ id, title, width }));
  const ids = chips.map((chip) => chip.id);
  let suppressedUntil = 0;
  let landingTimer = null;

  function sectionOf(id) {
    return documentRef?.querySelector?.(`[data-fieldset="${id}"]`) ?? null;
  }

  function selectFieldset(id) {
    if (!ids.includes(id)) return;
    const view = getView();
    view.activeChipId = id;
    const section = sectionOf(id);
    if (!section) return;
    const reduce = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
    section.scrollIntoView?.({ behavior: reduce ? "auto" : "smooth", block: "start" });
    suppressedUntil = now() + SPY_SUPPRESSION_MS;
    view.landingFieldset = id;
    if (landingTimer) clearTimeout(landingTimer);
    landingTimer = schedule(() => {
      const current = getView();
      if (current.landingFieldset === id) current.landingFieldset = null;
    }, LANDING_MS);

    focusEntry(section);
  }

  function openPanelGroup(id) {
    focusPanelGroup(documentRef, id);
  }

  function resetWall() {
    const view = getView();
    view.activeChipId = ids[0] ?? null;
    view.landingFieldset = null;
    suppressedUntil = 0;
    const wall = documentRef?.querySelector?.(".wall-scroll") ?? null;
    if (wall && "scrollTop" in wall) wall.scrollTop = 0;
  }

  function wallScrolled(event) {
    if (now() < suppressedUntil) return;
    const wall = event?.currentTarget ?? event?.target;
    if (!wall || typeof wall.getBoundingClientRect !== "function") return;
    const present = ids
      .map((id) => [id, sectionOf(id)])
      .filter(([, section]) => section !== null);
    const top = wall.getBoundingClientRect().top + SPY_TOP_OFFSET;
    const atEnd = wall.scrollTop + wall.clientHeight >= wall.scrollHeight - END_SLOP_PX;
    const next = nearestChip(
      present.map(([id]) => id),
      present.map(([, section]) => section.getBoundingClientRect().top),
      { top, atEnd }
    );
    if (next) getView().activeChipId = next;
  }

  return {
    wallChips: chips,
    activeChipId: ids[0] ?? null,
    landingFieldset: null,
    selectFieldset,
    wallScrolled,
    resetWall,
    openPanelGroup,
  };
}

export const KEYS = [
  "wallChips",
  "activeChipId",
  "landingFieldset",
  "selectFieldset",
  "wallScrolled",
  "resetWall",
  "openPanelGroup",
];
