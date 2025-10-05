import React from 'react';
import Logo from './Logo';
import Title from './Title';
import './Header.css';

const Header: React.FC = () => {
  return (
    <header className="header">
      <div className="header-left">
        <Logo />
        <Title text="Debugonauts Space Explorer" />
      </div>
      <div className="header-right">
        {/* <span className="surface-label">Mars Surface</span> */}
        <select className="surface-dropdown">
          <option value="mars">Mars Surface</option>
          <option value="andromeda">Andromeda Galaxy</option>
        </select>
      </div>
    </header>
  );
};

export default Header;
