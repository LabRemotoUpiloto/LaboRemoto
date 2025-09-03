import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/globals.css';
import './App.css';
import './components/Header.css';
import './components/Sidebar.css';
import './components/HomeScreen.css';
import './components/TerminalView.css';
import './components/TerminalPane.css';
import './components/ChatPane.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
