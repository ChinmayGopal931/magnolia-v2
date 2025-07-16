# Multi-stage Dockerfile for both development and production

# Base stage with common dependencies
FROM node:18-alpine AS base
WORKDIR /app
RUN apk add --no-cache python3 make g++ postgresql-client

# Dependencies stage
FROM base AS dependencies
COPY package*.json ./
RUN npm ci

# Development stage
FROM base AS development
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000 4983
CMD ["npm", "run", "dev"]

# Builder stage for production
FROM dependencies AS builder
COPY . .
RUN npm run build

# Production stage
FROM node:18-alpine AS production
WORKDIR /app
RUN apk add --no-cache postgresql-client && \
    addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy only necessary files
COPY --from=dependencies --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./
COPY --from=builder --chown=nodejs:nodejs /app/drizzle ./drizzle
COPY --from=builder --chown=nodejs:nodejs /app/docker/entrypoint.sh ./docker/entrypoint.sh

# Make entrypoint executable
RUN chmod +x ./docker/entrypoint.sh

# Switch to non-root user
USER nodejs

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

ENTRYPOINT ["./docker/entrypoint.sh"]
CMD ["node", "dist/index.js"]