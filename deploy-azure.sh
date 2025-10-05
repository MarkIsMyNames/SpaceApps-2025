#!/bin/bash
# Azure deployment script

set -e

# Configuration
RESOURCE_GROUP="${RESOURCE_GROUP:-spaceapps-rg}"
LOCATION="${LOCATION:-eastus}"
ACR_NAME="${ACR_NAME:-spaceappsacr}"  # Change this to your unique name

echo "🚀 Deploying Space Apps to Azure Container Registry"
echo "   Resource Group: $RESOURCE_GROUP"
echo "   Location: $LOCATION"
echo "   ACR Name: $ACR_NAME"
echo ""

# Check if Azure CLI is installed
if ! command -v az &> /dev/null; then
    echo "❌ Azure CLI is not installed. Please install it first."
    echo "   https://docs.microsoft.com/en-us/cli/azure/install-azure-cli"
    exit 1
fi

# Login to Azure
echo "🔑 Logging into Azure..."
az login

# Create resource group
echo "📦 Creating resource group..."
az group create --name $RESOURCE_GROUP --location $LOCATION

# Create Azure Container Registry
echo "🏗️  Creating Azure Container Registry..."
az acr create \
  --resource-group $RESOURCE_GROUP \
  --name $ACR_NAME \
  --sku Basic \
  --admin-enabled true

# Get ACR login server
ACR_LOGIN_SERVER=$(az acr show --name $ACR_NAME --query loginServer --output tsv)
echo "   ACR Login Server: $ACR_LOGIN_SERVER"

# Build images in Azure (faster for large images with tile data)
echo "🔨 Building backend image in Azure..."
az acr build \
  --registry $ACR_NAME \
  --image spaceapps-backend:latest \
  --file backend/Dockerfile \
  ./backend

echo "🔨 Building frontend image in Azure..."
az acr build \
  --registry $ACR_NAME \
  --image spaceapps-frontend:latest \
  --file frontend/Dockerfile \
  ./frontend

echo ""
echo "✅ Images built and pushed to ACR!"
echo ""
echo "📝 Next steps:"
echo "   1. Upload tile data to Azure File Share (see DEPLOYMENT.md)"
echo "   2. Deploy containers using Azure Container Instances or Container Apps"
echo "   3. See DEPLOYMENT.md for detailed instructions"
echo ""
echo "Quick deploy command (Container Instances):"
echo "   az container create --resource-group $RESOURCE_GROUP --name spaceapps-backend --image $ACR_LOGIN_SERVER/spaceapps-backend:latest ..."

