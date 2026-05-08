import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Ball } from './Ball';
import './ball.css';

const container = document.getElementById('root');
if (!container) throw new Error('#root not found');

createRoot(container).render(
  <StrictMode>
    <Ball />
  </StrictMode>,
);
