function gristTableConfig(getView) {
  const view = getView();

  return {
    variant: "editor",
    fixed: true,
    label: "Grain bill",
    columns: [
      {
        id: "name",
        label: "Malt",
        width: "30%",
        cell: "name",
        value: (row) => row.name,
        badge: (row) =>
          row.catalog_id ? null : { text: "Custom", class: "status-badge-info text-micro" },
      },
      { id: "category", label: "Type", width: "11%", cell: "text", value: (row) => row.category },
      { id: "parts", label: "Parts", width: "10%", align: "right", cell: "number", value: (row) => row.parts },
      {
        id: "pct",
        label: "Malt %",
        width: "12%",
        align: "right",
        cell: "percent",
        value: (row) => view.fmt.formatPercent(row.pct),
        cellClass: (row) => (view.maltIsTrace(row) ? "is-trace" : null),
      },
      {
        id: "mass",
        label: "Mass",
        width: "13%",
        align: "right",
        cell: "input",
        input: {
          type: "number",
          step: 0.001,
          readonly: true,
          class: "form-input table-input-parts",
          value: (row) => row.mass_kg,
          splitPill: {
            unit: () => "kg",
            onUnitToggle: () => undefined,
            isLocked: () => true,
            onLockToggle: () => undefined,
          },
        },
      },
      { id: "extract", label: "Extract", width: "12%", align: "right", cell: "number", value: (row) => row.extractDisplay },
      { id: "fermentable", label: "Fermentable", width: "12%", align: "right", cell: "number", value: (row) => view.maltFermentable(row) },
    ],
    get rows() {
      return view.gristRows;
    },
    rowKey: (row, index) => index,
    get emptyText() {
      return "No malts yet. Click “Configure Malts” to build your grain bill.";
    },
  };
}

function traceMaltTableConfig(getView) {
  const view = getView();

  return {
    variant: "editor",
    label: "Trace malts",
    get columns() {
      const field = view.traceMaltField;
      if (!field) return [];
      return field.columns.map((column) => ({
        id: column.id,
        label: view.fmt.formatColumnHeader(column),
        align: column.dimension ? "right" : "left",
        cell: column.dimension ? "number" : "text",
        value: (row) => row[column.id],
      }));
    },
    get rows() {
      const field = view.traceMaltField;
      return field ? field.rows : [];
    },
    rowKey: (row, index) => index,
    get emptyText() {
      return "No trace malts yet. Click “Configure Trace Malts” to add colorants by weight.";
    },
  };
}

function boilHopTableConfig(getView) {
  const view = getView();

  return {
    variant: "editor",
    label: "Boil hop additions",
    columns: [
      { id: "name", label: "Hop", width: "40%", cell: "name", value: (row) => row.name, subvalue: (row) => view.hopForm(row) },
      {
        id: "alpha",
        label: "Alpha",
        width: "15%",
        align: "right",
        cell: "input",
        input: {
          type: "number",
          step: 0.1,
          min: 0,
          class: "form-input table-input-parts",
          value: (row) => view.hopAlphaInput(row),
          onChange: (row, index, raw) => view.setHopAlpha("boil", index, raw),
          ariaLabel: (row) => "Alpha acid percent for " + row.name,
          hint: (row) => view.hopAlphaRange(row),
          hintClass: (row) => (view.hopAlphaOutsideStock(row) ? "text-warning" : null),
        },
      },
      { id: "boil", label: "Boil", width: "15%", align: "right", cell: "number", value: (row) => view.hopBoilPct(row) + " · " + view.hopMinutes(row) },
      { id: "parts", label: "Parts", width: "5%", align: "right", cell: "number", value: (row) => row.parts },
      { id: "pct", label: "IBU share", width: "10%", align: "right", cell: "number", value: (row) => view.hopPct(row) },
      { id: "ibu", label: "IBU", width: "5%", align: "right", cell: "number", value: (row) => view.hopIbu(row) },
      { id: "mass", label: "Mass", width: "10%", align: "right", cell: "number", value: (row) => view.hopMass(row) },
    ],
    get rows() {
      return view.hopRows;
    },
    rowKey: (row, index) => index,
    get emptyText() {
      return "No boil hops yet. Click “Configure Hops” to add additions.";
    },
  };
}

function whirlpoolHopTableConfig(getView) {
  const view = getView();

  return {
    variant: "editor",
    label: "Whirlpool hop additions",
    columns: [
      { id: "name", label: "Hop", width: "39%", cell: "name", value: (row) => row.name, subvalue: (row) => view.hopForm(row) },
      {
        id: "alpha",
        label: "Alpha",
        width: "15%",
        align: "right",
        cell: "input",
        input: {
          type: "number",
          step: 0.1,
          min: 0,
          class: "form-input table-input-parts",
          value: (row) => view.hopAlphaInput(row),
          onChange: (row, index, raw) => view.setHopAlpha("whirlpool", row.source_index, raw),
          ariaLabel: (row) => "Alpha acid percent for " + row.name,
          hint: (row) => view.hopAlphaRange(row),
          hintClass: (row) => (view.hopAlphaOutsideStock(row) ? "text-warning" : null),
        },
      },
      { id: "addition", label: "After flameout", width: "8%", align: "right", cell: "number", value: (row) => view.hopAddition(row) },
      { id: "temp", label: "Initial", width: "8%", align: "right", cell: "number", value: (row) => view.hopTemp(row) },
      { id: "parts", label: "Parts", width: "5%", align: "right", cell: "number", value: (row) => row.parts },
      { id: "pct", label: "IBU share", width: "10%", align: "right", cell: "number", value: (row) => view.hopPct(row) },
      { id: "ibu", label: "IBU", width: "5%", align: "right", cell: "number", value: (row) => view.hopIbu(row) },
      { id: "mass", label: "Mass", width: "10%", align: "right", cell: "number", value: (row) => view.whirlpoolHopMass(row) },
    ],
    get rows() {
      return view.whirlpoolHopRows;
    },
    rowKey: (row) => row.source_index,
    get emptyText() {
      return "No whirlpool hops yet. Click “Configure Whirlpool Hops” to add additions.";
    },
  };
}

export function createTableConfigs({ getView }) {
  return {
    gristTableConfig: () => gristTableConfig(getView),
    traceMaltTableConfig: () => traceMaltTableConfig(getView),
    boilHopTableConfig: () => boilHopTableConfig(getView),
    whirlpoolHopTableConfig: () => whirlpoolHopTableConfig(getView),
  };
}

export const KEYS = [
  "gristTableConfig",
  "traceMaltTableConfig",
  "boilHopTableConfig",
  "whirlpoolHopTableConfig",
];

export const SHARED = [
  {
    key: "gristTableConfig",
    owners: ["malt", "traceMalts"],
    reason: "the fermentables partial binds the shared grain-bill table config",
  },
  {
    key: "traceMaltTableConfig",
    owners: ["malt", "traceMalts"],
    reason: "the fermentables partial binds the shared trace-malt table config",
  },
  {
    key: "boilHopTableConfig",
    owners: ["hop"],
    reason: "the hops partial binds the shared boil-hop table config",
  },
  {
    key: "whirlpoolHopTableConfig",
    owners: ["hop"],
    reason: "the hops partial binds the shared whirlpool-hop table config",
  },
];
