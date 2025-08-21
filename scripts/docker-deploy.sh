#!/bin/bash
set -e

echo "🚀 Building and deploying Fuel Sensor Monitoring Portal with Docker..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Stop and remove existing containers
echo "📦 Stopping existing containers..."
docker compose down --remove-orphans

# Build and start the services
echo "🔨 Building and starting services..."
docker compose up -d --build

# Wait for services to be ready
echo "⏳ Waiting for services to start..."
sleep 10

# Check service status
echo "🔍 Checking service status..."
docker compose ps

# Show logs for debugging
echo "📋 Service logs (last 20 lines):"
docker compose logs --tail=20

echo "✅ Deployment complete!"
echo "🌐 Frontend: http://localhost"
echo "🔧 API: http://localhost:5000"
echo "📊 Health check: http://localhost:5000/api/health"

# Test the health endpoint
echo "🏥 Testing health endpoint..."
if curl -f http://localhost:5000/api/health > /dev/null 2>&1; then
    echo "✅ API is healthy!"
else
    echo "⚠️  API health check failed - check logs with: docker-compose logs api"
fi