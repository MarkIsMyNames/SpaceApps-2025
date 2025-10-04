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
  hasPreview: boolean;
  previewWidth: number;
  previewHeight: number;
  previewExtensions: string[];
}

interface PanState {
  x: number;
  y: number;
}

interface Tile {
  row: number;
  col: number;
  url: string;
  type: 'high' | 'low';
  distance: number;
}

// Zone constants (in pixels from viewport center)
const HIGHRES_RADIUS = 512;  // Visible area (1024x1024 viewport / 2)
const LOWRES_RADIUS = 1024;  // Border area for preview tiles
const CLEANUP_RADIUS = 1536; // Beyond this, unload tiles

const TileViewer: React.FC = () => {
  const [tileMeta, setTileMeta] = useState<TileMeta | null>(null);
  const [panState, setPanState] = useState<PanState>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<PanState>({ x: 0, y: 0 });
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  
  // Dynamic tile map: key is "r_c", value is Tile
  const tilesMapRef = useRef<Map<string, Tile>>(new Map());
  const [renderTrigger, setRenderTrigger] = useState<number>(0); // Force re-render
  
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportSize = 1024;
  const viewportCenter = viewportSize / 2;

  // Calculate distance from tile center to viewport center (in world coordinates)
  const calculateTileDistance = useCallback((row: number, col: number, centerX: number, centerY: number, tileWidth: number, tileHeight: number) => {
    const tileCenterX = col * tileWidth + tileWidth / 2;
    const tileCenterY = row * tileHeight + tileHeight / 2;
    const dx = tileCenterX - centerX;
    const dy = tileCenterY - centerY;
    return Math.sqrt(dx * dx + dy * dy);
  }, []);

  // Load a single tile (high-res or low-res)
  const loadTile = useCallback(async (row: number, col: number, type: 'high' | 'low', distance: number) => {
    try {
      const endpoint = type === 'high' ? `/api/tiles/${row}/${col}` : `/api/tiles/preview/${row}/${col}`;
      const response = await axios.get(endpoint, {
        responseType: 'blob',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      const imageUrl = URL.createObjectURL(response.data);
      return { row, col, url: imageUrl, type, distance };
    } catch (error) {
      console.warn(`Failed to load ${type} tile ${row},${col}:`, error);
      return null;
    }
  }, []);

  // Core function to update tiles based on current viewport
  const updateTiles = useCallback(async (meta: TileMeta, currentPanX: number, currentPanY: number) => {
    // Calculate world center of viewport
    const worldCenterX = currentPanX + viewportCenter;
    const worldCenterY = currentPanY + viewportCenter;

    // Calculate which tiles we need
    const highResTiles: Array<{row: number, col: number, distance: number}> = [];
    const lowResTiles: Array<{row: number, col: number, distance: number}> = [];

    // Scan a generous area around viewport to find tiles in each zone
    const scanRadius = Math.ceil(CLEANUP_RADIUS / Math.min(meta.tileWidth, meta.tileHeight)) + 2;
    const centerRow = Math.floor(worldCenterY / meta.tileHeight);
    const centerCol = Math.floor(worldCenterX / meta.tileWidth);

    for (let row = centerRow - scanRadius; row <= centerRow + scanRadius; row++) {
      for (let col = centerCol - scanRadius; col <= centerCol + scanRadius; col++) {
        // Check if tile exists
        if (row < meta.minRow || row > meta.maxRow || col < meta.minCol || col > meta.maxCol) {
          continue;
        }

        const distance = calculateTileDistance(row, col, worldCenterX, worldCenterY, meta.tileWidth, meta.tileHeight);

        // Categorize by zone
        if (distance <= HIGHRES_RADIUS) {
          highResTiles.push({ row, col, distance });
        } else if (distance <= LOWRES_RADIUS && meta.hasPreview) {
          lowResTiles.push({ row, col, distance });
        }
      }
    }

    // Sort by distance (closest first for prioritized loading)
    highResTiles.sort((a, b) => a.distance - b.distance);
    lowResTiles.sort((a, b) => a.distance - b.distance);

    const tilesMap = tilesMapRef.current;

    // Load high-res tiles (prioritized, batch load)
    const highResPromises = highResTiles
      .filter(t => !tilesMap.has(`${t.row}_${t.col}`) || tilesMap.get(`${t.row}_${t.col}`)!.type === 'low')
      .map(t => loadTile(t.row, t.col, 'high', t.distance));

    // Load low-res tiles (background, only if not already loaded)
    const lowResPromises = lowResTiles
      .filter(t => !tilesMap.has(`${t.row}_${t.col}`))
      .map(t => loadTile(t.row, t.col, 'low', t.distance));

    // Load high-res immediately
    const highResResults = await Promise.all(highResPromises);
    highResResults.forEach(tile => {
      if (tile) {
        const key = `${tile.row}_${tile.col}`;
        const existing = tilesMap.get(key);
        if (existing) {
          URL.revokeObjectURL(existing.url); // Clean up old URL
        }
        tilesMap.set(key, tile);
      }
    });

    // Load low-res in background
    Promise.all(lowResPromises).then(lowResResults => {
      lowResResults.forEach(tile => {
        if (tile) {
          const key = `${tile.row}_${tile.col}`;
          if (!tilesMap.has(key)) {
            tilesMap.set(key, tile);
          }
        }
      });
      setRenderTrigger(prev => prev + 1);
    });

    // Cleanup tiles beyond cleanup radius
    const tilesToRemove: string[] = [];
    tilesMap.forEach((tile, key) => {
      const distance = calculateTileDistance(tile.row, tile.col, worldCenterX, worldCenterY, meta.tileWidth, meta.tileHeight);
      if (distance > CLEANUP_RADIUS) {
        tilesToRemove.push(key);
        URL.revokeObjectURL(tile.url);
      }
    });
    tilesToRemove.forEach(key => tilesMap.delete(key));

    setRenderTrigger(prev => prev + 1);
  }, [calculateTileDistance, loadTile, viewportCenter]);

  // Fetch tile metadata on mount
  useEffect(() => {
    const fetchTileMeta = async () => {
      try {
        const response = await axios.get('/api/tiles/meta');
        const meta = response.data;
        setTileMeta(meta);
        
        // Calculate initial pan to center on centerRow/centerCol
        const worldCenterX = meta.centerCol * meta.tileWidth + meta.tileWidth / 2;
        const worldCenterY = meta.centerRow * meta.tileHeight + meta.tileHeight / 2;
        const initialPanX = worldCenterX - viewportCenter;
        const initialPanY = worldCenterY - viewportCenter;
        
        setPanState({ x: initialPanX, y: initialPanY });
        
        // Load initial tiles
        await updateTiles(meta, initialPanX, initialPanY);
        setIsInitialized(true);
      } catch (error) {
        console.error('Error fetching tile metadata:', error);
      }
    };

    fetchTileMeta();
  }, [updateTiles, viewportCenter]);

  // Update tiles when pan changes (with debouncing)
  useEffect(() => {
    if (!tileMeta || !isInitialized) return;

    const debounceTimer = setTimeout(() => {
      updateTiles(tileMeta, panState.x, panState.y);
    }, 150); // 150ms debounce

    return () => clearTimeout(debounceTimer);
  }, [panState, tileMeta, isInitialized, updateTiles]);

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

  if (!tileMeta || !isInitialized) {
    return (
      <div className="tile-viewer-container">
        <div className="loading">Loading tiles...</div>
      </div>
    );
  }

  // Get tiles from the map (renderTrigger forces re-render when tiles update)
  const tilesArray = Array.from(tilesMapRef.current.values());
  const lowResTiles = tilesArray.filter(t => t.type === 'low');
  const highResTiles = tilesArray.filter(t => t.type === 'high');

  console.log(`Rendering ${tilesArray.length} tiles (${highResTiles.length} high-res, ${lowResTiles.length} low-res), pan=(${panState.x.toFixed(0)},${panState.y.toFixed(0)}), trigger=${renderTrigger}`);

  return (
    <div className="tile-viewer-container">
      <div className="tile-viewer-info">
        Pan: ({panState.x.toFixed(0)}, {panState.y.toFixed(0)}) | 
        Center: ({tileMeta.centerRow}, {tileMeta.centerCol}) | 
        Tiles: {highResTiles.length} high-res + {lowResTiles.length} low-res
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
        {/* First pass: Render low-res preview tiles with blur */}
        {lowResTiles.map(tile => {
          const worldX = tile.col * tileMeta.tileWidth;
          const worldY = tile.row * tileMeta.tileHeight;
          const viewportX = worldX - panState.x;
          const viewportY = worldY - panState.y;
          
          return (
            <img
              key={`low_${tile.row}_${tile.col}`}
              src={tile.url}
              alt={`Preview ${tile.row},${tile.col}`}
              style={{
                position: 'absolute',
                left: viewportX,
                top: viewportY,
                width: tileMeta.tileWidth,
                height: tileMeta.tileHeight,
                objectFit: 'cover',
                filter: 'blur(2px)',
                opacity: 0.9,
                zIndex: 1,
                pointerEvents: 'none'
              }}
            />
          );
        })}

        {/* Second pass: Render high-res tiles on top */}
        {highResTiles.map(tile => {
          const worldX = tile.col * tileMeta.tileWidth;
          const worldY = tile.row * tileMeta.tileHeight;
          const viewportX = worldX - panState.x;
          const viewportY = worldY - panState.y;
          
          return (
            <img
              key={`high_${tile.row}_${tile.col}`}
              src={tile.url}
              alt={`Tile ${tile.row},${tile.col}`}
              style={{
                position: 'absolute',
                left: viewportX,
                top: viewportY,
                width: tileMeta.tileWidth,
                height: tileMeta.tileHeight,
                objectFit: 'cover',
                zIndex: 2,
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
