// L2: the model's second opinion over a screened shortlist.
//
// One batched call per catalog kind, never per line. The result is frozen onto the
// record (`suggestions`) so reopening the mapping neither re-calls nor reshuffles
// the chips, and the local screen stays the fallback when the call fails.

import { reportError } from "../observability.js";

const CATALOG_KIND = { fermentables: "malt", hops: "hop", yeasts: "yeast", mashes: "mash" };

export function catalogKindFor(row) {
  if (row.section !== "fermentables") return CATALOG_KIND[row.section] ?? null;
  return row.kind_hint === "sugar" || row.kind_hint === "extract" ? "sugar" : "malt";
}

export function matchActions({ client, catalog }) {
  return {
    get frozenSuggestions() {
      const out = {};
      for (const entry of this.record?.suggestions ?? []) out[entry.line_id] = entry;
      return out;
    },

    // Frozen model picks first, then the local screen. A line with neither falls
    // through to the library search the row already offers.
    chipsFor(row) {
      if (row.section === "mashes") return this.suggestions(row);
      // In blend mode the decision is the blend, offered once by the section; the
      // rows are its components and propose nothing of their own.
      if (row.section === "yeasts" && this.blendMode) return [];
      const frozen = this.frozenSuggestions[row.line_id];
      const kind = this.catalogKind(row);
      const modelChips = (frozen?.ids ?? [])
        .map((id) => catalog(kind, id))
        .filter(Boolean)
        .map((item) => ({ id: item.id, name: item.name, source: "model" }));
      if (modelChips.length) return modelChips;
      return this.suggestions(row);
    },

    catalogKind(row) {
      if (row.section !== "fermentables") return { hops: "hop", yeasts: "yeast", mashes: "mash" }[row.section] ?? null;
      return row.kind_hint === "sugar" || row.kind_hint === "extract" ? "sugar" : "malt";
    },

    enrichSuggestions() {
      return enrich(this, client);
    },

    // Only lines that still need a hop/malt/sugar/yeast, and only those the local
    // screen could offer something for: an empty shortlist is not worth a call.
    matchGroups() {
      const groups = {};
      for (const row of this.unresolved) {
        if (!["fermentables", "hops", "yeasts"].includes(row.section)) continue;
        const kind = this.catalogKind(row);
        const candidates = this.suggestions(row, 6).map((chip) => ({
          id: chip.id,
          name: chip.name,
          detail: chip.detail ?? null,
          standard: chip.standard_malt ?? null,
        }));
        if (!kind || candidates.length === 0) continue;
        (groups[kind] ??= []).push({
          line_id: row.line_id,
          text: row.name,
          stage: row.stage_guess ?? null,
          candidates,
        });
      }
      return groups;
    },

    matchContext() {
      const targets = this.payload?.targets ?? {};
      return {
        volume_l: targets.volume?.unit === "l" ? targets.volume.value : null,
        og: targets.og?.value ?? null,
        ibu: targets.ibu?.value ?? null,
        style_name: this.payload?.style_name ?? null,
      };
    },
  };
}

// The call itself, outside the factory so the composed store stays one screen.
async function enrich(store, client) {
  if (!store.record || store.matchBusy) return null;
  store.matchBusy = true;
  store.matchError = null;
  try {
    const groups = store.matchGroups();
    const merged = { ...store.frozenSuggestions };
    for (const [kind, items] of Object.entries(groups)) {
      const response = await client.match({ kind, context: store.matchContext(), items });
      for (const reply of response.items ?? []) {
        const ids = (reply.picks ?? []).map((pick) => pick.id);
        const line = items.find((item) => item.text === reply.text);
        if (ids.length && line) merged[line.line_id] = { line_id: line.line_id, ids, source: "model" };
      }
    }
    store.record = { ...store.record, suggestions: Object.values(merged) };
    store.dirty = true;
    return merged;
  } catch (err) {
    store.matchError = err?.message ?? "The model could not offer matches.";
    reportError("importReview.enrichSuggestions", err);
    return null;
  } finally {
    store.matchBusy = false;
  }
}
