# Data

- `artifact.json` — the canonical DAG (source of truth for business logic).
- `seeds/` — the immutable reference catalogs (malt/sugar/yeast/equipment/water/styles),
  the normalized, schema-conforming output of the build scripts.
- `sources/` — the raw, pre-normalization inputs the build scripts consume
  (e.g. the BJCP style-guide export and the hand-authored Specialty IPA sub-types).

Adding an input or derived value to `artifact.json`? See
[`docs/adding-a-node.md`](../docs/adding-a-node.md).
