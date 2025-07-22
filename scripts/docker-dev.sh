#!/bin/bash

# Docker development startup script

set -e

echo "🛠️  Starting Fuel Sensor Monitoring Portal in development mode..."

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

# Build and start development services
echo "🔨 Building development images..."
docker-compose -f docker-compose.dev.yml build

echo "🔄 Starting development services..."
docker-compose -f docker-compose.dev.yml up -d

echo "⏳ Waiting for services to start..."
sleep 10

# Check service health
echo "🔍 Checking service health..."
if docker-compose -f docker-compose.dev.yml ps | grep -q "Up"; then
    echo "✅ Development services are running!"
    echo ""
    echo "🌐 Development URLs:"
    echo "   API:      http://localhost:5000"
    echo "   Health:   http://localhost:5000/api/health"
    echo ""
    echo "🗄️  Database: Uses existing external SSH tunnel connection"
    echo "   Host: 41.191.232.15:5437"
    echo "   Database: sensorsdb"
    echo ""
    echo "📊 Monitor logs with: docker-compose -f docker-compose.dev.yml logs -f"
    echo "🛑 Stop services with: docker-compose -f docker-compose.dev.yml down"
else
    echo "❌ Some services failed to start. Check logs."
    exit 1
fi