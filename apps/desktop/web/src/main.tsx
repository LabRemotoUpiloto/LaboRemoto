import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/globals.css';
import './App.css';
import './components/layout/Header.css';
import './components/layout/Sidebar.css';
import './components/terminal/TerminalView.css';
import './components/terminal/TerminalPane.css';
import './components/ChatPane.css';

if (!import.meta.env.DEV) {
  const n = () => {};
  console.log = n;
  console.debug = n;
  console.info = n;
  console.warn = n;
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
