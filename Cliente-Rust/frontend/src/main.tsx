import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/globals.css';
import './App.css';


if (!import.meta.env.DEV) {
  const n = () => {};
  console.log = n;
  console.debug = n;
  console.info = n;
  console.warn = n;
  console.error = n;
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
