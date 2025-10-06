#!/bin/bash
set -e  # Exit if any command fails

# Clone repo
git clone https://github.com/MarkIsMyNames/SpaceApps-2025/
cd SpaceApps-2025/backend/

# Create directories
mkdir -p images image_previews

# Ensure Python and pip are available
if ! command -v python &>/dev/null; then
  echo "Python not found. Please install Python before running this script."
  exit 1
fi

# Create and activate virtual environment
python -m venv venv
source venv/bin/activate

# Install dependencies
pip install requests pillow tqdm

# Generate stitched Mars image
python wmts_stitch.py \
  --capabilities "https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/WMTSCapabilities.xml" \
  --layer Mars_Viking_MDIM21_ClrMosaic_global_232m \
  --zoom 5 \
  --out mars_viking_z5.jpg

# Run post-processing scripts
cd scripts/
python generate_image.py
python split_image.py
