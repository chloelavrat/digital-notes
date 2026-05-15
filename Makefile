SHELL := /bin/bash
.PHONY: help dev build commit push merge secrets docker lint

# ── Colors ───────────────────────────────────────────────────────
CYAN   := \033[0;36m
GREEN  := \033[0;32m
YELLOW := \033[0;33m
RED    := \033[0;31m
BOLD   := \033[1m
DIM    := \033[2m
RESET  := \033[0m

# ── Help ─────────────────────────────────────────────────────────
help:
	@printf "\n$(BOLD)$(CYAN)Digital Notes$(RESET) — make commands\n\n"
	@printf "  $(GREEN)make dev$(RESET)            Start dev server (Vite + Express)\n"
	@printf "  $(GREEN)make build$(RESET)          Production build\n"
	@printf "  $(GREEN)make lint$(RESET)           Run ESLint\n"
	@printf "  $(GREEN)make local-up$(RESET)       Start local stack (Postgres + GCS emulator)\n"
	@printf "  $(GREEN)make local-down$(RESET)     Stop local stack\n"
	@printf "  $(GREEN)make local-reset$(RESET)    Wipe local stack and restart fresh\n"
	@printf "  $(GREEN)make db-shell$(RESET)       Open psql in the local Postgres container\n"
	@printf "  $(GREEN)make db-promote$(RESET)     Grant admin access to a user (EMAIL=...)\n"
	@printf "  $(GREEN)make commit$(RESET)         Interactive commit + optional push\n"
	@printf "  $(GREEN)make push$(RESET)           Push current branch to origin\n"
	@printf "  $(GREEN)make merge$(RESET)          Merge feature → develop → main\n"
	@printf "  $(GREEN)make secrets$(RESET)        View / edit .env (secrets masked)\n"
	@printf "  $(GREEN)make gcp-secrets$(RESET)    Push .env secrets to GCP Secret Manager\n"
	@printf "  $(GREEN)make docker$(RESET)         Build & run Docker image locally\n\n"

# ── Local dev stack ──────────────────────────────────────────────────
local-up:
	@printf "$(CYAN)Starting local stack...$(RESET)\n"
	@cd local-dev && docker compose up -d
	@printf "$(GREEN)✓ PostgreSQL$(RESET)  postgresql://admin:dev_password@localhost:5432/digital_notes\n"
	@printf "$(GREEN)✓ GCS emulator$(RESET) http://localhost:4443\n"
	@printf "$(DIM)Run 'make dev' to start the app server$(RESET)\n\n"

local-down:
	cd local-dev && docker compose down

local-reset:
	@read -p "This wipes all local data. Continue? [y/N] " c; \
	[ "$$c" = "y" ] || [ "$$c" = "Y" ] || exit 0; \
	cd local-dev && docker compose down -v && docker compose up -d && \
	printf "$(GREEN)✓ Local stack reset$(RESET)\n"

db-shell:
	@docker exec -it $$(docker compose -f local-dev/docker-compose.yml ps -q postgres 2>/dev/null) \
		psql -U admin -d digital_notes

db-promote:
	@if [ -z "$(EMAIL)" ]; then printf "$(RED)Usage: make db-promote EMAIL=you@example.com$(RESET)\n"; exit 1; fi
	@docker exec -i $$(docker compose -f local-dev/docker-compose.yml ps -q postgres 2>/dev/null) \
		psql -U admin -d digital_notes -c \
		"UPDATE users SET access = access || '{\"admin\":true,\"digital_notes\":true}'::jsonb WHERE email = '$(EMAIL)'; SELECT email, access FROM users WHERE email = '$(EMAIL)';"

# ── Dev ──────────────────────────────────────────────────────────
dev:
	npm run dev

build:
	npm run build

lint:
	npm run lint

# ── Docker ───────────────────────────────────────────────────────
docker:
	@read -p "Image tag [digital-notes]: " tag; tag=$${tag:-digital-notes}; \
	echo ""; \
	docker build -t $$tag . || exit 1; \
	echo ""; \
	read -p "Run on http://localhost:8080? [Y/n] " run; \
	if [ "$$run" != "n" ] && [ "$$run" != "N" ]; then \
		echo "$(DIM)Ctrl+C to stop$(RESET)"; \
		docker run --rm -p 8080:8080 \
			$$([ -f .env ] && echo "--env-file .env") \
			-e PORT=8080 \
			$$tag; \
	fi

# ── Push ─────────────────────────────────────────────────────────
push:
	@branch=$$(git branch --show-current); \
	printf "Pushing $(CYAN)$$branch$(RESET) → origin... "; \
	git push origin $$branch && printf "$(GREEN)✓$(RESET)\n"

# ── Interactive commit ────────────────────────────────────────────
commit:
	@branch=$$(git branch --show-current); \
	printf "\n$(BOLD)Branch:$(RESET) $(CYAN)$$branch$(RESET)\n\n"; \
	git status --short; \
	printf "\n"; \
	\
	unstaged=$$(git status --porcelain | grep -cE "^.[^ ]" || true); \
	if [ "$$unstaged" -gt 0 ]; then \
		read -p "Stage all changes? [Y/n] " stage; \
		if [ "$$stage" != "n" ] && [ "$$stage" != "N" ]; then \
			git add -A; \
			printf "$(GREEN)✓ All changes staged$(RESET)\n\n"; \
			git status --short; \
			printf "\n"; \
		fi; \
	fi; \
	\
	staged=$$(git diff --cached --name-only | wc -l | tr -d ' '); \
	if [ "$$staged" -eq 0 ]; then \
		printf "$(YELLOW)Nothing staged to commit.$(RESET)\n\n"; exit 0; \
	fi; \
	\
	printf "$(DIM)Staged files: $$staged$(RESET)\n\n"; \
	read -p "Commit message: " msg; \
	if [ -z "$$msg" ]; then \
		printf "$(RED)Aborted — empty message.$(RESET)\n"; exit 1; \
	fi; \
	git commit -m "$$msg"; \
	printf "\n"; \
	read -p "Push to origin/$$branch? [Y/n] " push; \
	if [ "$$push" != "n" ] && [ "$$push" != "N" ]; then \
		git push origin $$branch && printf "$(GREEN)✓ Pushed.$(RESET)\n"; \
	fi; \
	printf "\n"

# ── Merge feature → develop → main ───────────────────────────────
merge:
	@branch=$$(git branch --show-current); \
	printf "\n$(BOLD)Merge flow:$(RESET) $(CYAN)$$branch$(RESET) → develop → main\n\n"; \
	\
	if [ "$$branch" = "develop" ] || [ "$$branch" = "main" ]; then \
		printf "$(YELLOW)Run this from your feature branch, not from $$branch.$(RESET)\n\n"; exit 1; \
	fi; \
	\
	printf "$(DIM)Checking for uncommitted changes...$(RESET)\n"; \
	dirty=$$(git status --porcelain | grep -v "^??" | wc -l | tr -d ' '); \
	if [ "$$dirty" -gt 0 ]; then \
		printf "$(YELLOW)You have uncommitted changes. Commit or stash first.$(RESET)\n\n"; exit 1; \
	fi; \
	\
	read -p "Merge $(CYAN)$$branch$(RESET) → develop → main and push all? [y/N] " ok; \
	if [ "$$ok" != "y" ] && [ "$$ok" != "Y" ]; then \
		printf "$(YELLOW)Aborted.$(RESET)\n\n"; exit 0; \
	fi; \
	printf "\n"; \
	\
	printf "$(CYAN)→ develop$(RESET)\n"; \
	git checkout develop || exit 1; \
	git pull origin develop || exit 1; \
	git merge "$$branch" --no-ff -m "merge: $$branch → develop" || exit 1; \
	git push origin develop || exit 1; \
	printf "$(GREEN)  ✓ develop pushed$(RESET)\n\n"; \
	\
	printf "$(CYAN)→ main$(RESET)\n"; \
	git checkout main || exit 1; \
	git pull origin main || exit 1; \
	git merge develop --no-ff -m "merge: develop → main" || exit 1; \
	git push origin main || exit 1; \
	printf "$(GREEN)  ✓ main pushed$(RESET)\n\n"; \
	\
	git checkout "$$branch"; \
	git pull origin "$$branch" 2>/dev/null || true; \
	printf "$(GREEN)✓ Done — $$branch → develop → main all merged and pushed.$(RESET)\n\n"

# ── GCP Secret Manager ───────────────────────────────────────────
# Reads sensitive keys from .env and creates/updates them in Secret Manager.
# Run once before first deploy, then again whenever you change a secret value.
gcp-secrets:
	@if [ ! -f .env ]; then \
		printf "$(RED).env not found. Copy .env.example → .env and fill in values first.$(RESET)\n\n"; exit 1; \
	fi; \
	command -v gcloud >/dev/null 2>&1 || { printf "$(RED)gcloud CLI not found. Install it first.$(RESET)\n\n"; exit 1; }; \
	project=$$(gcloud config get-value project 2>/dev/null); \
	printf "\n$(BOLD)$(CYAN)GCP Secret Manager$(RESET) — project: $(CYAN)$$project$(RESET)\n\n"; \
	while IFS='=' read -r key val; do \
		[ -z "$$key" ] && continue; \
		echo "$$key" | grep -q "^#" && continue; \
		[ -z "$$val" ] && continue; \
		if echo "$$key" | grep -qiE "secret|password|key|token"; then \
			printf "  $(YELLOW)%-22s$(RESET) → Secret Manager... " "$$key"; \
			if gcloud secrets describe "$$key" --project="$$project" >/dev/null 2>&1; then \
				echo -n "$$val" | gcloud secrets versions add "$$key" --data-file=- --project="$$project" >/dev/null 2>&1 && \
				printf "$(GREEN)updated$(RESET)\n" || printf "$(RED)failed$(RESET)\n"; \
			else \
				echo -n "$$val" | gcloud secrets create "$$key" --data-file=- --project="$$project" >/dev/null 2>&1 && \
				printf "$(GREEN)created$(RESET)\n" || printf "$(RED)failed$(RESET)\n"; \
			fi; \
		fi; \
	done < .env; \
	printf "\n$(DIM)Granting Cloud Run service account access to secrets...$(RESET)\n"; \
	project_num=$$(gcloud projects describe "$$project" --format='value(projectNumber)' 2>/dev/null); \
	sa="$$project_num-compute@developer.gserviceaccount.com"; \
	for secret in ANTHROPIC_API_KEY AUTH_SECRET AUTH_USERS; do \
		gcloud secrets describe "$$secret" --project="$$project" >/dev/null 2>&1 || continue; \
		gcloud secrets add-iam-policy-binding "$$secret" \
			--member="serviceAccount:$$sa" \
			--role="roles/secretmanager.secretAccessor" \
			--project="$$project" >/dev/null 2>&1 && \
		printf "  $(GREEN)✓$(RESET) $$sa → $$secret\n" || \
		printf "  $(YELLOW)⚠$(RESET) Could not bind $$secret (may already exist)\n"; \
	done; \
	printf "\n$(GREEN)✓ Done. Run 'make merge' to trigger a deploy.$(RESET)\n\n"

# ── Local .env ───────────────────────────────────────────────────
secrets:
	@if [ ! -f .env ]; then \
		printf "$(YELLOW).env not found — creating from .env.example$(RESET)\n"; \
		cp .env.example .env; \
	fi; \
	printf "\n$(BOLD)$(CYAN).env$(RESET)\n\n"; \
	while IFS= read -r line || [ -n "$$line" ]; do \
		[ -z "$$line" ] && printf "\n" && continue; \
		echo "$$line" | grep -q "^#" && printf "$(DIM)  $$line$(RESET)\n" && continue; \
		key=$$(echo "$$line" | cut -d= -f1); \
		val=$$(echo "$$line" | cut -d= -f2-); \
		if echo "$$key" | grep -qiE "secret|password|key|token"; then \
			printf "  $(YELLOW)%-22s$(RESET) $(DIM)****$(RESET)\n" "$$key"; \
		else \
			printf "  $(YELLOW)%-22s$(RESET) $$val\n" "$$key"; \
		fi; \
	done < .env; \
	printf "\n"; \
	printf "$(DIM)Sensitive keys (SECRET, PASSWORD, KEY, TOKEN) are masked above.$(RESET)\n\n"; \
	read -p "Edit .env? [y/N] " edit; \
	if [ "$$edit" = "y" ] || [ "$$edit" = "Y" ]; then \
		$${EDITOR:-nano} .env; \
		printf "$(GREEN)✓ Saved.$(RESET)\n"; \
	fi; \
	printf "\n"
