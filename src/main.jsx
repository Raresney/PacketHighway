import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { connect } from './net/socket';
import './ui/hud.css';

connect();

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
