import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.js';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Não foi possível iniciar a interface.');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
