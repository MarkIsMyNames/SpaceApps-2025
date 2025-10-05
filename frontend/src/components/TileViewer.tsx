import React, { useEffect, useState, useCallback, useRef } from 'react';
import axios from 'axios';
import PreviewTile from './PreviewTile';
import HighResTile from './HighResTile';
import './TileViewer.css';

type TileMeta = {
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
};

type Tile = {
  row: number;
  col: number;
  url: string;
  type: 'high' | 'low';
  distance: number;
};

// Zone constants (in pixels from viewport edges)
const HIGHRES_MARGIN = 0;     // High-res: exactly what's visible in viewport
const LOWRES_MARGIN = 768;    // Low-res: 768px border around viewport for smooth panning
const CLEANUP_MARGIN = 3096;  // Cleanup: 3096px border - unload tiles beyond this

const TileViewer: React.FC = () => {
  const [tileMeta, setTileMeta] = useState<TileMeta | null>(null);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartY, setDragStartY] = useState(0);
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  const [, forceUpdate] = useState(0);

  // Dynamic tile map: key is "r_c", value is Tile
  const tilesMapRef = useRef<Map<string, Tile>>(new Map());

  // Track in-flight requests to prevent duplicates
  const loadingTilesRef = useRef<Set<string>>(new Set());

  const containerRef = useRef<HTMLDivElement>(null);
  const viewportWidth = 1024;
  const viewportHeight = 512;
  const viewportCenterX = viewportWidth / 2;
  const viewportCenterY = viewportHeight / 2;

  // Calculate distance from tile center to viewport center (for center-out ordering)
  const calculateTileDistance = useCallback((row: number, col: number, centerX: number, centerY: number, tileWidth: number, tileHeight: number) => {
    const tileCenterX = col * tileWidth + tileWidth / 2;
    const tileCenterY = row * tileHeight + tileHeight / 2;
    const dx = tileCenterX - centerX;
    const dy = tileCenterY - centerY;
    return Math.sqrt(dx * dx + dy * dy);
  }, []);

  // Check if tile is within a rectangular zone (viewport + margin)
  const isTileInZone = useCallback((row: number, col: number, panX: number, panY: number, tileWidth: number, tileHeight: number, margin: number) => {
    const tileLeft = col * tileWidth;
    const tileRight = (col + 1) * tileWidth;
    const tileTop = row * tileHeight;
    const tileBottom = (row + 1) * tileHeight;

    const zoneLeft = panX - margin;
    const zoneRight = panX + viewportWidth + margin;
    const zoneTop = panY - margin;
    const zoneBottom = panY + viewportHeight + margin;

    // Check if tile overlaps with zone
    return tileRight > zoneLeft && tileLeft < zoneRight &&
           tileBottom > zoneTop && tileTop < zoneBottom;
  }, [viewportWidth, viewportHeight]);

  // Load a single tile (high-res or low-res) - optimized to use direct URLs
  const loadTile = useCallback(async (row: number, col: number, type: 'high' | 'low', distance: number) => {
    const key = `${type}_${row}_${col}`;

    // Skip if already loading OR already loaded in the map
    if (loadingTilesRef.current.has(key) || tilesMapRef.current.has(key)) {
      return null;
    }

    loadingTilesRef.current.add(key);

    try {
      // Use direct URL instead of blob - much faster!
      const endpoint = type === 'high' ? `/api/tiles/${row}/${col}` : `/api/tiles/preview/${row}/${col}`;

      // Preload the image to ensure it's in cache
      return new Promise<Tile | null>((resolve) => {
        const img = new Image();
        img.onload = () => {
          loadingTilesRef.current.delete(key);
          resolve({ row, col, url: endpoint, type, distance });
        };
        img.onerror = () => {
          loadingTilesRef.current.delete(key);
          console.warn(`Failed to load ${type} tile ${row},${col}`);
          resolve(null);
        };
        img.src = endpoint;
      });
    } catch (error) {
      loadingTilesRef.current.delete(key);
      console.warn(`Failed to load ${type} tile ${row},${col}:`, error);
      return null;
    }
  }, []);

  // Core function to update tiles based on current viewport
  const updateTiles = useCallback(async (meta: TileMeta, currentPanX: number, currentPanY: number) => {
    // Calculate world center of viewport
    const worldCenterX = currentPanX + viewportCenterX;
    const worldCenterY = currentPanY + viewportCenterY;

    // Calculate which tiles we need using rectangular zones
    const highResTiles: Array<{row: number, col: number, distance: number}> = [];
    const lowResTiles: Array<{row: number, col: number, distance: number}> = [];

    // Calculate scan area based on cleanup margin
    const scanTilesX = Math.ceil((viewportWidth + CLEANUP_MARGIN * 2) / meta.tileWidth) + 2;
    const scanTilesY = Math.ceil((viewportHeight + CLEANUP_MARGIN * 2) / meta.tileHeight) + 2;
    const centerRow = Math.floor(worldCenterY / meta.tileHeight);
    const centerCol = Math.floor(worldCenterX / meta.tileWidth);

    for (let row = centerRow - scanTilesY; row <= centerRow + scanTilesY; row++) {
      for (let col = centerCol - scanTilesX; col <= centerCol + scanTilesX; col++) {
        // Check if tile exists in the tileset
        if (row < meta.minRow || row > meta.maxRow || col < meta.minCol || col > meta.maxCol) {
          continue;
        }

        const distance = calculateTileDistance(row, col, worldCenterX, worldCenterY, meta.tileWidth, meta.tileHeight);

        // Categorize by rectangular zone
        if (isTileInZone(row, col, currentPanX, currentPanY, meta.tileWidth, meta.tileHeight, HIGHRES_MARGIN)) {
          highResTiles.push({ row, col, distance });
        } else if (isTileInZone(row, col, currentPanX, currentPanY, meta.tileWidth, meta.tileHeight, LOWRES_MARGIN) && meta.hasPreview) {
          lowResTiles.push({ row, col, distance });
        }
      }
    }

    // Sort by distance (closest first for prioritized loading)
    highResTiles.sort((a, b) => a.distance - b.distance);
    lowResTiles.sort((a, b) => a.distance - b.distance);

    const tilesMap = tilesMapRef.current;

    // Filter tiles to load (avoid duplicates and unnecessary requests)
    const highResToLoad = highResTiles.filter(t => {
      const key = `high_${t.row}_${t.col}`;
      return !tilesMap.has(key);
    });

    const lowResToLoad = lowResTiles.filter(t => {
      const key = `low_${t.row}_${t.col}`;
      return !tilesMap.has(key);
    });

    // Load high-res tiles in smaller batches to avoid browser connection limits
    const BATCH_SIZE = 12; // Increased batch size for better performance with direct URLs
    const loadInBatches = async (tiles: typeof highResToLoad, type: 'high' | 'low') => {
      const results: (Tile | null)[] = [];
      for (let i = 0; i < tiles.length; i += BATCH_SIZE) {
        const batch = tiles.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(
          batch.map(t => loadTile(t.row, t.col, type, t.distance))
        );
        results.push(...batchResults);

        // Update UI incrementally after each batch for better perceived performance
        batchResults.forEach(tile => {
          if (tile) {
            const key = `${tile.type}_${tile.row}_${tile.col}`;
            tilesMap.set(key, tile);
          }
        });

        // Force re-render to show newly loaded tiles
        forceUpdate(prev => prev + 1);
      }
      return results;
    };

    // Load high-res tiles (tiles are added incrementally in loadInBatches)
    await loadInBatches(highResToLoad, 'high');

    // Load low-res in background (tiles are added incrementally in loadInBatches)
    if (lowResToLoad.length > 0 && meta.hasPreview) {
      loadInBatches(lowResToLoad, 'low');
    }

    // Cleanup tiles beyond cleanup margin (no need to revoke URLs since we're using direct URLs)
    const tilesToRemove: string[] = [];
    tilesMap.forEach((tile, key) => {
      const inCleanupZone = isTileInZone(tile.row, tile.col, currentPanX, currentPanY, meta.tileWidth, meta.tileHeight, CLEANUP_MARGIN);
      if (!inCleanupZone) {
        tilesToRemove.push(key);
      }
    });
    tilesToRemove.forEach(key => tilesMap.delete(key));

  }, [calculateTileDistance, isTileInZone, loadTile, viewportCenterX, viewportCenterY, viewportWidth, viewportHeight]);

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
        const initialPanX = worldCenterX - viewportCenterX;
        const initialPanY = worldCenterY - viewportCenterY;
        
        setPanX(initialPanX);
        setPanY(initialPanY);

        // Load initial tiles
        await updateTiles(meta, initialPanX, initialPanY);
        setIsInitialized(true);
      } catch (error) {
        console.error('Error fetching tile metadata:', error);
      }
    };

    fetchTileMeta();
  }, [updateTiles, viewportCenterX, viewportCenterY]);

  // Update tiles when pan changes (with debouncing)
  useEffect(() => {
    if (!tileMeta || !isInitialized) return;

    const debounceTimer = setTimeout(() => {
      updateTiles(tileMeta, panX, panY);
    }, 100); // 100ms debounce - balance between responsiveness and performance

    return () => clearTimeout(debounceTimer);
  }, [panX, panY, tileMeta, isInitialized, updateTiles]);

  // Mouse event handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStartX(e.clientX + panX);
    setDragStartY(e.clientY + panY);
  }, [panX, panY]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging && tileMeta) {
      const newPanX = dragStartX - e.clientX;
      const newPanY = dragStartY - e.clientY;

      const updatePan = () => {
        setPanX(newPanX);
        setPanY(newPanY);
      };
      requestAnimationFrame(updatePan);
    }
  }, [isDragging, dragStartX, dragStartY, tileMeta]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Touch event handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    setIsDragging(true);
    setDragStartX(touch.clientX + panX);
    setDragStartY(touch.clientY + panY);
  }, [panX, panY]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (isDragging && tileMeta) {
      const touch = e.touches[0];
      const newPanX = dragStartX - touch.clientX;
      const newPanY = dragStartY - touch.clientY;

      const updatePan = () => {
        setPanX(newPanX);
        setPanY(newPanY);
      };
      requestAnimationFrame(updatePan);
    }
  }, [isDragging, dragStartX, dragStartY, tileMeta]);

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
  const highResTiles = tilesArray.filter(t => t.type === 'high');

  // ALWAYS show all low-res tiles - they render underneath high-res with lower z-index
  // This prevents black flicker during the high-res fade-in
  const lowResTiles = tilesArray.filter(t => t.type === 'low');

  return (
    <div className="tile-viewer-container">
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
          width: viewportWidth,
          height: viewportHeight,
          overflow: 'hidden',
          position: 'relative',
          backgroundColor: '#000'
        }}
      >
        {/* First pass: Render low-res preview tiles with blur */}
        {lowResTiles.map(tile => {
          const worldX = tile.col * tileMeta.tileWidth;
          const worldY = tile.row * tileMeta.tileHeight;
          const viewportX = worldX - panX;
          const viewportY = worldY - panY;

          return (
            <PreviewTile
              key={`low_${tile.row}_${tile.col}`}
              row={tile.row}
              col={tile.col}
              url={tile.url}
              viewportX={viewportX}
              viewportY={viewportY}
              tileWidth={tileMeta.tileWidth}
              tileHeight={tileMeta.tileHeight}
            />
          );
        })}

        {/* Second pass: Render high-res tiles on top */}
        {highResTiles.map(tile => {
          const worldX = tile.col * tileMeta.tileWidth;
          const worldY = tile.row * tileMeta.tileHeight;
          const viewportX = worldX - panX;
          const viewportY = worldY - panY;

          return (
            <HighResTile
              key={`high_${tile.row}_${tile.col}`}
              row={tile.row}
              col={tile.col}
              url={tile.url}
              viewportX={viewportX}
              viewportY={viewportY}
              tileWidth={tileMeta.tileWidth}
              tileHeight={tileMeta.tileHeight}
            />
          );
        })}
      </div>
    </div>
  );
};

export default TileViewer;
