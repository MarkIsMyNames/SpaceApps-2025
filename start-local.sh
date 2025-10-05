#!/bin/bash
# Local development startup script

echo "🚀 Starting Space Apps Tile Viewer locally..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Build and start containers
echo "📦 Building Docker images..."
docker-compose build

echo "🏃 Starting containers..."
docker-compose up -d

# Wait for services to be ready
echo "⏳ Waiting for services to start..."
sleep 5

# Check health
echo "🔍 Checking service health..."
if curl -f http://localhost:5000/api/tiles/meta > /dev/null 2>&1; then
    echo "✅ Backend is healthy"
else
    echo "⚠️  Backend might not be ready yet"
fi

if curl -f http://localhost/ > /dev/null 2>&1; then
    echo "✅ Frontend is healthy"
else
    echo "⚠️  Frontend might not be ready yet"
fi

echo ""
echo "✨ Application is running!"
echo "   Frontend: http://localhost"
echo "   Backend API: http://localhost:5000/api/tiles/meta"
echo ""
echo "To view logs: docker-compose logs -f"
echo "To stop: docker-compose down"

