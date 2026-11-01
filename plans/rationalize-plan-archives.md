# Rationalize plan archives

Replace the flat `plans/archive/` with completion-month buckets
(`plans/archive/YYYY-MM/<slug>.md`), migrate the existing plans, update every
reference, and enforce the layout.

## Decisions

- Bucket by completion month.
- Migrate all 33 existing plans; normalize the legacy space filename.
- `plans/archive/README.md` becomes a short folder map.
- Add an archive-layout guard and update the global `/goal` command.

## Checklist

- [ ] Build the slug → `YYYY-MM` map from README dates, falling back to each plan's last commit date
- [ ] Move the 33 plans into `plans/archive/<YYYY-MM>/`; rename `add new diagnosis code.md`
- [ ] Rewrite every `plans/archive/<slug>.md` reference in living docs, archived plans, code comments, tests, and scripts
- [ ] Update `scripts/emit-sources-manifest.mjs` and regenerate `data/sources/manifest.json`
- [ ] Replace `plans/archive/README.md` with a folder map
- [ ] Add `tests/guards/archive-layout.test.js`
- [ ] Update `AGENTS.md` and the affected living docs
- [ ] Update the global `~/.config/opencode/commands/goal.md` to archive by `YYYY-MM`
- [ ] Run `make check`
- [ ] Run `make test`
- [ ] Audit that no flat archive references remain and the archive layout is valid
- [ ] Move this plan into `plans/archive/2026-11/` and commit

## Verification

    node scripts/emit-sources-manifest.mjs
    make check
    make test
