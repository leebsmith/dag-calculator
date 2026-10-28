// Batches-view controller: scope/sort, row menus, rename, trash/restore, and
// the transitions between the list and the workspace.
//
// Pure partitioning and labelling live in `recipeList.js`; this module owns the
// stateful surface the templates bind against. It is DOM-free apart from the
// injected `anchor` (popover placement), which keeps it testable in node while
// `main.js` supplies the viewport-aware implementation.

import {
  closeReportTab,
  downloadBlob,
  downloadJSON,
  openReportTab,
  showReport,
} from "../adapters/download.js";
import { reportError } from "../observability.js";
import { safeFilename } from "../utils.js";
import {
  SCOPE_LABELS,
  batchesForScope,
  formatDate,
  identityLabel,
  parentLabel,
} from "./recipeList.js";

export function createRecipesStore({
  persistence,
  getSetup,
  anchor = () => "",
  download = downloadJSON,
  downloadFile = downloadBlob,
  openTab = openReportTab,
  showTab = showReport,
  closeTab = closeReportTab,
} = {}) {
  return {
    view: "batches", // "batches" | "editor"
    scope: "all", // "all" | "drafts" | "frozen" | "trash"
    batches: [],
    activeId: null,
    activeName: "",
    loadError: false,
    saveState: "idle", // "idle" | "dirty" | "saving" | "error" | "conflict"
    conflictRemote: null,
    actionError: null, // { title, message } | null — the last failed freeze/download
    sort: "modified", // "modified" | "title"
    sortOpen: false,
    sortMenuStyle: "",
    rowMenu: null,
    rowMenuStyle: "",
    // Report picker: null target = the active batch (editor), else the row.
    reportPickerOpen: false,
    reportPickerTarget: null,
    reportSections: [],
    reportSelection: [],
    renamingId: null,
    renameValue: "",

    get rows() {
      return batchesForScope(this.batches, this.scope, { sort: this.sort });
    },

    get prerequisites() {
      return getSetup().prerequisiteStatus();
    },

    get canCreateBatch() {
      return this.prerequisites.ready;
    },

    get sortLabel() {
      return this.sort === "title" ? "Title" : "Last modified";
    },

    get scopeLabel() {
      return SCOPE_LABELS[this.scope] ?? "All";
    },

    get emptyMessage() {
      if (this.scope === "trash") return "Trash is empty.";
      if (this.scope === "drafts") return "No drafts.";
      if (this.scope === "frozen") return "No frozen batches.";
      return "No batches yet. Create your first batch.";
    },

    dateLabel(seconds) {
      return formatDate(seconds);
    },

    styleLabel(batch) {
      return identityLabel(batch, "style");
    },

    rigLabel(batch) {
      return identityLabel(batch, "equipment");
    },

    waterLabel(batch) {
      return identityLabel(batch, "water.source", "laboratory");
    },

    parentLabel(batch) {
      return parentLabel(batch);
    },

    syncActive() {
      const active = persistence.getActive();
      this.activeId = active?.id ?? null;
      this.activeName = active?.name ?? "";
    },

    async refresh() {
      this.batches = await persistence.list();
      this.loadError = false;
      this.syncActive();
    },

    async retryLoad() {
      try {
        await this.refresh();
      } catch {
        this.loadError = true;
      }
    },

    setScope(scope) {
      if (!SCOPE_LABELS[scope]) return;
      this.scope = scope;
      this.closeRowMenu();
      this.closeSort();
      this.renamingId = null;
    },

    toggleSort(event) {
      this.closeRowMenu();
      if (this.sortOpen) {
        this.sortOpen = false;
        return;
      }
      this.sortMenuStyle = anchor(event);
      this.sortOpen = true;
    },

    closeSort() {
      this.sortOpen = false;
    },

    setSort(sort) {
      if (sort === "modified" || sort === "title") this.sort = sort;
      this.sortOpen = false;
    },

    openRowMenu(batch, event) {
      this.sortOpen = false;
      if (this.rowMenu?.id === batch.id) {
        this.rowMenu = null;
        return;
      }
      this.rowMenuStyle = anchor(event);
      this.rowMenu = batch;
    },

    closeRowMenu() {
      this.rowMenu = null;
    },

    async forkRow() {
      const batch = this.rowMenu;
      this.closeRowMenu();
      if (batch) await this.forkFrozen(batch.id);
    },

    beginRename(batch) {
      this.closeRowMenu();
      this.renamingId = batch.id;
      this.renameValue = batch.name;
    },

    startRename() {
      const batch = this.rowMenu;
      this.closeRowMenu();
      if (batch) this.beginRename(batch);
    },

    cancelRename() {
      this.renamingId = null;
    },

    setRenameValue(value) {
      this.renameValue = value;
    },

    async commitRename(batch) {
      if (this.renamingId !== batch.id) return;
      const name = this.renameValue.trim();
      this.renamingId = null;
      if (!name || name === batch.name) return;
      try {
        await persistence.renameBatch(batch.id, name);
        await this.refresh();
      } catch (err) {
        reportError("recipes.rename", err);
      }
    },

    async trashRow() {
      const batch = this.rowMenu;
      this.closeRowMenu();
      if (!batch) return;
      try {
        await persistence.trashBatch(batch.id);
        await this.refresh();
      } catch (err) {
        reportError("recipes.trash", err);
      }
    },

    async restoreRow(batch) {
      this.closeRowMenu();
      try {
        await persistence.restore(batch.id);
        await this.refresh();
      } catch (err) {
        reportError("recipes.restore", err);
      }
    },

    async deleteRow(batch) {
      this.closeRowMenu();
      try {
        await persistence.deletePermanent(batch.id);
        await this.refresh();
      } catch (err) {
        reportError("recipes.delete", err);
      }
    },

    keepMine() {
      return persistence.saveNow({ force: true });
    },

    reloadFromRemote() {
      return persistence.resolveConflictByReload();
    },

    retrySave() {
      return persistence.saveNow();
    },

    dismissActionError() {
      this.actionError = null;
    },

    recordActionFailure(title, scope, err) {
      this.actionError = { title, message: err?.message ?? String(err) };
      reportError(scope, err);
    },

    async newBatch() {
      getSetup().openModal();
    },

    async openDraft(id) {
      await persistence.open(id);
      this.actionError = null;
      this.scope = "all";
      this.view = "editor";
      this.syncActive();
    },

    async forkFrozen(id) {
      await persistence.fork(id);
      this.actionError = null;
      this.scope = "all";
      this.view = "editor";
      await this.refresh();
      this.syncActive();
    },

    async rename(name) {
      await persistence.renameActive(name);
      this.syncActive();
    },

    async backToBatches() {
      await persistence.flushSave();
      await this.refresh();
      this.renamingId = null;
      this.sortOpen = false;
      this.actionError = null;
      this.view = "batches";
      this.syncActive();
    },

    async trash() {
      await persistence.trashActive();
      await this.refresh();
      this.view = "batches";
      this.scope = "all";
      this.syncActive();
    },

    async restore(id) {
      await persistence.restore(id);
      await this.refresh();
    },

    async deletePermanent(id) {
      await persistence.deletePermanent(id);
      await this.refresh();
    },

    async freeze() {
      this.actionError = null;
      try {
        await persistence.freezeActive();
      } catch (err) {
        this.recordActionFailure("Couldn't freeze this batch", "recipes.freeze", err);
        return;
      }
      await this.refresh();
    },

    async downloadActiveBundle() {
      this.actionError = null;
      let file;
      try {
        file = await persistence.reportBundleForActive();
      } catch (err) {
        this.recordActionFailure(
          "Couldn't build the report bundle",
          "recipes.downloadActiveBundle",
          err
        );
        return;
      }
      if (!file) return;
      download(file.bundle, safeFilename(file.name, "report-bundle.json"));
    },

    async downloadRowBundle() {
      const batch = this.rowMenu;
      this.closeRowMenu();
      if (!batch || batch.status !== "frozen") return;
      this.actionError = null;
      let file;
      try {
        file = await persistence.reportBundleFor(batch.id, batch.name);
      } catch (err) {
        this.recordActionFailure(
          "Couldn't build the report bundle",
          "recipes.downloadRowBundle",
          err
        );
        return;
      }
      download(file.bundle, safeFilename(file.name, "report-bundle.json"));
    },

    // A frozen row passes itself; the editor opens the picker for the active
    // batch. The section list is fetched once and cached.
    async openReportPicker(batch = null) {
      if (batch) this.closeRowMenu();
      this.actionError = null;
      this.reportPickerTarget = batch;
      this.reportPickerOpen = true;
      if (!this.reportSections.length) {
        try {
          this.reportSections = await persistence.reportSections();
        } catch (err) {
          this.reportPickerOpen = false;
          this.reportPickerTarget = null;
          this.recordActionFailure(
            "Couldn't load the report sections",
            "recipes.openReportPicker",
            err
          );
          return;
        }
      }
      this.reportSelection = this.reportSections.map((section) => section.id);
    },

    closeReportPicker() {
      this.reportPickerOpen = false;
      this.reportPickerTarget = null;
    },

    toggleReportSection(id) {
      this.reportSelection = this.reportSelection.includes(id)
        ? this.reportSelection.filter((selected) => selected !== id)
        : [...this.reportSelection, id];
    },

    selectAllReportSections() {
      this.reportSelection = this.reportSections.map((section) => section.id);
    },

    clearReportSections() {
      this.reportSelection = [];
    },

    // Selecting everything is the default, so it sends no `sections` at all.
    reportSectionsParam() {
      if (!this.reportSections.length) return {};
      return this.reportSelection.length === this.reportSections.length
        ? {}
        : { sections: this.reportSelection.join(",") };
    },

    reportFilename() {
      const name = this.reportPickerTarget?.name ?? this.activeName;
      const base = safeFilename(name, "pdf");
      const total = this.reportSections.length;
      const count = this.reportSelection.length;
      return total > 0 && count < total
        ? base.replace(/\.pdf$/, `-${count}-sections.pdf`)
        : base;
    },

    async renderSelectedReport() {
      const params = this.reportSectionsParam();
      const target = this.reportPickerTarget;
      return target
        ? persistence.reportFor(target.id, params)
        : persistence.reportForActive(params);
    },

    // The tab opens before the render (popup blockers) and closes on failure.
    async previewSelectedReport() {
      if (!this.reportSelection.length) return;
      this.actionError = null;
      const tab = openTab();
      let report;
      try {
        report = await this.renderSelectedReport();
      } catch (err) {
        closeTab(tab);
        this.recordActionFailure(
          "Couldn't build the report",
          "recipes.previewSelectedReport",
          err
        );
        return;
      }
      if (!report) {
        closeTab(tab);
        return;
      }
      showTab(tab, report.blob, this.reportFilename());
    },

    async downloadSelectedReport() {
      if (!this.reportSelection.length) return;
      this.actionError = null;
      let report;
      try {
        report = await this.renderSelectedReport();
      } catch (err) {
        this.recordActionFailure(
          "Couldn't build the report",
          "recipes.downloadSelectedReport",
          err
        );
        return;
      }
      if (!report) return;
      downloadFile(report.blob, this.reportFilename());
      this.closeReportPicker();
    },
  };
}
