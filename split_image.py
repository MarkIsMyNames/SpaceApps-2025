#!/usr/bin/env python3
from PIL import Image
import os
import glob

# Disable decompression bomb check for large images
Image.MAX_IMAGE_PIXELS = None

# Configuration
tile_size = 128  # Target tile size in pixels (128x128)
input_dir = "backend"
output_dir = "backend/images"

# Create output directory
os.makedirs(output_dir, exist_ok=True)

# Find all images in backend folder (not subfolders)
image_extensions = ['*.jpg', '*.jpeg', '*.png']
image_files = []
for ext in image_extensions:
    image_files.extend(glob.glob(os.path.join(input_dir, ext)))

if not image_files:
    print("No images found in backend folder")
    exit(1)

input_image = image_files[0]
img = Image.open(input_image)
width, height = img.size

# Calculate number of tiles needed
cols = (width + tile_size - 1) // tile_size  # Ceiling division
rows = (height + tile_size - 1) // tile_size
total_tiles = rows * cols
print(f"Tile size: {tile_size}x{tile_size}")
print(f"Grid: {rows} rows x {cols} cols = {total_tiles} tiles")
print(f"Creating tiles...")

# Split the image
for row in range(rows):
    for col in range(cols):
        left = col * tile_size
        top = row * tile_size
        right = min(left + tile_size, width)
        bottom = min(top + tile_size, height)

        # Calculate actual tile dimensions (may be smaller at edges)
        actual_width = right - left
        actual_height = bottom - top

        # Crop the tile
        tile = img.crop((left, top, right, bottom))

        # Save the full resolution tile
        filename = f"r{row:03d}_c{col:03d}.png"
        filepath = os.path.join(output_dir, filename)
        tile.save(filepath, optimize=True)

        # Create and save preview (1:2 scale, 8-bit)
        preview_width = actual_width // 2
        preview_height = actual_height // 2
        preview = tile.resize((preview_width, preview_height), Image.LANCZOS)
        preview = preview.convert('P', palette=Image.ADAPTIVE, colors=256)
        preview_filename = f"r{row:03d}_c{col:03d}_preview.png"
        preview_filepath = os.path.join(output_dir, preview_filename)
        preview.save(preview_filepath, optimize=True)
