#!/bin/bash

# Docker startup script for Fuel Sensor Monitoring Portal

set -e

echo "🚀 Starting Fuel Sensor Monitoring Portal with Docker..."

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    echo "Visit: https://docs.docker.com/get-docker/"
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    echo "Visit: https://docs.docker.com/compose/install/"
    exit 1
fi

# Create environment file if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating default environment file..."
    cp .env.example .env
    # Generate secure JWT secret
    JWT_SECRET=$(openssl rand -hex 32)
    sed -i "s/your-super-secret-jwt-key-change-in-production/$JWT_SECRET/" .env
    echo "✅ Environment file created with secure JWT secret"
fi

# Build and start services
echo "🔨 Building Docker images..."
docker-compose build --no-cache

echo "🔄 Starting services..."
docker-compose up -d

# Wait for services to be ready
echo "⏳ Waiting for services to start..."
sleep 10

# Check service health
echo "🔍 Checking service health..."
if docker-compose ps | grep -q "Up"; then
    echo "✅ Services are running!"
    echo ""
    echo "🌐 Application URLs:"
    echo "   Frontend: http://localhost"
    echo "   API:      http://localhost:5000"
    echo "   Health:   http://localhost:5000/api/health"
    echo ""
    echo "🔐 Default login credentials:"
    echo "   Username: admin"
    echo "   Password: secret"
    echo ""
    echo "🗄️  Database: Uses existing external SSH tunnel connection"
    echo "   Host: 41.191.232.15:5437"
    echo "   Database: sensorsdb"
    echo ""
    echo "📊 Monitor logs with: docker-compose logs -f"
    echo "🛑 Stop services with: docker-compose down"
else
    echo "❌ Some services failed to start. Check logs with: docker-compose logs"
    exit 1
fi