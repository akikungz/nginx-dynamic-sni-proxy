FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma

# Install dependencies and generate Prisma client
RUN npm ci && npx prisma generate

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Production image with HAProxy
FROM node:20-alpine

# Install HAProxy and OpenSSL
RUN apk add --no-cache haproxy openssl

WORKDIR /app

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./

# Create necessary directories
RUN mkdir -p /var/log/haproxy /etc/haproxy /run/haproxy

# Copy entrypoint script
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Expose ports
EXPOSE 80 443 8404

# Set entrypoint
ENTRYPOINT ["/docker-entrypoint.sh"]
