# Multi-stage build for nginx-dynamic-sni-proxy

# Stage 1: Build TypeScript application
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY prisma ./prisma
COPY src ./src

# Generate Prisma client
RUN npx prisma generate

# Build TypeScript
RUN npm run build

# Stage 2: Production image with Nginx
FROM nginx:alpine

# Install Node.js and PostgreSQL client
RUN apk add --no-cache \
    nodejs \
    npm \
    postgresql-client

WORKDIR /app

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy built application from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Copy Prisma schema
COPY prisma ./prisma

# Copy SQL scripts
COPY sql ./sql

# Copy entrypoint script
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Create directories for logs
RUN mkdir -p /var/log/nginx /var/run

# Environment variables
ENV NODE_ENV=production \
    NGINX_CONFIG_PATH=/etc/nginx/nginx.conf \
    LOG_LEVEL=info

# Expose ports
EXPOSE 443

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD nginx -t || exit 1

# Use custom entrypoint
ENTRYPOINT ["/docker-entrypoint.sh"]
