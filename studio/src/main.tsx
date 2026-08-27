import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/base.css';

const host = document.getElementById('root');
if (!host) throw new Error('Root element missing');

createRoot(host).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
