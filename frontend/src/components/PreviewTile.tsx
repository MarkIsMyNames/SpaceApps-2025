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
        left: viewportX - 2,
        top: viewportY - 2,
        width: tileWidth + 4,
        height: tileHeight + 4,
        objectFit: 'cover',
        imageRendering: 'auto',
        filter: 'blur(2px)',
        zIndex: 1,
        pointerEvents: 'none',
        display: 'block',
        transform: 'translateZ(0)'
      }}
    />
  );
};

export default PreviewTile;
