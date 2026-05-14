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
	@printf "  $(GREEN)make dev$(RESET)       Start dev server (Vite + Express)\n"
	@printf "  $(GREEN)make build$(RESET)     Production build\n"
	@printf "  $(GREEN)make lint$(RESET)      Run ESLint\n"
	@printf "  $(GREEN)make commit$(RESET)    Interactive commit + optional push\n"
	@printf "  $(GREEN)make push$(RESET)      Push current branch to origin\n"
	@printf "  $(GREEN)make merge$(RESET)     Merge feature → develop → main\n"
	@printf "  $(GREEN)make secrets$(RESET)   View / edit .env (secrets masked)\n"
	@printf "  $(GREEN)make docker$(RESET)    Build & run Docker image locally\n\n"

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
	@set -e; \
	branch=$$(git branch --show-current); \
	printf "\n$(BOLD)Merge flow:$(RESET) $(CYAN)$$branch$(RESET) → develop → main\n\n"; \
	\
	if [ "$$branch" = "develop" ] || [ "$$branch" = "main" ]; then \
		printf "$(YELLOW)Run this from your feature branch, not from $$branch.$(RESET)\n\n"; exit 1; \
	fi; \
	\
	printf "$(DIM)Checking for uncommitted changes...$(RESET)\n"; \
	if ! git diff --quiet || ! git diff --cached --quiet; then \
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
	git checkout develop; \
	git pull origin develop; \
	git merge "$$branch" --no-ff -m "merge: $$branch → develop"; \
	git push origin develop; \
	printf "$(GREEN)  ✓ develop pushed$(RESET)\n\n"; \
	\
	printf "$(CYAN)→ main$(RESET)\n"; \
	git checkout main; \
	git pull origin main; \
	git merge develop --no-ff -m "merge: develop → main"; \
	git push origin main; \
	printf "$(GREEN)  ✓ main pushed$(RESET)\n\n"; \
	\
	git checkout "$$branch"; \
	git pull origin "$$branch" 2>/dev/null || true; \
	printf "$(GREEN)✓ Done — $$branch → develop → main all merged and pushed.$(RESET)\n\n"

# ── Secrets / .env ───────────────────────────────────────────────
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
