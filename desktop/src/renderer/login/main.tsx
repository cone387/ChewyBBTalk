import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { LoginWindow } from './LoginWindow';
import './login.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LoginWindow />
  </StrictMode>,
);
