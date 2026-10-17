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

.PHONY: help local-dev check test seeds seeds-styles seeds-yeasts \
        scrape-yeasts scrape-hops clean deploy deploy-backend deploy-frontend destroy

help:
	@echo "Usage: make <target>"
	@echo
	@echo "  local-dev       Run frontend + Firebase emulators + backend"
	@echo "  check           Frontend/backend lint + architectural boundaries"
	@echo "  test            Frontend + backend test suites"
	@echo "  seeds           Rebuild normalized seed catalogs from data/sources/"
	@echo "  scrape-yeasts   Crawl beer-analytics.com yeasts -> data/sources/"
	@echo "  scrape-hops     Crawl beer-analytics.com hops -> data/sources/"
	@echo "                  (LIMIT=N for a trial, OUT=path to override output)"
	@echo "  clean           Stop local processes and reclaim ports"
	@echo "  deploy          Deploy backend (Cloud Run) + frontend (Firebase)"
	@echo "  destroy         Tear down the deployed services"

# --- Local development -------------------------------------------------------
local-dev:
	@echo "Starting local emulators and development servers..."
	@echo "Access the app at http://localhost:5173"
	@npx concurrently \
		--kill-others \
		--names "VITE,FIREBASE,UV" \
		--prefix-colors "blue,yellow,green" \
		"cd frontend && npm run dev" \
		"mkdir -p emulator-data && npx firebase emulators:start --project $(PROJECT_ID) --import=emulator-data --export-on-exit=emulator-data" \
		"cd backend && FIREBASE_PROJECT_ID=$(PROJECT_ID) FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 uv run uvicorn app.main:app --reload --port 8000"

# --- Verification ------------------------------------------------------------
check:
	@echo "Checking frontend linting..."
	cd frontend && npm run lint || true
	@echo "Checking backend linting and architectural boundaries..."
	cd backend && uv run ruff check .
	cd backend && uv run tach check

test:
	@echo "Running frontend engine tests..."
	cd frontend && npm test || true
	@echo "Running backend pytest..."
	cd backend && uv run pytest ../tests/backend/

# --- Seeds & scrapers --------------------------------------------------------
# Raw scrapes are committed under data/sources/ and normalized into data/seeds/
# by the .mjs builders. Scrapers are polite (identified UA, 1.5 s throttle).
seeds: seeds-styles seeds-yeasts
# NOTE: hops have a raw scrape + scraper but no build-hops-seed.mjs / `hop`
# primitive schema yet; add `seeds-hops` when that lands.

seeds-styles:
	node scripts/build-styles-seed.mjs

seeds-yeasts:
	node scripts/build-yeasts-seed.mjs

scrape-yeasts:
	uv run $(SCRAPE_DEPS) python $(SCRAPE_DIR)/yeast_scraper.py \
		$(if $(LIMIT),--limit $(LIMIT),) $(if $(OUT),--out $(OUT),)

scrape-hops:
	uv run $(SCRAPE_DEPS) python $(SCRAPE_DIR)/hop_scraper.py \
		$(if $(LIMIT),--limit $(LIMIT),) $(if $(OUT),--out $(OUT),)

# --- Cleanup -----------------------------------------------------------------
clean:
	@echo "Cleaning up local environment..."
	@pkill -INT -f '[f]irebase emulators:start' || true
	@pkill -f '[v]ite' || true
	@pkill -f '[u]vicorn app.main:app' || true
	@echo "Ports reclaimed."

# --- Deploy ------------------------------------------------------------------
deploy: deploy-backend deploy-frontend

deploy-backend:
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
