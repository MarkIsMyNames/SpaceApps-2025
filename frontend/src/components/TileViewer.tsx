import React, { useEffect, useState, useCallback, useRef } from 'react';
import axios from 'axios';
import './TileViewer.css';

interface TileMeta {
  minRow: number;
  maxRow: number;
  minCol: number;
  maxCol: number;
  tileWidth: number;
  tileHeight: number;
  extensions: string[];
  centerRow: number;
  centerCol: number;
}

interface PanState {
  x: number;
  y: number;
}

const TileViewer: React.FC = () => {
  const [tileMeta, setTileMeta] = useState<TileMeta | null>(null);
  const [panState, setPanState] = useState<PanState>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<PanState>({ x: 0, y: 0 });
  // Remove visibleTiles state entirely (we'll load and render initial tiles directly).
  // Remove the visibleTiles useEffect.
  // Remove tileImages Map; use an array of {row, col, url} instead for simplicity.
  const [initialTiles, setInitialTiles] = useState<Array<{row: number, col: number, url: string}>>([]);
  const [initialExtent, setInitialExtent] = useState<{width: number, height: number}>({ width: 0, height: 0 });
  
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportSize = 1024;

  // Utility functions for tile calculations
  const getTileIndices = useCallback((panX: number, panY: number, tileWidth: number, tileHeight: number) => {
    const startRow = Math.floor(panY / tileHeight);
    const endRow = Math.ceil((panY + viewportSize) / tileHeight);
    const startCol = Math.floor(panX / tileWidth);
    const endCol = Math.ceil((panX + viewportSize) / tileWidth);
    
    return { startRow, endRow, startCol, endCol };
  }, [viewportSize]);

  // Fetch tile metadata on mount
  useEffect(() => {
    const fetchTileMeta = async () => {
      try {
        const response = await axios.get('/api/tiles/meta');
        const meta = response.data;
        setTileMeta(meta);
        
        // Initialize pan to 0,0 (will be updated after tiles load)
        setPanState({ x: 0, y: 0 });
      } catch (error) {
        console.error('Error fetching tile metadata:', error);
        // Set a fallback state to prevent infinite loading
        setTileMeta({
          minRow: 0, maxRow: 63, minCol: 0, maxCol: 126,
          tileWidth: 256, tileHeight: 256, extensions: ['png'],
          centerRow: 31, centerCol: 63
        });
      }
    };

    fetchTileMeta();
  }, []);

  // Load tiles around the center tile ONCE on mount
  useEffect(() => {
    if (!tileMeta || initialTiles.length > 0) return;

    const loadInitialTiles = async () => {
      // Calculate center tile based on metadata
      const centerRow = tileMeta.centerRow;
      const centerCol = tileMeta.centerCol;
      
      // Calculate how many tiles we need to fill 1024x1024 viewport
      const tilesNeededX = Math.ceil(viewportSize / tileMeta.tileWidth);
      const tilesNeededY = Math.ceil(viewportSize / tileMeta.tileHeight);
      
      // Load tiles centered on centerRow/centerCol
      const halfX = Math.floor(tilesNeededX / 2);
      const halfY = Math.floor(tilesNeededY / 2);
      
      const startRow = centerRow - halfY;
      const endRow = centerRow + halfY;
      const startCol = centerCol - halfX;
      const endCol = centerCol + halfX;

      console.log(`Loading 8x8 tiles centered on (${centerRow},${centerCol}), range: rows ${startRow}-${endRow}, cols ${startCol}-${endCol}`);

      const tiles: Array<{row: number, col: number, url: string}> = [];
      
      for (let row = startRow; row <= endRow; row++) {
        for (let col = startCol; col <= endCol; col++) {
          if (row >= tileMeta.minRow && row <= tileMeta.maxRow && 
              col >= tileMeta.minCol && col <= tileMeta.maxCol) {
            try {
              const response = await axios.get(`/api/tiles/${row}/${col}`, {
                responseType: 'blob',
                headers: {
                  'Cache-Control': 'no-cache',
                  'Pragma': 'no-cache'
                }
              });
              const imageUrl = URL.createObjectURL(response.data);
              tiles.push({ row, col, url: imageUrl });
            } catch (error) {
              console.warn(`Failed to load tile ${row},${col}:`, error);
            }
          }
        }
      }
      
      setInitialTiles(tiles);
      
      if (tiles.length > 0) {
        // Calculate the bounding box of loaded tiles
        const minCol = Math.min(...tiles.map(t => t.col));
        const maxCol = Math.max(...tiles.map(t => t.col));
        const minRow = Math.min(...tiles.map(t => t.row));
        const maxRow = Math.max(...tiles.map(t => t.row));
        
        // World coordinates of the loaded tile area
        const worldMinX = minCol * tileMeta.tileWidth;
        const worldMinY = minRow * tileMeta.tileHeight;
        const worldMaxX = (maxCol + 1) * tileMeta.tileWidth;
        const worldMaxY = (maxRow + 1) * tileMeta.tileHeight;
        const worldWidth = worldMaxX - worldMinX;
        const worldHeight = worldMaxY - worldMinY;
        
        setInitialExtent({ width: worldWidth, height: worldHeight });
        
        // Set pan so the CENTER of the loaded tiles appears at viewport center
        // World center of loaded tiles:
        const worldCenterX = (worldMinX + worldMaxX) / 2;
        const worldCenterY = (worldMinY + worldMaxY) / 2;
        
        // We want worldCenter to appear at viewport center (512, 512)
        // viewportX = worldX - panX, so: 512 = worldCenterX - panX
        // Therefore: panX = worldCenterX - 512
        const panX = worldCenterX - (viewportSize / 2);
        const panY = worldCenterY - (viewportSize / 2);
        
        setPanState({ x: panX, y: panY });
        console.log(`Loaded ${tiles.length} tiles (rows ${minRow}-${maxRow}, cols ${minCol}-${maxCol})`);
        console.log(`World bounds: (${worldMinX},${worldMinY}) to (${worldMaxX},${worldMaxY})`);
        console.log(`World center: (${worldCenterX},${worldCenterY}), pan: (${panX},${panY})`);
      }
    };

    loadInitialTiles();
  }, [tileMeta, viewportSize, initialTiles.length]);

  // Mouse event handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX + panState.x, y: e.clientY + panState.y });
  }, [panState]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging && tileMeta) {
      const newPanX = dragStart.x - e.clientX;
      const newPanY = dragStart.y - e.clientY;
      
      const updatePan = () => setPanState({ x: newPanX, y: newPanY });
      requestAnimationFrame(updatePan);
    }
  }, [isDragging, dragStart, tileMeta]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Touch event handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    setIsDragging(true);
    setDragStart({ x: touch.clientX + panState.x, y: touch.clientY + panState.y });
  }, [panState]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (isDragging && tileMeta) {
      const touch = e.touches[0];
      const newPanX = dragStart.x - touch.clientX;
      const newPanY = dragStart.y - touch.clientY;
      
      const updatePan = () => setPanState({ x: newPanX, y: newPanY });
      requestAnimationFrame(updatePan);
    }
  }, [isDragging, dragStart, tileMeta]);

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Add useEffect for global mouseup and wheel prevention:
  useEffect(() => {
    const handleGlobalMouseUp = () => setIsDragging(false);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    
    const handleWheel = (e: WheelEvent) => {
      if (containerRef.current?.contains(e.target as Node)) {
        e.preventDefault();
      }
    };
    window.addEventListener('wheel', handleWheel, { passive: false });
    
    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('wheel', handleWheel);
    };
  }, []);

  if (!tileMeta || initialTiles.length === 0) {
    return (
      <div className="tile-viewer-container">
        <div className="loading">Loading initial tiles...</div>
      </div>
    );
  }

  if (initialExtent.width === 0 || initialExtent.height === 0) {
    return <div className="tile-viewer-container"><div className="loading">Loading initial tiles...</div></div>;
  }

  // Calculate min row/col once per render
  const minCol = Math.min(...initialTiles.map(t => t.col));
  const minRow = Math.min(...initialTiles.map(t => t.row));

  console.log(`Rendering ${initialTiles.length} tiles, minRow=${minRow}, minCol=${minCol}, pan=(${panState.x},${panState.y})`);

  return (
    <div className="tile-viewer-container">
      <div className="tile-viewer-info">
        Pan: ({panState.x.toFixed(0)}, {panState.y.toFixed(0)}) | 
        Center: ({tileMeta.centerRow}, {tileMeta.centerCol}) | 
        Tiles: {initialTiles.length} | MinRow: {minRow} | MinCol: {minCol}
      </div>
      
      <div
        ref={containerRef}
        className="tile-viewport"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ 
          cursor: isDragging ? 'grabbing' : 'grab',
          width: viewportSize,
          height: viewportSize,
          overflow: 'hidden',
          position: 'relative',
          backgroundColor: '#000'
        }}
      >
        {initialTiles.map(({row, col, url}, idx) => {
          // Tile's absolute position in world space
          const worldX = col * tileMeta.tileWidth;
          const worldY = row * tileMeta.tileHeight;
          
          // Position relative to viewport (subtract pan to show correct tiles)
          const viewportX = worldX - panState.x;
          const viewportY = worldY - panState.y;
          
          // Log first tile for debugging
          if (idx === 0) {
            console.log(`First tile: row=${row}, col=${col}, worldX=${worldX}, worldY=${worldY}, viewportX=${viewportX}, viewportY=${viewportY}`);
          }
          
          return (
            <img
              key={`${row}_${col}`}
              src={url}
              alt={`Tile ${row},${col}`}
              style={{
                position: 'absolute',
                left: viewportX,
                top: viewportY,
                width: tileMeta.tileWidth,
                height: tileMeta.tileHeight,
                objectFit: 'cover',
                border: '2px solid lime',
                pointerEvents: 'none'
              }}
            />
          );
        })}
      </div>
    </div>
  );
};

export default TileViewer;
