# Docker Deployment Guide

This project includes complete Docker support for local development and Azure cloud deployment.

## Quick Start - Local Development

### Option 1: Using Scripts (Easiest)

**Windows (PowerShell):**
```powershell
.\start-local.ps1
```

**Linux/Mac:**
```bash
chmod +x start-local.sh
./start-local.sh
```

### Option 2: Manual Docker Compose

```bash
# Build and start
docker-compose up --build

# Or run in background
docker-compose up -d --build

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

Access the application:
- **Frontend**: http://localhost
- **Backend API**: http://localhost:5000/api/tiles/meta

## Project Structure

```
SpaceApps-2025-1/
├── backend/
│   ├── Dockerfile              # Backend container definition
│   ├── requirements.txt        # Python dependencies
│   ├── .dockerignore          # Files to exclude from backend image
│   ├── app.py                 # Flask application
│   ├── images/                # High-res tile images
│   └── image_previews/        # Low-res preview tiles
├── frontend/
│   ├── Dockerfile             # Frontend container definition (multi-stage)
│   ├── nginx.conf             # Nginx configuration for serving frontend
│   ├── .dockerignore          # Files to exclude from frontend image
│   └── src/                   # React/TypeScript source
├── docker-compose.yml         # Local development compose file
├── docker-compose.azure.yml   # Azure-specific overrides
└── DEPLOYMENT.md              # Detailed Azure deployment guide
```

## Architecture

### Backend Container
- **Base**: Python 3.9 slim
- **Port**: 5000
- **Framework**: Flask with CORS
- **Image Processing**: Pillow for tile serving
- **Health Check**: `/api/tiles/meta` endpoint
- **Volumes**: Mounts `images/` and `image_previews/` directories

### Frontend Container
- **Build Stage**: Node 18 Alpine (builds React app)
- **Runtime Stage**: Nginx Alpine (serves static files)
- **Port**: 80
- **Features**: 
  - Gzip compression
  - Static asset caching
  - API proxy to backend
  - SPA fallback routing

## Local Development

### Prerequisites
- Docker Desktop installed and running
- Git
- 8GB+ RAM available for Docker
- Tile data in `backend/images/` and `backend/image_previews/`

### Build Individual Images

```bash
# Build backend only
docker build -t spaceapps-backend ./backend

# Build frontend only  
docker build -t spaceapps-frontend ./frontend

# Test backend
docker run -p 5000:5000 -v $(pwd)/backend/images:/app/images -v $(pwd)/backend/image_previews:/app/image_previews spaceapps-backend

# Test frontend
docker run -p 8080:80 spaceapps-frontend
```

### Troubleshooting

#### Backend won't start
```bash
# Check logs
docker-compose logs backend

# Common issues:
# - Missing tile directories: ensure images/ and image_previews/ exist
# - Port 5000 in use: change port mapping in docker-compose.yml
```

#### Frontend can't reach backend
```bash
# Check if backend is running
curl http://localhost:5000/api/tiles/meta

# Check nginx logs
docker-compose logs frontend

# Verify nginx.conf proxy settings are correct
```

#### Out of memory
```bash
# Increase Docker memory allocation in Docker Desktop settings
# Or reduce the number of tiles loaded
```

## Azure Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for complete Azure deployment instructions.

### Quick Azure Deploy

1. **Install Azure CLI** and login:
```bash
az login
```

2. **Run deployment script**:
```bash
chmod +x deploy-azure.sh
./deploy-azure.sh
```

3. **Follow instructions** in DEPLOYMENT.md for:
   - Uploading tile data to Azure File Share
   - Deploying containers to Azure Container Instances or Container Apps
   - Setting up monitoring and scaling

## Environment Variables

### Backend
- `FLASK_ENV`: `development` or `production` (default: production in Docker)
- `PYTHONUNBUFFERED`: Set to `1` for real-time log output

### Frontend
- Configured through `nginx.conf`
- API proxy automatically routes `/api/*` to backend

## Volume Mounts

The `docker-compose.yml` mounts tile directories as read-only:

```yaml
volumes:
  - ./backend/images:/app/images:ro
  - ./backend/image_previews:/app/image_previews:ro
```

This allows you to update tiles without rebuilding the container.

## Image Sizes

Approximate sizes:
- **Backend image**: ~200-300 MB (without tiles)
- **Frontend image**: ~25-30 MB (nginx + built app)
- **Tile data**: ~500 MB - 2 GB (depending on your dataset)

## Performance Optimization

### Docker Build Cache
```bash
# Use build cache for faster rebuilds
docker-compose build --parallel

# Force rebuild without cache
docker-compose build --no-cache
```

### Multi-Platform Builds (for ARM/M1 Macs)
```bash
docker buildx build --platform linux/amd64,linux/arm64 -t spaceapps-backend ./backend
```

### Production Optimization
- Frontend image uses multi-stage build to minimize size
- Nginx configured with gzip compression
- Static assets cached for 1 year
- API responses cached where appropriate

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Build and Push to ACR

on:
  push:
    branches: [ main ]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      
      - name: Login to ACR
        uses: docker/login-action@v1
        with:
          registry: ${{ secrets.ACR_LOGIN_SERVER }}
          username: ${{ secrets.ACR_USERNAME }}
          password: ${{ secrets.ACR_PASSWORD }}
      
      - name: Build and push backend
        run: |
          docker build -t ${{ secrets.ACR_LOGIN_SERVER }}/spaceapps-backend:${{ github.sha }} ./backend
          docker push ${{ secrets.ACR_LOGIN_SERVER }}/spaceapps-backend:${{ github.sha }}
      
      - name: Build and push frontend
        run: |
          docker build -t ${{ secrets.ACR_LOGIN_SERVER }}/spaceapps-frontend:${{ github.sha }} ./frontend
          docker push ${{ secrets.ACR_LOGIN_SERVER }}/spaceapps-frontend:${{ github.sha }}
```

## Security Best Practices

1. **Don't commit secrets** - Use Azure Key Vault or environment variables
2. **Run as non-root** - Backend Dockerfile includes security hardening options
3. **Keep images updated** - Regularly update base images
4. **Scan for vulnerabilities** - Use `docker scan` or Azure Security Center
5. **Use private registries** - Don't push to public Docker Hub with sensitive data

## Monitoring

### Container Health Checks

Both containers include health checks:

```bash
# Check status
docker-compose ps

# Should show "healthy" status
```

### Logs

```bash
# All logs
docker-compose logs -f

# Backend only
docker-compose logs -f backend

# Frontend only
docker-compose logs -f frontend

# Last 100 lines
docker-compose logs --tail=100
```

### Resource Usage

```bash
# Monitor CPU/Memory
docker stats

# Specific container
docker stats spaceapps-backend
```

## Cleanup

```bash
# Stop and remove containers
docker-compose down

# Remove volumes too
docker-compose down -v

# Remove images
docker rmi spaceapps-backend spaceapps-frontend

# Clean up everything
docker system prune -a
```

## FAQ

**Q: Can I use this with docker-compose on a remote server?**  
A: Yes! Copy the project to your server and run `docker-compose up -d`. Make sure ports 80 and 5000 are open.

**Q: How do I update just the backend code?**  
A: Rebuild just the backend: `docker-compose up -d --build backend`

**Q: Can I use a different port than 80?**  
A: Yes, edit docker-compose.yml and change `"80:80"` to `"8080:80"` or your preferred port.

**Q: The initial build is very slow**  
A: First build downloads base images and installs dependencies. Subsequent builds are much faster due to Docker layer caching.

**Q: How do I add SSL/HTTPS?**  
A: For production, use Azure Application Gateway, Azure Front Door, or set up nginx with Let's Encrypt certificates.

## Support

For deployment issues, see:
- [DEPLOYMENT.md](./DEPLOYMENT.md) for Azure-specific help
- [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) for application architecture
- Docker logs: `docker-compose logs -f`

