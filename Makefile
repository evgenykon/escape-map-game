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
	docker compose run --rm -e NODE_ENV=production --entrypoint sh frontend-dev -c "GH_PAGES=1 npx vue-tsc --noEmit && GH_PAGES=1 npx vite build" && \
	rm -rf /tmp/escape-gh-pages && cp -r dist /tmp/escape-gh-pages && \
	git worktree add -B gh-pages /tmp/escape-gh-worktree origin/gh-pages 2>/dev/null || git worktree add -B gh-pages /tmp/escape-gh-worktree && \
	rm -rf /tmp/escape-gh-worktree/* && cp -r /tmp/escape-gh-pages/* /tmp/escape-gh-worktree/ && \
	cd /tmp/escape-gh-worktree && git add . && git -c user.email=deploy@local -c user.name=deploy commit -m "deploy" && \
	cd /tmp/escape-gh-worktree && git push origin gh-pages --force && \
	git worktree remove /tmp/escape-gh-worktree --force
