#!/usr/bin/env python3
from PIL import Image
import os
import glob

# Disable decompression bomb check for large images
Image.MAX_IMAGE_PIXELS = None

# Configuration
TILE_SIZE = 128
INPUT_DIR = ".."
OUTPUT_DIR = "../images"
PREVIEW_DIR = "../image_previews"

# Create output directories
os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(PREVIEW_DIR, exist_ok=True)

# Find all images in backend folder (not subfolders)
image_extensions = ['*.jpg', '*.jpeg', '*.png']
image_files = []
for ext in image_extensions:
    image_files.extend(glob.glob(os.path.join(INPUT_DIR, ext)))

if not image_files:
    print("No images found in backend folder")
    exit(1)

input_image = image_files[0]
img = Image.open(input_image)
width, height = img.size

# Calculate number of tiles needed
cols = (width + TILE_SIZE - 1) // TILE_SIZE  # Ceiling division
rows = (height + TILE_SIZE - 1) // TILE_SIZE
total_tiles = rows * cols
print(f"Tile size: {TILE_SIZE}x{TILE_SIZE}")
print(f"Grid: {rows} rows x {cols} cols = {total_tiles} tiles")
print(f"Creating tiles...")

# Split the image
for row in range(rows):
    for col in range(cols):
        left = col * TILE_SIZE
        top = row * TILE_SIZE
        right = min(left + TILE_SIZE, width)
        bottom = min(top + TILE_SIZE, height)

        # Calculate actual tile dimensions (may be smaller at edges)
        actual_width = right - left
        actual_height = bottom - top

        # Crop the tile
        tile = img.crop((left, top, right, bottom))

        # Save the full resolution tile
        filename = f"r{row:03d}_c{col:03d}.png"
        filepath = os.path.join(OUTPUT_DIR, filename)
        tile.save(filepath)

        # Create and save preview (1:2 scale, 8-bit)
        preview_width = actual_width // 2
        preview_height = actual_height // 2
        preview = tile.resize((preview_width, preview_height), Image.LANCZOS)
        preview = preview.convert('P', palette=Image.ADAPTIVE, colors=256)
        preview_filename = f"r{row:03d}_c{col:03d}_preview.png"
        preview_filepath = os.path.join(PREVIEW_DIR, preview_filename)
        preview.save(preview_filepath)
