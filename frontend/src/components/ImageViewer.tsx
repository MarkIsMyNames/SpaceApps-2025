import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import './ImageViewer.css';

interface ImageViewerProps {
  images: string[];
}

const ImageViewer: React.FC<ImageViewerProps> = ({ images }) => {
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [panPosition, setPanPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const sendViewDataToBackend = useCallback(async (zoom: number, pan: { x: number; y: number }) => {
    try {
      await axios.post('/api/view-data', {
        zoom,
        pan,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error sending view data:', error);
    }
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const panStep = 50;
    const zoomStep = 0.1;
    let updated = false;
    let newZoom = zoomLevel;
    let newPan = { ...panPosition };

    switch (e.key.toLowerCase()) {
      case '+':
      case '=':
        e.preventDefault();
        newZoom = Math.min(zoomLevel + zoomStep, 50);
        setZoomLevel(newZoom);
        updated = true;
        break;

      case '-':
      case '_':
        e.preventDefault();
        newZoom = Math.max(zoomLevel - zoomStep, 1);
        setZoomLevel(newZoom);
        updated = true;
        break;

      case 'w':
      case 'arrowup':
        e.preventDefault();
        newPan = { ...panPosition, y: panPosition.y + panStep };
        setPanPosition(newPan);
        updated = true;
        break;

      case 's':
      case 'arrowdown':
        e.preventDefault();
        newPan = { ...panPosition, y: panPosition.y - panStep };
        setPanPosition(newPan);
        updated = true;
        break;

      case 'a':
      case 'arrowleft':
        e.preventDefault();
        newPan = { ...panPosition, x: panPosition.x + panStep };
        setPanPosition(newPan);
        updated = true;
        break;

      case 'd':
      case 'arrowright':
        e.preventDefault();
        newPan = { ...panPosition, x: panPosition.x - panStep };
        setPanPosition(newPan);
        updated = true;
        break;
    }

    if (updated) {
      sendViewDataToBackend(newZoom, newPan);
    }
  }, [zoomLevel, panPosition, sendViewDataToBackend]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  return (
    <div className="image-container">
      {images.length > 0 ? (
        <div
          className="composite-image"
          style={{
            transform: `scale(${zoomLevel}) translate(${panPosition.x}px, ${panPosition.y}px)`
          }}
        >
          {images.map((image: string) => (
            <img
              key={image}
              src={`/images/${image}`}
              alt={image}
              className="viewer-image"
            />
          ))}
        </div>
      ) : (
        <p className="no-images">No images found.</p>
      )}
    </div>
  );
};

export default ImageViewer;
