#!/bin/sh

set -e

echo "Starting nginx-dynamic-sni-proxy..."

# Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL to be ready..."
until node -e "require('pg').Client.prototype.connect.call(new (require('pg').Client)({connectionString: process.env.DATABASE_URL})).then(() => process.exit(0)).catch(() => process.exit(1));" 2>/dev/null; do
  echo "PostgreSQL is unavailable - sleeping"
  sleep 2
done

echo "PostgreSQL is ready!"

# Run Prisma migrations
echo "Running Prisma migrations..."
cd /app
npx prisma migrate deploy || echo "Migrations already applied or not needed"

# Generate Prisma client
echo "Generating Prisma client..."
npx prisma generate

# Setup database triggers
echo "Setting up database triggers..."
PGPASSWORD=$(echo $DATABASE_URL | sed -n 's/.*:\/\/.*:\(.*\)@.*/\1/p') \
PGHOST=$(echo $DATABASE_URL | sed -n 's/.*@\([^:]*\).*/\1/p') \
PGPORT=$(echo $DATABASE_URL | sed -n 's/.*:\([0-9]*\)\/.*/\1/p') \
PGDATABASE=$(echo $DATABASE_URL | sed -n 's/.*\/\(.*\)/\1/p') \
PGUSER=$(echo $DATABASE_URL | sed -n 's/.*:\/\/\([^:]*\):.*/\1/p') \
psql -f /app/sql/setup-db-triggers.sql || echo "Triggers already exist or setup failed"

# Generate initial Nginx configuration
echo "Generating initial Nginx configuration..."
node /app/dist/generate-nginx-config.js || echo "Initial config generation failed, using default"

# Start the database watcher in the background
echo "Starting database change watcher..."
node /app/dist/watch-database-notify.js &
WATCHER_PID=$!

# Function to handle shutdown
shutdown() {
  echo "Shutting down gracefully..."
  kill -TERM $WATCHER_PID 2>/dev/null || true
  nginx -s quit 2>/dev/null || true
  wait $WATCHER_PID 2>/dev/null || true
  exit 0
}

# Trap signals for graceful shutdown
trap shutdown SIGTERM SIGINT

# Start Nginx in the foreground
echo "Starting Nginx..."
nginx -g 'daemon off;' &
NGINX_PID=$!

# Wait for processes
wait $NGINX_PID $WATCHER_PID
