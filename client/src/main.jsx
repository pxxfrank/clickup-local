import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import './styles.css';
import './styles-pages.css';
import './styles-views.css';
import './styles-overlays.css';
import './styles-features.css';
import './styles-responsive.css';
import './styles-apple-home.css';
import './styles-apple-theme.css';

const savedTheme = localStorage.getItem('clickup-theme');
const initialTheme =
  savedTheme === 'light' || savedTheme === 'dark'
    ? savedTheme
    : window.matchMedia?.('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
document.documentElement.dataset.theme = initialTheme;

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
