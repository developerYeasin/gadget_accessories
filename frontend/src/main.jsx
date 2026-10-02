import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App';
import { StoreProvider } from './context/StoreContext';
import './index.css';
import { registerServiceWorker } from './api/push';

registerServiceWorker();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <StoreProvider>
        <App />
        <Toaster
          position="top-center"
          toastOptions={{ style: { background: '#16181f', color: '#fff', border: '1px solid #3a3222' } }}
        />
      </StoreProvider>
    </BrowserRouter>
  </React.StrictMode>
);
