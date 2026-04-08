import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App.js';
import { DevTest } from './DevTest.js';

const isDevTest = window.location.pathname === '/devtest';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isDevTest ? <DevTest /> : <App />}
  </React.StrictMode>
);
