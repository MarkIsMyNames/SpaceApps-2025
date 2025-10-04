import React from 'react';
import './Logo.css';

const Logo: React.FC = () => {
  return (
    <div className="logo">
      <img
        src="Debug.jpeg"
        alt="Andromeda Galaxy Explorer Logo"
        className="logo-image"
      />
    </div>
  );
};

export default Logo;
