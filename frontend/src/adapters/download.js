// Download seam: turn a value or a fetched blob into a file. Browser-only
// (Blob + anchor); tests inject the trigger through the store factory.

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function downloadJSON(value, filename) {
  downloadBlob(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
    filename
  );
}

// A tab must be opened in the click handler, before the render's `await`, or the
// popup blocker eats it; the fetch fills it in afterwards.
export function openReportTab() {
  return window.open("", "_blank");
}

export function showReport(tab, blob, filename) {
  const url = URL.createObjectURL(blob);
  if (tab && !tab.closed) {
    tab.location = url;
  } else {
    // The tab was blocked (or closed while rendering): save instead of losing it.
    downloadBlob(blob, filename);
  }
  // The viewer needs the URL alive while it loads.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function closeReportTab(tab) {
  if (tab && !tab.closed) tab.close();
}
