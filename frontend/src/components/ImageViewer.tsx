import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import './ImageViewer.css';

interface ImageViewerProps {
  images: string[];
}

const ImageViewer: React.FC<ImageViewerProps> = ({ images }) => {
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [panPosition, setPanPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

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

  const calculatePanLimits = useCallback((zoom: number) => {
    // At zoom = 1, no panning allowed (image fills screen)
    // As zoom increases, allow more panning
    // The limit ensures the image edge never goes past the viewport edge
    if (zoom <= 1) return 0;

    // Calculate max pan based on viewport dimensions
    // When zoomed, the image is larger, so we can pan more
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // The panned distance in pixels that keeps image covering the viewport
    const maxPanX = (viewportWidth * (zoom - 1)) / (2 * zoom);
    const maxPanY = (viewportHeight * (zoom - 1)) / (2 * zoom);

    return { x: maxPanX, y: maxPanY };
  }, []);

  const clampPan = useCallback((pan: { x: number; y: number }, zoom: number) => {
    const limits = calculatePanLimits(zoom);
    if (typeof limits === 'number') {
      return { x: 0, y: 0 };
    }
    return {
      x: Math.max(-limits.x, Math.min(limits.x, pan.x)),
      y: Math.max(-limits.y, Math.min(limits.y, pan.y))
    };
  }, [calculatePanLimits]);

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
        // Adjust pan to stay within bounds when zooming
        newPan = clampPan(newPan, newZoom);
        setPanPosition(newPan);
        updated = true;
        break;

      case '-':
      case '_':
        e.preventDefault();
        newZoom = Math.max(zoomLevel - zoomStep, 1);
        setZoomLevel(newZoom);
        // Adjust pan to stay within bounds when zooming out
        newPan = clampPan(newPan, newZoom);
        setPanPosition(newPan);
        updated = true;
        break;

      case 'w':
      case 'arrowup':
        e.preventDefault();
        newPan = clampPan({ ...panPosition, y: panPosition.y + panStep }, zoomLevel);
        setPanPosition(newPan);
        updated = true;
        break;

      case 's':
      case 'arrowdown':
        e.preventDefault();
        newPan = clampPan({ ...panPosition, y: panPosition.y - panStep }, zoomLevel);
        setPanPosition(newPan);
        updated = true;
        break;

      case 'a':
      case 'arrowleft':
        e.preventDefault();
        newPan = clampPan({ ...panPosition, x: panPosition.x + panStep }, zoomLevel);
        setPanPosition(newPan);
        updated = true;
        break;

      case 'd':
      case 'arrowright':
        e.preventDefault();
        newPan = clampPan({ ...panPosition, x: panPosition.x - panStep }, zoomLevel);
        setPanPosition(newPan);
        updated = true;
        break;
    }

    if (updated) {
      sendViewDataToBackend(newZoom, newPan);
    }
  }, [zoomLevel, panPosition, sendViewDataToBackend, clampPan]);

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const zoomStep = 0.1;
    const newZoom = e.deltaY < 0
      ? Math.min(zoomLevel + zoomStep, 50)
      : Math.max(zoomLevel - zoomStep, 1);

    setZoomLevel(newZoom);
    const newPan = clampPan(panPosition, newZoom);
    setPanPosition(newPan);
    sendViewDataToBackend(newZoom, newPan);
  }, [zoomLevel, panPosition, clampPan, sendViewDataToBackend]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (zoomLevel > 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - panPosition.x, y: e.clientY - panPosition.y });
    }
  }, [zoomLevel, panPosition]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging && zoomLevel > 1) {
      const newPan = clampPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      }, zoomLevel);
      setPanPosition(newPan);
    }
  }, [isDragging, zoomLevel, dragStart, clampPan]);

  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
      sendViewDataToBackend(zoomLevel, panPosition);
    }
  }, [isDragging, zoomLevel, panPosition, sendViewDataToBackend]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  useEffect(() => {
    const container = document.querySelector('.image-container');
    if (container) {
      container.addEventListener('wheel', handleWheel as EventListener, { passive: false });
      return () => {
        container.removeEventListener('wheel', handleWheel as EventListener);
      };
    }
  }, [handleWheel]);

  return (
    <div className="image-viewer-container">
      <div className="controls-info">
        Zoom: {(zoomLevel * 100).toFixed(0)}%
      </div>

      <div
        className="image-container"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: zoomLevel > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
      >
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
                draggable={false}
              />
            ))}
          </div>
        ) : (
          <p className="no-images">No galaxy images available</p>
        )}
      </div>
    </div>
  );
};

export default ImageViewer;
