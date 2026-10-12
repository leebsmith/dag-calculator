# --- Variables ---
PROJECT_ID := dag-calculator
CLOUD_RUN_SERVICE := dag-calculator-backend
CLOUD_RUN_REGION := us-east4

.PHONY: local-dev clean check test deploy deploy-backend deploy-frontend destroy

# Run development servers concurrently
local-dev:
	@echo "Starting local emulators and development servers..."
	@echo "Access the app at http://localhost:5173"
	@npx concurrently \
		--kill-others \
		--names "VITE,FIREBASE,UV" \
		--prefix-colors "blue,yellow,green" \
		"cd frontend && npm run dev" \
		"mkdir -p emulator-data && npx firebase emulators:start --import=emulator-data --export-on-exit=emulator-data" \
		"cd backend && FIREBASE_PROJECT_ID=$(PROJECT_ID) FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 uv run uvicorn app.main:app --reload --port 8000"

# Code verification and architectural boundary linting
check:
	@echo "Checking frontend linting..."
	cd frontend && npm run lint || true
	@echo "Checking backend linting and architectural boundaries..."
	cd backend && uv run ruff check .
	cd backend && uv run tach check

# Test suite execution
test:
	@echo "Running frontend engine tests..."
	cd frontend && npm test || true
	@echo "Running backend pytest..."
	cd backend && uv run pytest ../tests/backend/

# Clean up processes and reclaim ports
clean:
	@echo "Cleaning up local environment..."
	@pkill -INT -f 'firebase emulators:start' || true
	@pkill -f 'vite' || true
	@pkill -f 'uvicorn app.main:app' || true
	@echo "Ports reclaimed."

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
	@echo "Destroying Cloud Run service..."
	gcloud run services delete $(CLOUD_RUN_SERVICE) \
		--region $(CLOUD_RUN_REGION) \
		--project $(PROJECT_ID) \
		--quiet
	@echo "Disabling Firebase Hosting..."
	npx firebase hosting:disable --project $(PROJECT_ID) --force