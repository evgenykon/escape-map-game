.PHONY: dev build run deploy-gh-pages typecheck

dev:
	docker compose up frontend-dev --build

typecheck:
	docker compose run --rm --entrypoint sh frontend-dev -c "npx vue-tsc --noEmit"

build:
	docker compose --profile production build frontend

run:
	docker compose --profile production up frontend -d

deploy-gh-pages:
	@docker compose run --rm -e NODE_ENV=production --entrypoint sh frontend-dev -c "GH_PAGES=1 npx vue-tsc --noEmit && GH_PAGES=1 npx vite build"
	@rm -rf .deploy-wt
	@git worktree add -B gh-pages .deploy-wt origin/gh-pages || git worktree add -B gh-pages .deploy-wt
	@find .deploy-wt -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
	@cp -r dist/* .deploy-wt/
	@cd .deploy-wt && git add -A && git -c user.email=deploy@local -c user.name=deploy commit -m "deploy"
	@cd .deploy-wt && git push origin gh-pages --force
	@git worktree remove .deploy-wt --force
