.PHONY: dev build run deploy-gh-pages

dev:
	docker compose up frontend-dev --build

build:
	docker compose --profile production build frontend

run:
	docker compose --profile production up frontend -d

deploy-gh-pages:
	npm run build && \
	cp -r dist /tmp/escape-gh-pages 2>/dev/null || true; \
	cp -r dist/* /tmp/escape-gh-pages/ 2>/dev/null; \
	cp -r dist /tmp/escape-gh-pages 2>/dev/null; \
	git checkout gh-pages 2>/dev/null || git checkout --orphan gh-pages; \
	rm -rf *; \
	cp -r /tmp/escape-gh-pages/* .; \
	git add .; \
	git commit -m "deploy"; \
	git push origin gh-pages; \
	git checkout main
