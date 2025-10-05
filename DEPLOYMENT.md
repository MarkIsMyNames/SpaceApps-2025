# Azure Deployment Guide

This guide walks you through deploying the Space Apps tile viewer to Azure Container Registry and Azure Container Instances.

## Prerequisites

1. Azure CLI installed: https://docs.microsoft.com/en-us/cli/azure/install-azure-cli
2. Docker installed and running
3. Azure subscription

## Step 1: Login to Azure

```bash
az login
```

## Step 2: Create Azure Container Registry

```bash
# Set variables
RESOURCE_GROUP="spaceapps-rg"
LOCATION="eastus"
ACR_NAME="spaceappsacr"  # Must be globally unique, lowercase alphanumeric only

# Create resource group
az group create --name $RESOURCE_GROUP --location $LOCATION

# Create Azure Container Registry
az acr create \
  --resource-group $RESOURCE_GROUP \
  --name $ACR_NAME \
  --sku Basic \
  --admin-enabled true
```

## Step 3: Build and Push Docker Images

### Option A: Build locally and push

```bash
# Login to ACR
az acr login --name $ACR_NAME

# Get ACR login server
ACR_LOGIN_SERVER=$(az acr show --name $ACR_NAME --query loginServer --output tsv)

# Build and tag images
docker build -t $ACR_LOGIN_SERVER/spaceapps-backend:latest ./backend
docker build -t $ACR_LOGIN_SERVER/spaceapps-frontend:latest ./frontend

# Push images to ACR
docker push $ACR_LOGIN_SERVER/spaceapps-backend:latest
docker push $ACR_LOGIN_SERVER/spaceapps-frontend:latest
```

### Option B: Build in Azure (recommended for large images)

```bash
# Build backend in Azure
az acr build \
  --registry $ACR_NAME \
  --image spaceapps-backend:latest \
  --file backend/Dockerfile \
  ./backend

# Build frontend in Azure
az acr build \
  --registry $ACR_NAME \
  --image spaceapps-frontend:latest \
  --file frontend/Dockerfile \
  ./frontend
```

## Step 4: Prepare Tile Data

Since tile images are large, you have several options:

### Option A: Azure File Share (Recommended)

```bash
STORAGE_ACCOUNT="spaceappsstorage"  # Must be globally unique
FILE_SHARE_NAME="tiles"

# Create storage account
az storage account create \
  --resource-group $RESOURCE_GROUP \
  --name $STORAGE_ACCOUNT \
  --location $LOCATION \
  --sku Standard_LRS

# Create file share
az storage share create \
  --name $FILE_SHARE_NAME \
  --account-name $STORAGE_ACCOUNT

# Upload tile directories (this may take a while)
# Get storage account key first
STORAGE_KEY=$(az storage account keys list \
  --resource-group $RESOURCE_GROUP \
  --account-name $STORAGE_ACCOUNT \
  --query "[0].value" --output tsv)

# Upload files using Azure CLI or Azure Storage Explorer
az storage file upload-batch \
  --destination $FILE_SHARE_NAME/images \
  --source ./backend/images \
  --account-name $STORAGE_ACCOUNT \
  --account-key $STORAGE_KEY

az storage file upload-batch \
  --destination $FILE_SHARE_NAME/image_previews \
  --source ./backend/image_previews \
  --account-name $STORAGE_ACCOUNT \
  --account-key $STORAGE_KEY
```

### Option B: Include in Docker Image (For smaller datasets)

If your tile data is manageable (<1GB), you can include it directly in the Docker image.
Just remove the volumes section from docker-compose and ensure tiles are copied in the Dockerfile.

## Step 5: Deploy to Azure Container Instances

### Get ACR credentials

```bash
ACR_USERNAME=$(az acr credential show --name $ACR_NAME --query username --output tsv)
ACR_PASSWORD=$(az acr credential show --name $ACR_NAME --query passwords[0].value --output tsv)
ACR_LOGIN_SERVER=$(az acr show --name $ACR_NAME --query loginServer --output tsv)
```

### Deploy Backend Container

```bash
az container create \
  --resource-group $RESOURCE_GROUP \
  --name spaceapps-backend \
  --image $ACR_LOGIN_SERVER/spaceapps-backend:latest \
  --registry-login-server $ACR_LOGIN_SERVER \
  --registry-username $ACR_USERNAME \
  --registry-password $ACR_PASSWORD \
  --dns-name-label spaceapps-backend-$RANDOM \
  --ports 5000 \
  --cpu 2 \
  --memory 4 \
  --environment-variables FLASK_ENV=production \
  --azure-file-volume-account-name $STORAGE_ACCOUNT \
  --azure-file-volume-account-key $STORAGE_KEY \
  --azure-file-volume-share-name $FILE_SHARE_NAME \
  --azure-file-volume-mount-path /app/tiles

# Get backend FQDN
BACKEND_FQDN=$(az container show \
  --resource-group $RESOURCE_GROUP \
  --name spaceapps-backend \
  --query ipAddress.fqdn --output tsv)

echo "Backend URL: http://$BACKEND_FQDN:5000"
```

### Deploy Frontend Container

```bash
az container create \
  --resource-group $RESOURCE_GROUP \
  --name spaceapps-frontend \
  --image $ACR_LOGIN_SERVER/spaceapps-frontend:latest \
  --registry-login-server $ACR_LOGIN_SERVER \
  --registry-username $ACR_USERNAME \
  --registry-password $ACR_PASSWORD \
  --dns-name-label spaceapps-frontend-$RANDOM \
  --ports 80 \
  --cpu 1 \
  --memory 2

# Get frontend FQDN
FRONTEND_FQDN=$(az container show \
  --resource-group $RESOURCE_GROUP \
  --name spaceapps-frontend \
  --query ipAddress.fqdn --output tsv)

echo "Frontend URL: http://$FRONTEND_FQDN"
```

## Step 6: Deploy Using Azure Container Apps (Alternative - Recommended for Production)

Azure Container Apps is better for production workloads:

```bash
# Install Container Apps extension
az extension add --name containerapp --upgrade

# Create Container Apps environment
az containerapp env create \
  --name spaceapps-env \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION

# Deploy backend
az containerapp create \
  --name spaceapps-backend \
  --resource-group $RESOURCE_GROUP \
  --environment spaceapps-env \
  --image $ACR_LOGIN_SERVER/spaceapps-backend:latest \
  --registry-server $ACR_LOGIN_SERVER \
  --registry-username $ACR_USERNAME \
  --registry-password $ACR_PASSWORD \
  --target-port 5000 \
  --ingress external \
  --cpu 2 \
  --memory 4Gi \
  --min-replicas 1 \
  --max-replicas 3

# Deploy frontend
az containerapp create \
  --name spaceapps-frontend \
  --resource-group $RESOURCE_GROUP \
  --environment spaceapps-env \
  --image $ACR_LOGIN_SERVER/spaceapps-frontend:latest \
  --registry-server $ACR_LOGIN_SERVER \
  --registry-username $ACR_USERNAME \
  --registry-password $ACR_PASSWORD \
  --target-port 80 \
  --ingress external \
  --cpu 1 \
  --memory 2Gi \
  --min-replicas 1 \
  --max-replicas 5

# Get URLs
az containerapp show \
  --name spaceapps-backend \
  --resource-group $RESOURCE_GROUP \
  --query properties.configuration.ingress.fqdn

az containerapp show \
  --name spaceapps-frontend \
  --resource-group $RESOURCE_GROUP \
  --query properties.configuration.ingress.fqdn
```

## Local Testing with Docker Compose

Before deploying to Azure, test locally:

```bash
# Build and run
docker-compose up --build

# Access the application
# Frontend: http://localhost
# Backend API: http://localhost:5000/api/tiles/meta

# Stop containers
docker-compose down
```

## Monitoring and Logs

### View container logs

```bash
# Azure Container Instances
az container logs --resource-group $RESOURCE_GROUP --name spaceapps-backend
az container logs --resource-group $RESOURCE_GROUP --name spaceapps-frontend

# Azure Container Apps
az containerapp logs show --name spaceapps-backend --resource-group $RESOURCE_GROUP
az containerapp logs show --name spaceapps-frontend --resource-group $RESOURCE_GROUP
```

## Updating the Application

```bash
# Rebuild and push new images
docker build -t $ACR_LOGIN_SERVER/spaceapps-backend:v2 ./backend
docker push $ACR_LOGIN_SERVER/spaceapps-backend:v2

# Update container
az container create \
  --resource-group $RESOURCE_GROUP \
  --name spaceapps-backend \
  --image $ACR_LOGIN_SERVER/spaceapps-backend:v2 \
  ... # (include all other parameters)
```

## Cleanup

To delete all resources:

```bash
az group delete --name $RESOURCE_GROUP --yes --no-wait
```

## Cost Optimization Tips

1. **Use Azure Container Apps** instead of Container Instances for auto-scaling
2. **Enable ACR geo-replication** for faster pulls if deploying to multiple regions
3. **Use spot instances** for non-production environments
4. **Set up auto-shutdown** for development environments
5. **Monitor with Azure Monitor** to optimize resource allocation
6. **Use Azure CDN** in front of the frontend for better performance

## Security Best Practices

1. Use Azure Key Vault for secrets
2. Enable HTTPS with Azure Front Door or Application Gateway
3. Implement Azure AD authentication
4. Use managed identities instead of username/password for ACR
5. Enable Azure DDoS Protection
6. Set up network security groups (NSGs)

## Troubleshooting

### Container won't start
```bash
az container show --resource-group $RESOURCE_GROUP --name spaceapps-backend
az container logs --resource-group $RESOURCE_GROUP --name spaceapps-backend --follow
```

### Can't pull images from ACR
```bash
# Check ACR admin is enabled
az acr update --name $ACR_NAME --admin-enabled true

# Verify credentials
az acr credential show --name $ACR_NAME
```

### Out of memory errors
```bash
# Increase container memory
az container create ... --memory 8
```

