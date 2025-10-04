import React from 'react';
import Header from './components/Header';
import TileViewer from './components/TileViewer';
import './App.css';

const App: React.FC = () => {
  return (
    <div className="app-container">
      <Header />
      <TileViewer />
    </div>
  );
};

export default App;
