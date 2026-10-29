# --- Configuration -----------------------------------------------------------
PROJECT_ID        := dag-calculator
CLOUD_RUN_SERVICE := dag-calculator-backend
CLOUD_RUN_REGION  := us-east4

# Scrapers live in scripts/scrape/ (Python; deps isolated from the backend).
SCRAPE_DIR  := scripts/scrape
SCRAPE_DEPS := --with-requirements $(SCRAPE_DIR)/requirements.txt

# Optional passthroughs for scrape targets:
#   make scrape-hops LIMIT=25 OUT=/tmp/hops.json
LIMIT ?=
OUT   ?=

# Pinned report toolchain version (read by report-dev and checked in tests).
TYPST_VERSION := $(shell cat backend/app/templates/TYPST_VERSION 2>/dev/null)

# Emulator data: import only when a prior export exists, so a fresh checkout (or a
# wiped emulator-data dir) starts quietly instead of warning about missing
# import metadata.
EMULATOR_DATA   := emulator-data
EMULATOR_IMPORT := $(wildcard $(EMULATOR_DATA)/firebase-export-metadata.json)
EMULATOR_FLAGS  := $(if $(EMULATOR_IMPORT),--import=$(EMULATOR_DATA)) --export-on-exit=$(EMULATOR_DATA)

# BJCP re-aggregation reads a local HTML cache (not committed).
#   make aggregate-bjcp BJCP_CACHE=~/MyPythonEnvironment/bjcp_scraper/2021
BJCP_CACHE   ?=
BJCP_EDITION ?= 2021

.PHONY: help hooks local-dev check test test-affected test-guards quick test-fuzz test-oracle coverage verify verify-full build clear reset-data generate local-data save-data seeds seeds-styles seeds-yeasts seeds-hops \
        seeds-fermentables seeds-standard-malts seeds-hop-products \
        scrape-yeasts scrape-whitelabs scrape-hops aggregate-bjcp clean deploy deploy-rules deploy-backend deploy-frontend destroy \
        report-dev report-pages

help:
	@echo "Usage: make <target>"
	@echo
	@echo "  local-dev       Run frontend + Firebase emulators + backend"
	@echo "  report-dev      Watch the report templates against a downloaded bundle"
	@echo "                  (PAPER=auto|a4|letter, SECTIONS=a,b)"
	@echo "  check           Frontend/backend lint + architectural boundaries"
	@echo "  test            Frontend + backend test suites"
	@echo "  quick           check + the suites the working diff can reach (the loop)"
	@echo "  test-affected   The suites the working diff can reach (BASE=<ref>)"
	@echo "  test-guards     The guard suites only"
	@echo "  test-fuzz       Seeded water-solver invariant sweep (CASES=200 SEED=...)"
	@echo "  test-oracle     Check the oracle snapshot against the legacy checkout"
	@echo "  coverage        Frontend + backend coverage reports"
	@echo "  verify          check + test + production build (hermetic)"
	@echo "  verify-full     verify + test-oracle (needs the legacy checkout)"
	@echo "  generate        Regenerate every locally computable generated artifact"
	@echo "  hooks           Install the committed git hooks (core.hooksPath)"
	@echo "  build           Production frontend bundle + dist assertions"
	@echo "  seeds           Rebuild normalized seed catalogs from data/sources/"
	@echo "  scrape-yeasts   Crawl beer-analytics.com yeasts -> data/sources/"
	@echo "  scrape-whitelabs Crawl whitelabs.com yeasts -> data/sources/"
	@echo "  scrape-hops     Crawl beer-analytics.com hops -> data/sources/"
	@echo "                  (LIMIT=N for a trial, OUT=path to override output)"
	@echo "  aggregate-bjcp  Re-aggregate cached BJCP HTML into data/sources/"
	@echo "                  (BJCP_CACHE=<dir> BJCP_EDITION=2021)"
	@echo "  save-data       Snapshot emulator data (Firestore + Auth) to emulator-data/"
	@echo "  clean           Save emulator data, stop local processes, reclaim ports (alias: clear)"
	@echo "  reset-data      Delete local emulator data (drafts, frozen batches, library)"
	@echo "  deploy          Deploy Firestore rules, backend (Cloud Run) and frontend"
	@echo "  deploy-rules    Deploy firestore.rules only"
	@echo "  destroy         Tear down the deployed services"

# --- Local development -------------------------------------------------------
# Everything the local run owns outside the browser's localStorage lives in
# emulator-data/ (Firestore documents plus Auth accounts), gitignored. The import
# runs only when a snapshot exists; the exit snapshot only fires on a graceful
# stop, which is why `make save-data` and `make clean` exist.
local-dev: local-data
	@echo "Starting local emulators and development servers..."
	@echo "Access the app at http://localhost:5173"
	@npx concurrently \
		--kill-others \
		--names "VITE,FIREBASE,UV" \
		--prefix-colors "blue,yellow,green" \
		"cd frontend && npm run dev" \
		"mkdir -p $(EMULATOR_DATA) && npx firebase emulators:start --project $(PROJECT_ID) $(EMULATOR_FLAGS)" \
		"cd backend && FIREBASE_PROJECT_ID=$(PROJECT_ID) FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 ALLOWED_EMAILS=dev@localhost uv run uvicorn app.main:app --reload --port 8000"

# Prints which data the next run starts from; runnable on its own to inspect it.
local-data:
	@if [ -n "$(EMULATOR_IMPORT)" ]; then \
		echo "Local data: importing $(EMULATOR_DATA)/ (snapshot of $$(date -r $(EMULATOR_IMPORT) '+%Y-%m-%d %H:%M'))"; \
	elif [ -d $(EMULATOR_DATA) ]; then \
		echo "Local data: $(EMULATOR_DATA)/ holds no snapshot; starting empty (make save-data writes one)"; \
	else \
		echo "Local data: none; make save-data (or make clean) writes $(EMULATOR_DATA)/"; \
	fi

# Snapshot the running emulators. Unlike the exit snapshot this does not depend on
# how the process stops, so it is the save to run before anything risky.
save-data:
	@echo "Saving emulator data to $(EMULATOR_DATA)/..."
	@npx firebase emulators:export $(EMULATOR_DATA) --force --project $(PROJECT_ID) \
		|| { echo "save-data: no emulator hub is reachable; start make local-dev first"; exit 1; }

# --- Report templates --------------------------------------------------------
# Iterate on backend/app/templates against a bundle downloaded from the app
# (editor toolbar -> Download bundle). `.local/` is gitignored and disposable.
# The typst binary is not a project dependency; it must match TYPST_VERSION.
REPORT_DIR := .local/report
REPORT_FONTS := backend/app/templates/fonts
SECTIONS   ?=
PAPER      ?= auto

report-dev:
	@test -n "$(BUNDLE)" || (echo "Usage: make report-dev BUNDLE=<downloaded report-bundle.json>"; exit 1)
	@test -f "$(BUNDLE)" || (echo "No such bundle: $(BUNDLE)"; exit 1)
	@actual=$$(typst --version 2>/dev/null | cut -d' ' -f2); \
	  if [ "$$actual" != "$(TYPST_VERSION)" ]; then \
	    echo "typst $$actual does not match the pinned $(TYPST_VERSION)"; exit 1; \
	  fi
	@mkdir -p $(REPORT_DIR)
	@cp "$(BUNDLE)" $(REPORT_DIR)/report.json
	typst watch --root . --font-path $(REPORT_FONTS) --ignore-system-fonts \
		--input bundle=/$(REPORT_DIR)/report.json \
		--input sections=$(SECTIONS) \
		--input paper=$(PAPER) \
		backend/app/templates/report.typ $(REPORT_DIR)/report.pdf

# One-shot PNG burst (one file per page) for a quick visual check.
report-pages:
	@test -n "$(BUNDLE)" || (echo "Usage: make report-pages BUNDLE=<downloaded report-bundle.json>"; exit 1)
	@test -f "$(BUNDLE)" || (echo "No such bundle: $(BUNDLE)"; exit 1)
	@mkdir -p $(REPORT_DIR)
	@cp "$(BUNDLE)" $(REPORT_DIR)/report.json
	typst compile --format png --root . --font-path $(REPORT_FONTS) --ignore-system-fonts \
		--input bundle=/$(REPORT_DIR)/report.json \
		--input sections=$(SECTIONS) \
		--input paper=$(PAPER) \
		backend/app/templates/report.typ '$(REPORT_DIR)/page-{p}.png'
	@ls -l $(REPORT_DIR)/page-*.png

# --- Verification ------------------------------------------------------------
check:
	@echo "Checking frontend linting..."
	cd frontend && npm run lint
	@echo "Checking test and script linting..."
	./frontend/node_modules/.bin/eslint --config eslint.config.js --max-warnings 0 tests scripts
	@echo "Checking backend linting and architectural boundaries..."
	cd backend && uv run ruff check . ../tests/backend ../scripts
	cd backend && uv run tach check
	@echo "Checking repo hygiene..."
	node scripts/check-hygiene.mjs
	@echo "Checking Firebase config..."
	node scripts/check-firebase-config.mjs

test:
	@echo "Running frontend engine tests..."
	cd frontend && npm test
	@echo "Running backend pytest..."
	cd backend && uv run pytest ../tests/backend/

# The local loop: check first, then only the suites the working diff can reach.
# A pre-filter, never evidence — `make test` is the gate, and .githooks/pre-push
# runs it.
test-affected:
	node scripts/test-affected.mjs

test-guards:
	node scripts/run-tests.mjs --dirs tests/guards

quick: check test-affected
	@echo "quick: check and the affected suites passed (make test is still the gate)"

test-oracle:
	node tests/conformance/emit-oracle-fixture.mjs --check

# Generative search, deliberately outside `verify`: the case count is a
# parameter and a failure is a seed to reproduce, not a diff to review.
test-fuzz:
	cd backend && WATER_FUZZ_CASES=$${CASES:-200} WATER_FUZZ_SEED=$${SEED:-20261022} \
		uv run pytest ../tests/backend/conformance/test_water_fuzz.py -q

coverage:
	@echo "Frontend coverage (loaded modules)..."
	cd frontend && node ../scripts/run-tests.mjs --experimental-test-coverage
	@echo "Backend coverage..."
	cd backend && uv run --with pytest-cov pytest ../tests/backend/ -p no:tach --cov=app --cov-report=term-missing
	@rm -f backend/.coverage

build:
	@echo "Building frontend bundle..."
	cd frontend && npm run build
	node scripts/check-build.mjs

verify: check test build
	@echo "verify: all gates passed"

verify-full: verify test-oracle
	@echo "verify-full: all gates passed, oracle snapshot current"

# --- Generated artifacts & hooks ---------------------------------------------
# The Node generators are run by .githooks/pre-commit (install once per clone
# with `make hooks`). The bundle fixture needs the backend toolchain, so it
# stays here and is enforced by the conformance guard in `make test`.
generate:
	node scripts/emit-artifact-inventory.mjs
	node scripts/emit-ownership-index.mjs
	node scripts/emit-report-bundle-glossary.mjs
	node scripts/emit-report-sections.mjs
	node scripts/emit-sources-manifest.mjs
	$(MAKE) --no-print-directory seeds
	cd backend && PYTHONPATH=. uv run python scripts/emit_report_bundle_fixture.py

hooks:
	git config core.hooksPath .githooks
	chmod +x .githooks/pre-commit .githooks/pre-push
	@echo "Git hooks installed from .githooks/ (pre-commit refreshes generated artifacts; pre-push runs make test)"

# --- Seeds & scrapers --------------------------------------------------------
# Raw scrapes are committed under data/sources/ and normalized into data/seeds/
# by the .mjs builders. Scrapers are polite (identified UA, 1.5 s throttle).
seeds: seeds-styles seeds-yeasts seeds-hops seeds-fermentables seeds-standard-malts seeds-hop-products

seeds-styles:
	node scripts/build-styles-seed.mjs

seeds-yeasts:
	node scripts/build-yeasts-seed.mjs

seeds-hops:
	node scripts/build-hops-seed.mjs

seeds-fermentables:
	node scripts/build-fermentables-seed.mjs

seeds-standard-malts: seeds-fermentables
	node scripts/build-standard-malts-seed.mjs

seeds-hop-products: seeds-hops
	node scripts/build-hop-products-seed.mjs

scrape-yeasts:
	uv run $(SCRAPE_DEPS) python $(SCRAPE_DIR)/yeast_scraper.py \
		$(if $(LIMIT),--limit $(LIMIT),) $(if $(OUT),--out $(OUT),)

scrape-whitelabs:
	uv run $(SCRAPE_DEPS) python $(SCRAPE_DIR)/whitelabs_yeast_scraper.py \
		$(if $(LIMIT),--limit $(LIMIT),) $(if $(OUT),--out $(OUT),)

scrape-hops:
	uv run $(SCRAPE_DEPS) python $(SCRAPE_DIR)/hop_scraper.py \
		$(if $(LIMIT),--limit $(LIMIT),) $(if $(OUT),--out $(OUT),)

# Re-aggregate a local BJCP HTML cache (populate it first with
# scripts/scrape/bjcp/scrape_bjcp.py). HTML is never committed.
aggregate-bjcp:
	@test -n "$(BJCP_CACHE)" || (echo "Set BJCP_CACHE=<cached-html-dir>"; exit 1)
	uv run --with-requirements $(SCRAPE_DIR)/bjcp/requirements.txt \
		python $(SCRAPE_DIR)/bjcp/aggregator.py \
		--dir $(BJCP_CACHE) --out data/sources/bjcp_styles_$(BJCP_EDITION).json
	node scripts/emit-sources-manifest.mjs

# --- Cleanup -----------------------------------------------------------------
clear: clean

# Save before stopping: reclaiming ports must not be the accident that loses the
# session, and the export needs the emulator still up. The second pkill is for an
# emulator orphaned by a killed session — it keeps the port and cannot be
# exported, which is how `local-dev` ends up failing with "port taken".
clean:
	@echo "Saving emulator data, then reclaiming ports..."
	@npx firebase emulators:export $(EMULATOR_DATA) --force --project $(PROJECT_ID) \
		|| echo "clean: no running emulator; $(EMULATOR_DATA)/ keeps its last snapshot"
	@pkill -INT -f '[f]irebase emulators:start' || true
	@pkill -INT -f '[c]loud-firestore-emulator.*--project_id $(PROJECT_ID)' || true
	@pkill -f '[v]ite' || true
	@pkill -f '[u]vicorn app.main:app' || true
	@echo "Ports reclaimed."

# Destructive: drops every local draft, frozen batch, and library record. Kept
# separate from `clean` so reclaiming ports never loses data by accident.
reset-data:
	@echo "Removing local emulator data..."
	@rm -rf $(EMULATOR_DATA)
	@echo "Local data cleared; the next local-dev starts empty."

# --- Deploy ------------------------------------------------------------------
deploy: deploy-rules deploy-backend deploy-frontend

# The rules are deny-all for clients and the Admin SDK bypasses them, so they
# deploy first: a stale ruleset is the only failure mode worth ordering against.
deploy-rules:
	@echo "Deploying Firestore security rules..."
	npx firebase deploy --only firestore:rules --project $(PROJECT_ID)

# The backend is deployed `--allow-unauthenticated` on purpose: Firebase Hosting
# proxies a browser that cannot hold an IAM identity, so access control lives in
# the app (Firebase ID token verification + the ALLOWED_EMAILS allowlist +
# per-uid rate limiting). The real network perimeter is Cloud Armor / an API
# gateway, not IAM.
deploy-backend:
	@echo "Vendoring the artifact + catalog registry for the deployed image..."
	mkdir -p backend/app/_vendor
	cp data/artifact.json data/catalogs.json backend/app/_vendor/
	@echo "Exporting uv dependencies for Cloud Buildpacks..."
	cd backend && uv export --frozen --no-dev -o requirements.txt
	@echo "Deploying backend to Cloud Run..."
	gcloud run deploy $(CLOUD_RUN_SERVICE) \
		--source backend/ \
		--region $(CLOUD_RUN_REGION) \
		--project $(PROJECT_ID) \
		--allow-unauthenticated

deploy-frontend:
	@echo "Building frontend..."
	cd frontend && npm run build
	@echo "Deploying frontend to Firebase Hosting..."
	npx firebase deploy --only hosting --project $(PROJECT_ID)

destroy:
	@echo "Deleting Cloud Run service..."
	gcloud run services delete $(CLOUD_RUN_SERVICE) \
		--region $(CLOUD_RUN_REGION) \
		--project $(PROJECT_ID) \
		--quiet
	@echo "Disabling Firebase Hosting..."
	npx firebase hosting:disable --project $(PROJECT_ID) --force
