from flask import Flask, jsonify, send_from_directory
import os

app = Flask(__name__)

# Path to the images directory
IMAGE_DIR = 'images'

@app.route('/api/images', methods=['GET'])
def get_images():
    images = os.listdir(IMAGE_DIR)
    return jsonify(images)

@app.route('/images/<filename>', methods=['GET'])
def serve_image(filename):
    return send_from_directory(IMAGE_DIR, filename)

if __name__ == '__main__':
    app.run(debug=True)
