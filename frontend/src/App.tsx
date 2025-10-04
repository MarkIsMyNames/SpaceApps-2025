import React, { useEffect, useState } from 'react';
import axios from 'axios';

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
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <h1>Image Gallery</h1>
      {images.length > 0 ? (
        images.map((image: string) => (
          <img 
            key={image} 
            src={`http://localhost:5000/images/${image}`} 
            alt={image} 
            style={{ width: '300px', margin: '10px' }} 
          />
        ))
      ) : (
        <p>No images found.</p>
      )}
    </div>
  );
};

export default App;
