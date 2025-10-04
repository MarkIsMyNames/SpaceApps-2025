import React, { useEffect, useState } from 'react';
import axios from 'axios';
import Header from './components/Header';
import ImageViewer from './components/ImageViewer';
import './App.css';

const App: React.FC = () => {
  const [images, setImages] = useState<string[]>([]);

  useEffect(() => {
    const fetchImages = async () => {
      try {
        const response = await axios.get('/api/images');
        setImages(response.data);
      } catch (error) {
        console.error('Error fetching images:', error);
      }
    };

    fetchImages();
  }, []);

  return (
    <div className="app-container">
      <Header />
      <ImageViewer images={images} />
    </div>
  );
};

export default App;
