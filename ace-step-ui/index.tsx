import React from 'react';
import ReactDOM from 'react-dom/client';
import './i18n'; // Initialize i18next before rendering
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { ResponsiveProvider } from './context/ResponsiveContext';
import { ErrorBoundary } from './components/ErrorBoundary';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <ResponsiveProvider>
          <App />
        </ResponsiveProvider>
      </AuthProvider>
    </ErrorBoundary>
  </React.StrictMode>
);