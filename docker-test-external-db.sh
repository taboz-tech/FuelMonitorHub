#!/bin/bash

# Test Docker configuration with external database

set -e

echo "🧪 Testing Docker configuration with external database..."

# Check that environment file exists
if [ ! -f .env.example ]; then
    echo "❌ .env.example file missing"
    exit 1
else
    echo "✅ .env.example exists"
fi

# Check Docker files
FILES=("Dockerfile.api" "Dockerfile.frontend" "docker-compose.yml" "nginx.conf")

for file in "${FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "✅ $file exists"
    else
        echo "❌ $file missing"
        exit 1
    fi
done

# Check that database service is removed from compose files
if grep -q "database:" docker-compose.yml; then
    echo "❌ Database service still exists in docker-compose.yml"
    exit 1
else
    echo "✅ Database service removed from production compose"
fi

if grep -q "database:" docker-compose.dev.yml; then
    echo "❌ Database service still exists in docker-compose.dev.yml"
    exit 1
else
    echo "✅ Database service removed from development compose"
fi

# Check external database configuration
if grep -q "SSH_HOST.*41.191.232.15" docker-compose.yml; then
    echo "✅ SSH host configured in production compose"
else
    echo "❌ SSH host not configured in production compose"
    exit 1
fi

if grep -q "DB_NAME.*sensorsdb" docker-compose.yml; then
    echo "✅ Database name configured in production compose"
else
    echo "❌ Database name not configured in production compose"
    exit 1
fi

echo ""
echo "🎉 Docker configuration test passed!"
echo ""
echo "Key changes made:"
echo "✓ Removed containerized PostgreSQL database"  
echo "✓ Added SSH tunnel configuration for external database"
echo "✓ Updated environment variables for sensorsdb"
echo "✓ Configured connection to 41.191.232.15:5437"
echo "✓ Updated documentation and scripts"
echo ""
echo "To deploy with your external database:"
echo "  ./scripts/docker-start.sh"
echo ""
echo "The system will connect to your existing database at:"
echo "  Host: 41.191.232.15"
echo "  Port: 5437 (via SSH tunnel)"
echo "  Database: sensorsdb"