const BROWSER_GLOBALS = {
  window: "readonly",
  document: "readonly",
  navigator: "readonly",
  localStorage: "readonly",
  fetch: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  setInterval: "readonly",
  clearInterval: "readonly",
  requestAnimationFrame: "readonly",
  cancelAnimationFrame: "readonly",
  URL: "readonly",
  URLSearchParams: "readonly",
  Blob: "readonly",
  TextEncoder: "readonly",
  crypto: "readonly",
  console: "readonly",
};

const IMPORT_RANKS = {
  "utils.js": 1,
  "observability.js": 2,
  "firebase.js": 2,
  "firebaseConfig.js": 2,
  utils: 1,
  engine: 2,
  views: 3,
  ui: 4,
  store: 5,
  adapters: 6,
  main: 7,
};

const HIGHER = (layer) =>
  Object.entries(IMPORT_RANKS)
    .filter(([, rank]) => rank > IMPORT_RANKS[layer])
    .map(([name]) => (name.endsWith(".js") ? `**/${name}` : `**/${name}/**`));

const restrictedImports = (layer, { ignore = [] } = {}) => [
  "error",
  {
    patterns: [
      {
        group: HIGHER(layer).filter((group) => !ignore.includes(group)),
        message:
          "Imports must point down: utils < engine < views < ui < store < adapters < main. " +
          "Move the shared code down a layer, or record the inversion in " +
          "tests/guards/import-direction.test.js.",
      },
    ],
  },
];

const SOURCE_RULES = {
  "no-undef": "error",
  "no-unused-vars": "error",
  eqeqeq: ["error", "smart"],
  "no-shadow": "error",
  "prefer-const": "error",
  "no-var": "error",
  "no-duplicate-imports": "error",
  "no-fallthrough": "error",
  "consistent-return": "error",
  "no-console": "error",
};

const SHAPE_RULES = {
  complexity: ["error", 12],
  "max-depth": ["error", 4],
  "max-lines-per-function": ["error", 80],
  "max-lines": ["error", 400],
  "max-params": ["error", 5],
  "max-statements": ["error", 40],
};

const shapeException = (reason, files, rules) => ({
  name: `shape: ${reason}`,
  files: files.flatMap((file) => [`frontend/src/${file}`, `src/${file}`]),
  rules,
});

const shapePins = (reason, rule, pins) =>
  Object.entries(pins).map(([file, ceiling]) =>
    shapeException(reason, [file], { [rule]: ["error", ceiling] }),
  );

const SURFACE_DECLARERS = [
  "adapters/cards/catalogDraft.js",
  "adapters/cards/hops.js",
  "adapters/cards/late-additions.js",
  "adapters/cards/malt.js",
  "adapters/cards/mash.js",
  "adapters/cards/style/navigator.js",
  "adapters/cards/style/targets.js",
  "adapters/cards/water.js",
  "adapters/cards/yeast.js",
  "adapters/draftEditor.js",
  "adapters/fieldActions.js",
  "adapters/libraryUi.js",
  "adapters/session.js",
  "adapters/stepAdapter.js",
  "adapters/stepView.js",
  "store/library.js",
  "store/recipes.js",
  "store/setup.js",
  "store/snapshot.js",
];

const GRAMMAR_COMPLEXITY = {
  "engine/ast.js": 22,
  "engine/dag.js": 26,
  "engine/domains.js": 17,
  "engine/fermentation.js": 15,
  "engine/ingredientPriors.js": 17,
  "engine/styleConformance.js": 18,
  "engine/units.js": 93,
  "engine/validate.js": 34,
  "views/producer/projection.js": 39,
  "views/producer/scalar.js": 33,
  "views/producer/table.js": 17,
  "views/registry/catalog.js": 29,
  "views/registry/presentation.js": 14,
};

const LIFECYCLE_COMPLEXITY = {
  "adapters/boundaryRunner.js": 35,
  "adapters/cards/catalogDraft.js": 18,
  "adapters/cards/water.js": 38,
  "adapters/fieldAttribution.js": 18,
  "adapters/stepAdapter.js": 13,
  "adapters/stepView.js": 19,
  "adapters/waterGate.js": 13,
  "store/library.js": 18,
  "store/persistence.js": 13,
  "store/unitPrefs.js": 27,
  "store/userCatalog.js": 33,
  "utils/format.js": 14,
  "views/producer/catalogDrawer.js": 15,
  "views/producer/reportFormat.js": 13,
};

const STATEMENT_PINS = {
  "adapters/boundaryRunner.js": 65,
  "adapters/cards/water.js": 63,
  "adapters/stepAdapter.js": 43,
  "engine/sha256.js": 44,
  "engine/units.js": 57,
  "main.js": 53,
  "views/producer/stylePlot.js": 46,
  "views/producer/table.js": 42,
};

const PARAM_PINS = {
  "engine/fermentation.js": 6,
  "engine/validate.js": 7,
  "views/producer/table.js": 6,
  "views/whirlpool.js": 6,
};

const DEPTH_PINS = {
  "adapters/boundaryRunner.js": 5,
  "engine/dag.js": 5,
};

const FILE_LINE_PINS = {
  "adapters/cards/hops.js": 550,
  "adapters/cards/late-additions.js": 450,
  "adapters/cards/water.js": 650,
  "adapters/stepAdapter.js": 500,
  "engine/fermentation.js": 550,
  "store/recipes.js": 500,
  "utils/format.js": 550,
};

const CONSOLE_SINK = {
  "observability.js": "implements the sink",
  "store/persistence.js":
    "an autosave failure logs on every attempt; the sink dedupes by scope:message",
};


const DOM_RULES = {
  "no-restricted-syntax": [
    "error",
    {
      selector: "MemberExpression[object.name='document']",
      message: "DOM access belongs in adapters/ or main.js.",
    },
    {
      selector: "MemberExpression[object.name='window']",
      message: "Window access belongs in adapters/ or main.js.",
    },
  ],
};

export default [
  {
    files: ["tests/**/*.{js,mjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        console: "readonly",
        process: "readonly",
        URL: "readonly",
        crypto: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        structuredClone: "readonly",
      },
    },
    rules: {
      "no-unused-vars": "warn",
    },
  },
  {
    files: ["frontend/src/**/*.js", "src/**/*.js"],
    linterOptions: { reportUnusedDisableDirectives: "error" },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: BROWSER_GLOBALS,
    },
    rules: SOURCE_RULES,
  },
  {
    files: ["frontend/src/**/*.js", "src/**/*.js"],
    rules: SHAPE_RULES,
  },
  shapeException(
    "surface declarer: every member is declared one key at a time, and the ownership index plus the surface guard are its contract, not a line count",
    SURFACE_DECLARERS,
    { "max-lines-per-function": ["error", 450] },
  ),
  shapeException(
    "grammar dispatch: the interpreter and the projection registry carry one branch per node kind, so the function length follows the grammar",
    ["engine/dag.js", "engine/units.js", "engine/validate.js"],
    { "max-lines-per-function": ["error", 300] },
  ),
  shapeException(
    "one pass per file: the solver schedule and the plot model are single compositions with their steps inlined",
    ["adapters/boundaryRunner.js", "views/producer/stylePlot.js"],
    { "max-lines-per-function": ["error", 210] },
  ),
  ...shapePins(
    "grammar dispatch: one branch per node kind, pinned at today's count; lower the pin as cases move to tables",
    "complexity",
    GRAMMAR_COMPLEXITY,
  ),
  ...shapePins(
    "lifecycle branches: the card, store and readout paths branch on the boundary's shape, pinned at today's count",
    "complexity",
    LIFECYCLE_COMPLEXITY,
  ),
  ...shapePins(
    "statements: the composition steps are inlined, pinned at today's count",
    "max-statements",
    STATEMENT_PINS,
  ),
  ...shapePins(
    "parameters: the point, unit and table joins thread their context positionally",
    "max-params",
    PARAM_PINS,
  ),
  ...shapePins(
    "nesting: the solver schedule and the graph build nest one level past the ceiling",
    "max-depth",
    DEPTH_PINS,
  ),
  ...shapePins(
    "file size: a pre-ratchet size the splits have not reached yet; frozen here, never raised",
    "max-lines",
    FILE_LINE_PINS,
  ),
  {
    files: ["frontend/src/**/*.js", "src/**/*.js"],
    ignores: [
      "frontend/src/adapters/**",
      "src/adapters/**",
      "frontend/src/main.js",
      "src/main.js",
    ],
    rules: DOM_RULES,
  },
  ...["utils", "engine", "views", "ui", "store", "adapters"].map((layer) => ({
    files: [`frontend/src/${layer}/**/*.js`, `src/${layer}/**/*.js`],
    rules: { "no-restricted-imports": restrictedImports(layer) },
  })),
  ...["utils.js", "observability.js", "firebase.js", "firebaseConfig.js"].map((file) => ({
    files: [`frontend/src/${file}`, `src/${file}`],
    rules: { "no-restricted-imports": restrictedImports(file) },
  })),
  ...Object.entries(CONSOLE_SINK).map(([file, reason]) => ({
    name: `console-sink: ${reason}`,
    files: [`frontend/src/${file}`, `src/${file}`],
    rules: { "no-console": "off" },
  })),
];
