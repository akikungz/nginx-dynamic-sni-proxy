.PHONY: help install build dev start stop logs clean test docker-build docker-up docker-down migrate

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-20s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## Install dependencies
	npm install
	npx prisma generate

build: ## Build TypeScript
	npm run build

dev: ## Run in development mode
	npm run dev

generate-config: ## Generate HAProxy configuration
	npm run generate-haproxy-config

start: ## Start services (Docker)
	docker-compose up -d

stop: ## Stop services (Docker)
	docker-compose down

logs: ## View logs (Docker)
	docker-compose logs -f haproxy-dynamic-proxy

clean: ## Clean build artifacts
	rm -rf dist/
	rm -rf node_modules/
	rm -f haproxy.cfg.backup.*

test-https: ## Test HTTPS connection
	@echo "Testing HTTPS..."
	curl -v https://app1.yourdomain.com

test-stats: ## Test HAProxy stats page
	@echo "Testing HAProxy stats..."
	curl -u admin:changeme http://localhost:8404/stats

docker-build: ## Build Docker image
	docker-compose build

docker-up: ## Start Docker services
	docker-compose up -d
	@echo "Waiting for services to be ready..."
	sleep 5
	docker-compose logs

docker-down: ## Stop Docker services
	docker-compose down

docker-logs: ## View Docker logs
	docker-compose logs -f

migrate: ## Run database migrations
	npx prisma migrate deploy

migrate-dev: ## Run database migrations (dev)
	npx prisma migrate dev

studio: ## Open Prisma Studio
	npx prisma studio

setup-triggers: ## Setup database triggers
	psql $$DATABASE_URL < sql/setup-db-triggers.sql

init: install migrate-dev setup-triggers generate-config ## Initialize project
	@echo "Project initialized successfully!"
	@echo "Run 'make start' to start services"
