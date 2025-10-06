from flask import Flask, jsonify, send_from_directory, request, send_file
from flask_cors import CORS
import os
import json
import re
import sqlite3
from datetime import datetime
from PIL import Image
import threading
from io import BytesIO
from collections import OrderedDict
import time
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

app = Flask(__name__)
CORS(app, origins=['http://localhost:5173', 'http://localhost:3000'])

# Path to the images directory
IMAGE_DIR = 'images'
PREVIEW_DIR = 'image_previews'
VIEW_DATA_FILE = 'view_data.json'
DB_FILE = 'tiles.db'

# Connection pool for database
DB_POOL_SIZE = 5
_db_pool = []
_db_pool_lock = threading.Lock()

# Metadata cache
_meta_cache = None

# LRU cache for frequently accessed tiles (stores image data)
class LRUCache:
    def __init__(self, capacity=100):
        self.cache = OrderedDict()
        self.capacity = capacity
        self.lock = threading.Lock()

    def get(self, key):
        with self.lock:
            if key not in self.cache:
                return None
            self.cache.move_to_end(key)
            return self.cache[key]

    def put(self, key, value):
        with self.lock:
            if key in self.cache:
                self.cache.move_to_end(key)
            self.cache[key] = value
            if len(self.cache) > self.capacity:
                self.cache.popitem(last=False)

tile_cache = LRUCache(capacity=200)

# Database connection pool management
def get_db_connection():
    """Get a database connection from the pool"""
    with _db_pool_lock:
        if _db_pool:
            return _db_pool.pop()

    # Create new connection with optimizations
    conn = sqlite3.connect(DB_FILE, check_same_thread=False, timeout=30.0)

    # Enable WAL mode for better concurrent access
    conn.execute('PRAGMA journal_mode=WAL')

    # Increase cache size (10MB)
    conn.execute('PRAGMA cache_size=-10000')

    # Use memory for temp storage
    conn.execute('PRAGMA temp_store=MEMORY')

    # Optimize for speed
    conn.execute('PRAGMA synchronous=NORMAL')
    conn.execute('PRAGMA mmap_size=268435456')  # 256MB memory map

    return conn

def release_db_connection(conn):
    """Return a connection to the pool"""
    with _db_pool_lock:
        if len(_db_pool) < DB_POOL_SIZE:
            _db_pool.append(conn)
        else:
            conn.close()

# Initialize database
def init_db():
    """Initialize SQLite database with tile metadata"""
    conn = get_db_connection()
    cursor = conn.cursor()

    # Create tiles table with BLOB storage for images
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS tiles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            row INTEGER NOT NULL,
            col INTEGER NOT NULL,
            extension TEXT NOT NULL,
            is_preview INTEGER NOT NULL DEFAULT 0,
            width INTEGER,
            height INTEGER,
            filepath TEXT NOT NULL,
            image_data BLOB,
            UNIQUE(row, col, is_preview)
        )
    ''')

    # Create indexes for fast lookups
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_tiles_row_col ON tiles(row, col)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_tiles_preview ON tiles(is_preview)')

    # Create metadata table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS metadata (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    ''')

    conn.commit()
    release_db_connection(conn)

def scan_and_cache_tiles():
    """Scan tile directories and cache metadata in database"""
    conn = get_db_connection()
    cursor = conn.cursor()

    # Check if already scanned
    cursor.execute("SELECT value FROM metadata WHERE key = 'scanned'")
    result = cursor.fetchone()
    if result and result[0] == 'true':
        conn.close()
        return  # Already scanned

    tile_pattern = re.compile(r'^r(\d+)_c(\d+)\.(png|jpg|jpeg|webp)$', re.IGNORECASE)
    preview_pattern = re.compile(r'^r(\d+)_c(\d+)_preview\.(png|jpg|jpeg|webp)$', re.IGNORECASE)

    tile_width = None
    tile_height = None
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
                filepath = os.path.join(IMAGE_DIR, filename)

                # Get dimensions from first tile only
                width, height = None, None
                if tile_width is None:
                    try:
                        with Image.open(filepath) as img:
                            tile_width, tile_height = img.size
                            width, height = tile_width, tile_height
                    except Exception:
                        tile_width, tile_height = 256, 256
                else:
                    width, height = tile_width, tile_height

                # Read image data into memory
                with open(filepath, 'rb') as f:
                    image_data = f.read()

                # Insert into database with image BLOB
                cursor.execute('''
                    INSERT OR REPLACE INTO tiles (row, col, extension, is_preview, width, height, filepath, image_data)
                    VALUES (?, ?, ?, 0, ?, ?, ?, ?)
                ''', (row, col, ext, width, height, filepath, image_data))

    # Scan preview tiles
    if os.path.exists(PREVIEW_DIR):
        for filename in os.listdir(PREVIEW_DIR):
            match = preview_pattern.match(filename)
            if match:
                row = int(match.group(1))
                col = int(match.group(2))
                ext = match.group(3).lower()
                filepath = os.path.join(PREVIEW_DIR, filename)

                # Get dimensions from first preview only
                width, height = None, None
                if preview_width is None:
                    try:
                        with Image.open(filepath) as img:
                            preview_width, preview_height = img.size
                            width, height = preview_width, preview_height
                    except Exception:
                        preview_width = (tile_width or 256) // 2
                        preview_height = (tile_height or 256) // 2
                else:
                    width, height = preview_width, preview_height

                # Read preview image data into memory
                with open(filepath, 'rb') as f:
                    image_data = f.read()

                # Insert into database with image BLOB
                cursor.execute('''
                    INSERT OR REPLACE INTO tiles (row, col, extension, is_preview, width, height, filepath, image_data)
                    VALUES (?, ?, ?, 1, ?, ?, ?, ?)
                ''', (row, col, ext, width, height, filepath, image_data))

    # Store metadata
    cursor.execute("INSERT OR REPLACE INTO metadata (key, value) VALUES ('tile_width', ?)", (str(tile_width or 256),))
    cursor.execute("INSERT OR REPLACE INTO metadata (key, value) VALUES ('tile_height', ?)", (str(tile_height or 256),))
    cursor.execute("INSERT OR REPLACE INTO metadata (key, value) VALUES ('preview_width', ?)", (str(preview_width or 128),))
    cursor.execute("INSERT OR REPLACE INTO metadata (key, value) VALUES ('preview_height', ?)", (str(preview_height or 128),))
    cursor.execute("INSERT OR REPLACE INTO metadata (key, value) VALUES ('scanned', 'true')")

    conn.commit()
    release_db_connection(conn)

# File watcher for automatic tile updates
class TileFileHandler(FileSystemEventHandler):
    """Watch for new or modified tiles and update database"""

    def __init__(self):
        self.tile_pattern = re.compile(r'^r(\d+)_c(\d+)\.(png|jpg|jpeg|webp)$', re.IGNORECASE)
        self.preview_pattern = re.compile(r'^r(\d+)_c(\d+)_preview\.(png|jpg|jpeg|webp)$', re.IGNORECASE)
        self.processing = set()
        self.lock = threading.Lock()

    def process_tile(self, filepath, is_preview):
        """Process a single tile file and add/update in database"""
        filename = os.path.basename(filepath)

        # Prevent duplicate processing
        with self.lock:
            if filepath in self.processing:
                return
            self.processing.add(filepath)

        try:
            pattern = self.preview_pattern if is_preview else self.tile_pattern
            match = pattern.match(filename)

            if not match:
                return

            row = int(match.group(1))
            col = int(match.group(2))
            ext = match.group(3).lower()

            # Read image dimensions and data
            try:
                with Image.open(filepath) as img:
                    width, height = img.size

                with open(filepath, 'rb') as f:
                    image_data = f.read()

                # Update database
                conn = get_db_connection()
                cursor = conn.cursor()

                cursor.execute('''
                    INSERT OR REPLACE INTO tiles (row, col, extension, is_preview, width, height, filepath, image_data)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ''', (row, col, ext, 1 if is_preview else 0, width, height, filepath, image_data))

                conn.commit()
                release_db_connection(conn)

                # Invalidate cache for this tile
                cache_key = f"{'preview' if is_preview else 'high'}_{row}_{col}"
                tile_cache.cache.pop(cache_key, None)

                # Clear metadata cache to force refresh
                global _meta_cache
                _meta_cache = None

                print(f"✓ Updated tile in database: {filename}")

            except Exception as e:
                print(f"✗ Error processing {filename}: {e}")

        finally:
            with self.lock:
                self.processing.discard(filepath)

    def on_created(self, event):
        """Handle new file creation"""
        if event.is_directory:
            return

        filepath = event.src_path
        is_preview = PREVIEW_DIR in filepath

        # Small delay to ensure file is fully written
        time.sleep(0.5)

        if os.path.exists(filepath):
            threading.Thread(target=self.process_tile, args=(filepath, is_preview), daemon=True).start()

    def on_modified(self, event):
        """Handle file modification"""
        self.on_created(event)

def start_file_watcher():
    """Start watching tile directories for changes"""
    event_handler = TileFileHandler()
    observer = Observer()

    # Watch both directories
    if os.path.exists(IMAGE_DIR):
        observer.schedule(event_handler, IMAGE_DIR, recursive=False)
        print(f"Watching {IMAGE_DIR} for tile changes...")

    if os.path.exists(PREVIEW_DIR):
        observer.schedule(event_handler, PREVIEW_DIR, recursive=False)
        print(f"Watching {PREVIEW_DIR} for tile changes...")

    observer.start()
    return observer

# Initialize database on startup
init_db()
scan_and_cache_tiles()

# Start file watcher in background
file_observer = start_file_watcher()

@app.route('/api/images', methods=['GET'])
def get_images():
    images = os.listdir(IMAGE_DIR)
    return jsonify(images)

@app.route('/images/<filename>', methods=['GET'])
def serve_image(filename):
    return send_from_directory(IMAGE_DIR, filename)

# Cache for metadata
_meta_cache = None

@app.route('/api/tiles/meta', methods=['GET'])
def get_tiles_meta():
    """Get tile metadata from database - ultra-fast with caching"""
    global _meta_cache

    if _meta_cache is not None:
        return jsonify(_meta_cache)

    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()

        # Get tile dimensions from metadata
        cursor.execute("SELECT value FROM metadata WHERE key = 'tile_width'")
        tile_width = int(cursor.fetchone()[0])

        cursor.execute("SELECT value FROM metadata WHERE key = 'tile_height'")
        tile_height = int(cursor.fetchone()[0])

        cursor.execute("SELECT value FROM metadata WHERE key = 'preview_width'")
        preview_width_result = cursor.fetchone()
        preview_width = int(preview_width_result[0]) if preview_width_result else 128

        cursor.execute("SELECT value FROM metadata WHERE key = 'preview_height'")
        preview_height_result = cursor.fetchone()
        preview_height = int(preview_height_result[0]) if preview_height_result else 128

        # Get row/col ranges for high-res tiles
        cursor.execute("SELECT MIN(row), MAX(row), MIN(col), MAX(col) FROM tiles WHERE is_preview = 0")
        min_row, max_row, min_col, max_col = cursor.fetchone()

        # Get unique extensions
        cursor.execute("SELECT DISTINCT extension FROM tiles WHERE is_preview = 0")
        extensions = [row[0] for row in cursor.fetchall()]

        # Check if preview tiles exist
        cursor.execute("SELECT COUNT(*) FROM tiles WHERE is_preview = 1")
        has_preview = cursor.fetchone()[0] > 0

        # Get preview extensions
        cursor.execute("SELECT DISTINCT extension FROM tiles WHERE is_preview = 1")
        preview_extensions = [row[0] for row in cursor.fetchall()]

        conn.close()

        # Calculate center
        center_row = (min_row + max_row) // 2
        center_col = (min_col + max_col) // 2

        response = {
            'minRow': min_row,
            'maxRow': max_row,
            'minCol': min_col,
            'maxCol': max_col,
            'tileWidth': tile_width,
            'tileHeight': tile_height,
            'extensions': extensions,
            'centerRow': center_row,
            'centerCol': center_col,
            'hasPreview': has_preview,
            'previewWidth': preview_width,
            'previewHeight': preview_height,
            'previewExtensions': preview_extensions
        }

        _meta_cache = response
        return jsonify(response)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/tiles/<int:r>/<int:c>', methods=['GET'])
def get_tile(r, c):
    """Serve high-res tile with LRU caching - ultra-fast"""
    try:
        cache_key = f"high_{r}_{c}"

        # Check cache first
        cached = tile_cache.get(cache_key)
        if cached:
            image_data, ext = cached
            return send_file(
                BytesIO(image_data),
                mimetype=f'image/{ext}',
                as_attachment=False,
                download_name=f'r{r:03d}_c{c:03d}.{ext}'
            )

        # Query database
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("SELECT image_data, extension FROM tiles WHERE row = ? AND col = ? AND is_preview = 0", (r, c))
        result = cursor.fetchone()
        release_db_connection(conn)

        if result:
            image_data, ext = result

            # Store in cache
            tile_cache.put(cache_key, (image_data, ext))

            return send_file(
                BytesIO(image_data),
                mimetype=f'image/{ext}',
                as_attachment=False,
                download_name=f'r{r:03d}_c{c:03d}.{ext}'
            )

        return jsonify({'error': 'Tile not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/tiles/preview/<int:r>/<int:c>', methods=['GET'])
def get_preview_tile(r, c):
    """Serve preview tile with LRU caching - ultra-fast"""
    try:
        cache_key = f"preview_{r}_{c}"

        # Check cache first
        cached = tile_cache.get(cache_key)
        if cached:
            image_data, ext = cached
            return send_file(
                BytesIO(image_data),
                mimetype=f'image/{ext}',
                as_attachment=False,
                download_name=f'r{r:03d}_c{c:03d}_preview.{ext}'
            )

        # Query database
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("SELECT image_data, extension FROM tiles WHERE row = ? AND col = ? AND is_preview = 1", (r, c))
        result = cursor.fetchone()
        release_db_connection(conn)

        if result:
            image_data, ext = result

            # Store in cache
            tile_cache.put(cache_key, (image_data, ext))

            return send_file(
                BytesIO(image_data),
                mimetype=f'image/{ext}',
                as_attachment=False,
                download_name=f'r{r:03d}_c{c:03d}_preview.{ext}'
            )

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
    debug = os.getenv('FLASK_ENV', 'development') == 'development'
    app.run(host='0.0.0.0', port=5000, debug=debug)
