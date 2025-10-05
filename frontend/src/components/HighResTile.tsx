import React from 'react';

type HighResTileProps = {
  row: number;
  col: number;
  url: string;
  viewportX: number;
  viewportY: number;
  tileWidth: number;
  tileHeight: number;
};

const HighResTile: React.FC<HighResTileProps> = ({
  url,
  viewportX,
  viewportY,
  tileWidth,
  tileHeight,
}) => {
  return (
    <img
      src={url}
      alt=""
      className="tile-fade-in"
      loading="eager"
      decoding="async"
      style={{
        position: 'absolute',
        left: viewportX - 0.5,
        top: viewportY - 0.5,
        width: tileWidth + 1,
        height: tileHeight + 1,
        objectFit: 'cover',
        imageRendering: 'auto',
        zIndex: 2,
        pointerEvents: 'none',
        display: 'block',
        backgroundColor: 'transparent'
      }}
    />
  );
};

export default HighResTile;
