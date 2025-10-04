#!/usr/bin/env python3
from PIL import Image
import os
import glob

# Disable decompression bomb check for large images
Image.MAX_IMAGE_PIXELS = None

# Configuration
tile_size = 128  # Target tile size in pixels (128x128)
input_dir = "."  # Current directory (backend)
output_dir = "images"

# Create output directory
os.makedirs(output_dir, exist_ok=True)

# Find all images in backend folder (not subfolders)
image_extensions = ['*.jpg', '*.jpeg', '*.png', '*.gif', '*.bmp']
image_files = []
for ext in image_extensions:
    image_files.extend(glob.glob(os.path.join(input_dir, ext)))

if not image_files:
    print("No images found in backend folder")
    exit(1)

input_image = image_files[0]
print(f"Loading image: {input_image}")
img = Image.open(input_image)
width, height = img.size
print(f"Image size: {width}x{height}")

# Calculate number of tiles needed
cols = (width + tile_size - 1) // tile_size  # Ceiling division
rows = (height + tile_size - 1) // tile_size
total_tiles = rows * cols
print(f"Tile size: {tile_size}x{tile_size}")
print(f"Grid: {rows} rows x {cols} cols = {total_tiles} tiles")
print(f"Creating tiles...")

# Split the image
count = 0
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

        # Save the tile
        filename = f"tile_r{row:03d}_c{col:03d}.png"
        filepath = os.path.join(output_dir, filename)
        tile.save(filepath, optimize=True)

        count += 1
        if count % 256 == 0:
            print(f"Processed {count}/{total_tiles} tiles...")

print(f"Done! All {count} tiles saved to {output_dir}/")
