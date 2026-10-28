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

const CLIENT_SEAM =
  "This file reaches an adapter client directly: no client seam in the store yet. " +
  "The import-direction guard records it; do not add another adapter import here.";

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
  ...["persistence", "setup", "recipes"].map((name) => ({
    files: [`frontend/src/store/${name}.js`, `src/store/${name}.js`],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: HIGHER("store").filter((group) => group !== "**/adapters/**"),
              message: CLIENT_SEAM,
            },
          ],
        },
      ],
    },
  })),
];
