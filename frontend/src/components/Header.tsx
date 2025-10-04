import React from 'react';
import Logo from './Logo';
import Title from './Title';
import './Header.css';

const Header: React.FC = () => {
  return (
    <header className="header">
      <div className="header-title">
        <Logo />
        <Title text="Andromeda Galaxy Explorer" />
      </div>
    </header>
  );
};

export default Header;
