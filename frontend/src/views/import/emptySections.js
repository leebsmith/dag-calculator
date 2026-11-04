// Why a section has no lines, in the page's own terms. Silence reads as a bug.

export function noBatchQuantities(payload) {
  if (!payload) return false;
  return payload.fermentables.length === 0 && payload.hops.length === 0;
}

export function emptySectionNote(payload, section, empty = noBatchQuantities(payload)) {
  if (!payload) return "";
  if (section === "unmodeled") return "nothing outside the model was captured";
  if (empty && (section === "fermentables" || section === "hops")) {
    return payload.document_type === "spec_sheet"
      ? "none on this page: the quantities are stated per unit of production volume and sit below"
      : "none on this page";
  }
  return "none on this page";
}
