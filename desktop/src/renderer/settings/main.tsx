import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SettingsWindow } from './SettingsWindow';
import './settings.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SettingsWindow />
  </StrictMode>,
);
