# PowerShell script for Windows local development

Write-Host "🚀 Starting Space Apps Tile Viewer locally..." -ForegroundColor Green

# Check if Docker is running
try {
    docker info | Out-Null
} catch {
    Write-Host "❌ Docker is not running. Please start Docker first." -ForegroundColor Red
    exit 1
}

# Build and start containers
Write-Host "📦 Building Docker images..." -ForegroundColor Yellow
docker-compose build

Write-Host "🏃 Starting containers..." -ForegroundColor Yellow
docker-compose up -d

# Wait for services to be ready
Write-Host "⏳ Waiting for services to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# Check health
Write-Host "🔍 Checking service health..." -ForegroundColor Yellow

try {
    $response = Invoke-WebRequest -Uri "http://localhost:5000/api/tiles/meta" -TimeoutSec 2 -UseBasicParsing
    Write-Host "✅ Backend is healthy" -ForegroundColor Green
} catch {
    Write-Host "⚠️  Backend might not be ready yet" -ForegroundColor Yellow
}

try {
    $response = Invoke-WebRequest -Uri "http://localhost/" -TimeoutSec 2 -UseBasicParsing
    Write-Host "✅ Frontend is healthy" -ForegroundColor Green
} catch {
    Write-Host "⚠️  Frontend might not be ready yet" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "✨ Application is running!" -ForegroundColor Green
Write-Host "   Frontend: http://localhost"
Write-Host "   Backend API: http://localhost:5000/api/tiles/meta"
Write-Host ""
Write-Host "To view logs: docker-compose logs -f"
Write-Host "To stop: docker-compose down"

