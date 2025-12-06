import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Initialize Miro SDK
const initMiro = async () => {
  if (typeof window !== 'undefined' && (window as any).miro) {
    const miro = (window as any).miro;
    try {
      // Register the icon click handler to open the panel
      await miro.board.ui.on('icon:click', async () => {
        await miro.board.ui.openPanel({ url: '' });
      });
    } catch (err) {
      console.error('Miro initialization error:', err);
    }
  }
};

initMiro();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
