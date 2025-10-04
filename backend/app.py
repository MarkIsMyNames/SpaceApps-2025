from flask import Flask, jsonify, send_from_directory, request, send_file
from flask_cors import CORS
import os
import json
import re
from datetime import datetime
from PIL import Image

app = Flask(__name__)
CORS(app, origins=['http://localhost:5173', 'http://localhost:3000'])

# Path to the images directory
IMAGE_DIR = 'images'
PREVIEW_DIR = 'image_previews'
VIEW_DATA_FILE = 'view_data.json'

@app.route('/api/images', methods=['GET'])
def get_images():
    images = os.listdir(IMAGE_DIR)
    return jsonify(images)

@app.route('/images/<filename>', methods=['GET'])
def serve_image(filename):
    return send_from_directory(IMAGE_DIR, filename)

@app.route('/api/tiles/meta', methods=['GET'])
def get_tiles_meta():
    try:
        # Scan for tile files matching pattern r(\d+)_c(\d+)\.(png|jpg|jpeg|webp)
        tile_pattern = re.compile(r'^r(\d+)_c(\d+)\.(png|jpg|jpeg|webp)$', re.IGNORECASE)
        # Also scan for preview tiles: r(\d+)_c(\d+)_preview\.(png|jpg|jpeg|webp)
        preview_pattern = re.compile(r'^r(\d+)_c(\d+)_preview\.(png|jpg|jpeg|webp)$', re.IGNORECASE)
        
        rows = set()
        cols = set()
        extensions = set()
        tile_width = None
        tile_height = None
        
        preview_rows = set()
        preview_cols = set()
        preview_extensions = set()
        preview_width = None
        preview_height = None
        
        # Scan high-res tiles
        if os.path.exists(IMAGE_DIR):
            for filename in os.listdir(IMAGE_DIR):
                match = tile_pattern.match(filename)
                if match:
                    row = int(match.group(1))
                    col = int(match.group(2))
                    ext = match.group(3).lower()
                    
                    rows.add(row)
                    cols.add(col)
                    extensions.add(ext)
                    
                    # Get tile dimensions from first tile found
                    if tile_width is None:
                        try:
                            with Image.open(os.path.join(IMAGE_DIR, filename)) as img:
                                tile_width, tile_height = img.size
                        except Exception:
                            # If we can't read the image, use default dimensions
                            tile_width, tile_height = 256, 256
        
        # Scan preview tiles
        if os.path.exists(PREVIEW_DIR):
            for filename in os.listdir(PREVIEW_DIR):
                match = preview_pattern.match(filename)
                if match:
                    row = int(match.group(1))
                    col = int(match.group(2))
                    ext = match.group(3).lower()
                    
                    preview_rows.add(row)
                    preview_cols.add(col)
                    preview_extensions.add(ext)
                    
                    # Get preview dimensions from first preview found
                    if preview_width is None:
                        try:
                            with Image.open(os.path.join(PREVIEW_DIR, filename)) as img:
                                preview_width, preview_height = img.size
                        except Exception:
                            # Default to half of high-res tile size
                            preview_width = (tile_width or 256) // 2
                            preview_height = (tile_height or 256) // 2
        
        if not rows or not cols:
            return jsonify({'error': 'No tile files found'}), 404
        
        min_row, max_row = min(rows), max(rows)
        min_col, max_col = min(cols), max(cols)
        
        # Calculate center as midpoint
        center_row = (min_row + max_row) // 2
        center_col = (min_col + max_col) // 2
        
        response = {
            'minRow': min_row,
            'maxRow': max_row,
            'minCol': min_col,
            'maxCol': max_col,
            'tileWidth': tile_width or 256,
            'tileHeight': tile_height or 256,
            'extensions': list(extensions),
            'centerRow': center_row,
            'centerCol': center_col,
            'hasPreview': len(preview_rows) > 0,
            'previewWidth': preview_width,
            'previewHeight': preview_height,
            'previewExtensions': list(preview_extensions) if preview_extensions else []
        }
        
        return jsonify(response)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/tiles/<int:r>/<int:c>', methods=['GET'])
def get_tile(r, c):
    try:
        # Try different extensions in order of preference
        extensions = ['jpg', 'png', 'jpeg', 'webp']
        
        for ext in extensions:
            filename = f'r{r:03d}_c{c:03d}.{ext}'
            filepath = os.path.join(IMAGE_DIR, filename)
            
            if os.path.exists(filepath):
                return send_file(filepath, mimetype=f'image/{ext}')
        
        return jsonify({'error': 'Tile not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/tiles/preview/<int:r>/<int:c>', methods=['GET'])
def get_preview_tile(r, c):
    try:
        # Try different extensions in order of preference
        extensions = ['png', 'jpg', 'jpeg', 'webp']
        
        for ext in extensions:
            filename = f'r{r:03d}_c{c:03d}_preview.{ext}'
            filepath = os.path.join(PREVIEW_DIR, filename)
            
            if os.path.exists(filepath):
                return send_file(filepath, mimetype=f'image/{ext}')
        
        return jsonify({'error': 'Preview tile not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/view-data', methods=['POST'])
def collect_view_data():
    try:
        data = request.get_json()

        # Add server timestamp
        data['server_timestamp'] = datetime.now().isoformat()

        # Load existing data or create new list
        view_history = []
        if os.path.exists(VIEW_DATA_FILE):
            with open(VIEW_DATA_FILE, 'r') as f:
                view_history = json.load(f)

        # Append new data
        view_history.append(data)

        # Save updated data
        with open(VIEW_DATA_FILE, 'w') as f:
            json.dump(view_history, f, indent=2)

        return jsonify({'status': 'success', 'message': 'View data saved'}), 200
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)
