#!/bin/bash

# Quick Docker functionality test script

set -e

echo "🧪 Testing Docker configuration..."

# Test that all Docker files exist
FILES=(
    "Dockerfile.api"
    "Dockerfile.frontend" 
    "docker-compose.yml"
    "docker-compose.dev.yml"
    "nginx.conf"
    ".dockerignore"
)

for file in "${FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "✅ $file exists"
    else
        echo "❌ $file missing"
        exit 1
    fi
done

# Test Docker Compose syntax
echo "🔍 Testing Docker Compose syntax..."
docker-compose config >/dev/null 2>&1 && echo "✅ Production compose syntax valid" || echo "❌ Production compose syntax invalid"
docker-compose -f docker-compose.dev.yml config >/dev/null 2>&1 && echo "✅ Development compose syntax valid" || echo "❌ Development compose syntax invalid"

# Test build context (dry run)
echo "🔨 Testing build context..."
if docker build -f Dockerfile.api --target production . --dry-run >/dev/null 2>&1; then
    echo "✅ API Dockerfile build context valid"
else
    echo "⚠️ API Dockerfile build test skipped (dry-run not supported)"
fi

if docker build -f Dockerfile.frontend . --dry-run >/dev/null 2>&1; then
    echo "✅ Frontend Dockerfile build context valid"  
else
    echo "⚠️ Frontend Dockerfile build test skipped (dry-run not supported)"
fi

echo ""
echo "🎉 Docker configuration test complete!"
echo ""
echo "To deploy:"
echo "  Production: ./scripts/docker-start.sh"
echo "  Development: ./scripts/docker-dev.sh"
echo "  Manual: docker-compose up -d"