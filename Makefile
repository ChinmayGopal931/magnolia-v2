# Magnolia V2 Makefile for Docker operations

.PHONY: help dev prod up down logs shell db-shell clean build migrate

# Default target
help:
	@echo "Magnolia V2 - Docker Commands"
	@echo "=============================="
	@echo "Development:"
	@echo "  make dev          - Start development environment"
	@echo "  make up           - Start services in background"
	@echo "  make down         - Stop all services"
	@echo "  make logs         - View application logs"
	@echo "  make shell        - Open shell in app container"
	@echo "  make db-shell     - Open PostgreSQL shell"
	@echo "  make studio       - Open Drizzle Studio"
	@echo ""
	@echo "Production:"
	@echo "  make prod         - Start production environment"
	@echo "  make build        - Build production images"
	@echo ""
	@echo "Database:"
	@echo "  make migrate      - Run database migrations"
	@echo "  make db-backup    - Create database backup"
	@echo "  make db-restore   - Restore database from backup"
	@echo ""
	@echo "Maintenance:"
	@echo "  make clean        - Remove containers and volumes"
	@echo "  make prune        - Remove all unused Docker resources"

# Development commands
dev:
	@echo "Starting development environment..."
	@cp -n .env.docker .env 2>/dev/null || true
	docker-compose up

up:
	@echo "Starting services in background..."
	@cp -n .env.docker .env 2>/dev/null || true
	docker-compose up -d

down:
	@echo "Stopping all services..."
	docker-compose down

logs:
	docker-compose logs -f app

shell:
	docker-compose exec app sh

db-shell:
	docker-compose exec postgres psql -U magnolia_user -d magnolia_v2

studio:
	@echo "Starting Drizzle Studio..."
	docker-compose --profile tools up drizzle-studio

# Production commands
prod:
	@echo "Starting production environment..."
	@if [ ! -f .env ]; then echo "Error: .env file not found. Copy .env.prod.example to .env"; exit 1; fi
	docker-compose -f docker-compose.prod.yml up -d

build:
	@echo "Building production images..."
	docker-compose -f docker-compose.prod.yml build

prod-logs:
	docker-compose -f docker-compose.prod.yml logs -f app

# Database commands
migrate:
	@echo "Running database migrations..."
	docker-compose exec app npm run db:migrate

db-backup:
	@echo "Creating database backup..."
	@TIMESTAMP=$$(date +%Y%m%d_%H%M%S); \
	docker-compose exec postgres pg_dump -U magnolia_user -d magnolia_v2 | gzip > backups/backup_$$TIMESTAMP.sql.gz; \
	echo "Backup created: backups/backup_$$TIMESTAMP.sql.gz"

db-restore:
	@echo "Available backups:"
	@ls -1 backups/*.sql.gz 2>/dev/null || echo "No backups found"
	@echo ""
	@echo "To restore: make db-restore-file FILE=backups/backup_TIMESTAMP.sql.gz"

db-restore-file:
	@if [ -z "$(FILE)" ]; then echo "Error: FILE parameter required"; exit 1; fi
	@echo "Restoring from $(FILE)..."
	@gunzip < $(FILE) | docker-compose exec -T postgres psql -U magnolia_user -d magnolia_v2

# Maintenance commands
clean:
	@echo "Removing containers and volumes..."
	docker-compose down -v
	docker-compose -f docker-compose.prod.yml down -v

prune:
	@echo "Removing unused Docker resources..."
	docker system prune -af --volumes

# Development shortcuts
restart: down up

rebuild:
	docker-compose up --build

status:
	@echo "Service Status:"
	@docker-compose ps