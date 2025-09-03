import React from 'react';
import './Sidebar.css';

interface SidebarProps {
  isOpen: boolean;
  toggleSidebar: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen, toggleSidebar }) => {
  return (
    <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
      <nav className="sidebar-nav">
        <a href="#" className="nav-item">Host</a>
        <a href="#" className="nav-item">SFTP</a>
        <a href="#" className="nav-item">Logs</a>
        <a href="#" className="nav-item">Temas</a>
        <a href="#" className="nav-item">Info</a>
      </nav>
    </aside>
  );
};

export default Sidebar;
