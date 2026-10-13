# Historical — frozen snapshots

> **Frozen.** These documents are point-in-time records of the legacy → artifact
> ingestion and validation. They are **not maintained** and may be out of date.
> The source of truth for business logic is `data/artifact.json`; the engine
> (`frontend/src/engine/`) and the test suites (`make check` / `make test`) are
> authoritative for behavior.

| File | What it records |
|---|---|
| `00-ingestion.md` | the ingestion prompt (role + reading order for the ingesting assistant) |
| `discovery-sweep.md` | the discovery-sweep prompt that populated `artifact.json` from the legacy app |
| `provenance.md` | every artifact element → its authoritative source (`inferred` where none) |
| `coverage-matrix.md` | legacy step/partial/store field → artifact element (or "excluded") |
| `gap-register.md` | conflicts found during the sweep and their resolutions (C1…C19) |
| `validation-report.md` | golden-vector, dimension, and boundary-parity validation results |
| `conformance-report.md` | Step C proof that the new engine reproduces the legacy known-good |
| `tech-stack.md` | the framework choices at design time (Vite / Alpine / FastAPI / Firebase) |
| `worked-example.md` | a worked end-to-end example of the artifact language |

References inside these files use their original paths (repo root /
`docs/dag-artifacts/`), so treat them as historical citations rather than live links.
