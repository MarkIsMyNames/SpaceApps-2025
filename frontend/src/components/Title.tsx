import React from 'react';
import './Title.css';

type TitleProps = {
  text: string;
};

const Title: React.FC<TitleProps> = ({ text }) => {
  return <h2 className="title">{text}</h2>;
};

export default Title;
