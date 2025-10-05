import React from 'react';

type PreviewTileProps = {
  row: number;
  col: number;
  url: string;
  viewportX: number;
  viewportY: number;
  tileWidth: number;
  tileHeight: number;
};

const PreviewTile: React.FC<PreviewTileProps> = ({
  row,
  col,
  url,
  viewportX,
  viewportY,
  tileWidth,
  tileHeight,
}) => {
  return (
    <img
      key={`low_${row}_${col}`}
      src={url}
      alt={`Preview ${row},${col}`}
      className="tile-fade-in"
      style={{
        position: 'absolute',
        left: viewportX - 1,
        top: viewportY - 1,
        width: tileWidth + 2,
        height: tileHeight + 2,
        objectFit: 'fill',
        imageRendering: 'auto',
        filter: 'blur(3px)',
        opacity: 0.95,
        zIndex: 1,
        pointerEvents: 'none',
        display: 'block',
        transform: 'translateZ(0)'
      }}
    />
  );
};

export default PreviewTile;
