import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ComposeWindow } from './ComposeWindow';
import './compose.css';

const container = document.getElementById('root');
if (!container) throw new Error('#root not found');

createRoot(container).render(
  <StrictMode>
    <ComposeWindow />
  </StrictMode>,
);
