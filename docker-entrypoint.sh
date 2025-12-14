#!/bin/sh
set -e

echo "🚀 Starting HAProxy Dynamic Multi-Protocol Proxy..."

# Wait for database to be ready
echo "⏳ Waiting for database..."
sleep 5

echo "📝 Generating initial HAProxy configuration..."
node dist/generate-haproxy-config.js

echo "🌐 Starting HAProxy..."
haproxy -f /etc/haproxy/haproxy.cfg -D -p /run/haproxy.pid

echo "🔍 Starting database watcher..."
node dist/watch-database-notify.js &
WATCHER_PID=$!

# Trap signals for graceful shutdown
trap "echo '⏹️  Shutting down...'; kill $WATCHER_PID 2>/dev/null || true; haproxy -sf \$(cat /run/haproxy.pid) 2>/dev/null || true; wait; exit 0" SIGTERM SIGINT

# Wait for watcher process
wait $WATCHER_PID
