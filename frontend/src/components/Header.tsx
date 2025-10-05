import React from 'react';
import Logo from './Logo';
import Title from './Title';
import './Header.css';

const Header: React.FC = () => {
  return (
    <header className="header">
      <Logo />
      <Title text="Andromeda Galaxy Explorer" />
    </header>
  );
};

export default Header;
