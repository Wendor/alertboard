CONFIG ?= config.yaml
ENV_FILE ?= .env

.PHONY: build web server test run dev docker

build: web server

web:
	cd web && npm ci && npm run build

server:
	cd server && npm ci && npm run build

test:
	cd server && npx vitest run
	cd web && npx vitest run

run: build
	node server/dist/main.js --config $(CONFIG) --env $(ENV_FILE)

# backend restarts on server/src changes, vite proxies /api to the backend address
dev:
	cd server && npm run build
	trap 'kill $$(jobs -p) 2>/dev/null' EXIT; \
	(cd server && npx tsc -p tsconfig.build.json --watch --preserveWatchOutput > /dev/null) & \
	node --watch server/dist/main.js --config $(CONFIG) --env $(ENV_FILE) & \
	cd web && ALERTBOARD_CONFIG=$(abspath $(CONFIG)) ALERTBOARD_ENV=$(abspath $(ENV_FILE)) npm run dev

docker:
	docker build -t alertboard .
