# Tech Stack — The Framework (Orthogonal to Domain)

This document describes the **framework** the greenfield app is built *on*. It is
orthogonal to the domain logic in `artifact.json` — nothing here is brewing.

---

## 1. Topology

A **monorepo** with two fully decoupled halves:

- **Frontend** — a static SPA (single-origin, JSON API consumer).
- **Backend** — a headless JSON API. Returns JSON only, never HTML/Jinja2.

Data flow:

```
Browser ── JSON ──▶ FastAPI (verify token) ──▶ service ──▶ repositories/core ──▶ Firestore / seed JSON
```

The frontend and backend are **decoupled**: the API contract is the seam.

---

## 2. Frontend

| Concern | Choice |
|---|---|
| Build | **Vite** (dev server + bundler) |
| UI | **Alpine.js** as a *thin declarative binder* (`x-data`/`x-model`/`x-text`/`x-for`) |
| Engine | **custom explicit-graph engine** (standalone, DOM-free ES module) |
| Styling | CSS **token system** (`tokens.css` = values/theming, `style.css` = structure) |
| Auth | Firebase Web SDK (**compat/CDN** build) |
| Lint | ESLint · Stylelint · PurgeCSS |

**Explicitly not used:** React, Vue, Svelte, Angular, Solid, or any reactive
framework whose dependencies are inferred from reads.

### 2.1 The engine (the important part)

The engine is a **framework-agnostic pure module**:

- Loads `artifact.json`, builds the explicit adjacency graph, topologically
  sorts, and lazily memoizes derived nodes.
- Interprets the expression AST (see `expression-language.md`).
- Calls the two boundaries (fingerprint-cached; currency derived).
- No DOM, no Alpine dependency, no I/O — testable with `node --test`.

The view reads the engine **by node id**; the engine owns all computation.

### 2.2 State

- **Master store** — roots only (inputs + selection ids + overlays), modularized
  by slice. Never holds derived values.
- **Separate UI stores** — ephemeral state (modals, search, unit mode, routing).
- **Reference cache** — seeds/catalogs, read-only, resolved by id.

---

## 3. Backend

| Concern | Choice |
|---|---|
| Language | Python **≥ 3.12** |
| Web | **FastAPI** |
| Models | **Pydantic** schemas |
| Deps | **uv** only (never pip/venv) |
| Boundaries | **tach**-enforced module hierarchy (`main → auth/service → repositories/seeds → schemas/database`) |
| Numerics | **scipy** (`brentq`, `linprog`) — inside the two black-box solvers |
| Auth | Firebase Admin SDK (verify the bearer token) |
| Tests | **pytest**, offline via `dependency_overrides` (mocks `get_db`/`get_current_user`) |

The two solvers are **pure functions**, isolated in `backend/app/core/`, sealed
boundary supernodes (see `domain-equations.md` §2–3).

---

## 4. Platform & persistence

- **Hosting:** Firebase Hosting (frontend) · Cloud Run (backend).
- **Data:** Firestore; **Auth** for identity.
- **Persistence model:** backend-mediated (Browser → FastAPI → Admin SDK →
  Firestore); the browser never talks Firestore directly.
- **Per-user collections** scoped by `request.auth.uid`.
- **Local dev:** Firebase emulators + uvicorn + Vite; backend relies on gcloud
  ADC (no service-account key files).

---

## 5. Conventions (framework-level)

- Declarative markup only — no DOM query/manipulation in the view.
- No React/Tailwind; CSS tokens over raw values.
- Centralized constants (and, in the greenfield, the artifact) — no magic numbers.
- Pure core engines; pure helpers; the domain logic lives in the artifact.
- Plan-first for major features; single-writer discipline for state.
