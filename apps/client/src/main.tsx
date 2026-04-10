import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App.js';
import { DevTest } from './DevTest.js';
import { TestHarness } from './TestHarness.js';

const path = window.location.pathname;
const isDevTest = path === '/devtest';
const isTest = path === '/test';

const root = isTest ? <TestHarness /> : isDevTest ? <DevTest /> : <App />;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {root}
  </React.StrictMode>
);
