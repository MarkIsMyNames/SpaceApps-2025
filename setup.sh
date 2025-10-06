#!/bin/bash
set -e  # Stop if any command fails

# Go to backend directory
cd backend/

# Create required folders
mkdir -p images image_previews

# Check Python availability
if ! command -v python &> /dev/null; then
  echo "Python not found. Please install Python before continuing."
  exit 1
fi

# --- Virtual environment setup ---
if [ ! -d "venv" ]; then
  echo "Creating virtual environment..."
  python -m venv venv
fi

# Activate venv (cross-platform)
if [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "win"* ]]; then
  # Windows (Git Bash / MinGW)
  source venv/Scripts/activate
else
  # Linux / macOS
  source venv/bin/activate
fi
# --- End venv setup ---

# Install dependencies
echo "Installing dependencies..."
python.exe -m pip install --upgrade pip
pip install requests pillow tqdm Flask flask-cors watchdog

cd scripts/

# Download Mars imagery
echo "Downloading Mars Viking imagery..."
python generate_image.py \
  --capabilities "https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/WMTSCapabilities.xml" \
  --layer Mars_Viking_MDIM21_ClrMosaic_global_232m \
  --zoom 5 \
  --out mars_viking_z5.jpg

# Run post-processing scripts
echo "Running image generation and splitting..."
python split_image.py

echo "Setup complete! You can now run ./start-local.sh"
