from flask import Flask, jsonify, send_from_directory, request
import os
import json
from datetime import datetime

app = Flask(__name__)

# Path to the images directory
IMAGE_DIR = 'images'
VIEW_DATA_FILE = 'view_data.json'

@app.route('/api/images', methods=['GET'])
def get_images():
    images = os.listdir(IMAGE_DIR)
    return jsonify(images)

@app.route('/images/<filename>', methods=['GET'])
def serve_image(filename):
    return send_from_directory(IMAGE_DIR, filename)

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
