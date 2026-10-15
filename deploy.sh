#!/usr/bin/env bash
set -e

echo "=========================================================="
echo "🚀 GOD'S EYE - Manual VM Deployment Script"
echo "=========================================================="

# Ensure .env exists with HOST_PORT defined
if [ ! -f .env ]; then
  echo "⚠️ .env not found, creating from .env.example..."
  cp .env.example .env
fi

if ! grep -q "^HOST_PORT=" .env; then
  echo "HOST_PORT=8081" >> .env
fi

EXISTING_SF_CLIENT_ID=$(grep -E "^SF_CLIENT_ID=" .env 2>/dev/null | cut -d '=' -f2- | tr -d ' "\r\n')
if [ -z "$EXISTING_SF_CLIENT_ID" ]; then
  echo "⚠️ WARNING: SF_CLIENT_ID is not set in .env! Live Salesforce cases cannot be retrieved without credentials."
else
  echo "✅ SF_CLIENT_ID configured in .env."
fi

HOST_PORT=$(grep -E "^HOST_PORT=" .env | cut -d '=' -f2 | tr -d ' "\r\n')
HOST_PORT=${HOST_PORT:-8081}
echo "📍 Configured Host Port: $HOST_PORT"

echo "📥 Pulling latest changes from Git..."
git fetch origin main
git reset --hard origin/main

echo "🛑 Stopping running containers..."
docker compose down --remove-orphans 2>/dev/null || docker-compose down 2>/dev/null || true

echo "🔨 Building Docker images..."
docker compose build --network host || docker compose build || docker-compose build

echo "▶️ Starting Docker stack..."
docker compose up -d --remove-orphans || docker-compose up -d

echo "🩺 Verifying health on http://127.0.0.1:${HOST_PORT}/health..."
HEALTHY=0
for i in $(seq 1 30); do
  if curl -sf --connect-timeout 3 --max-time 5 "http://127.0.0.1:${HOST_PORT}/health"; then
    echo -e "\n✅ Health check succeeded! GOD'S EYE is live at http://localhost:${HOST_PORT}"
    HEALTHY=1
    break
  fi
  echo "Waiting for health check... ($i/30)"
  sleep 2
done

if [ "$HEALTHY" -ne 1 ]; then
  echo "❌ Health check failed after 60s"
  docker compose logs --tail=100
  exit 1
fi

echo "=========================================================="
echo "🔍 Live Application & Salesforce Connectivity Diagnostic:"
echo "=========================================================="
curl -s "http://127.0.0.1:${HOST_PORT}/api/health?test=true" || true
echo ""

echo "=========================================================="
echo "✅ Active Containers:"
echo "=========================================================="
docker ps --filter "name=gods-eye"
