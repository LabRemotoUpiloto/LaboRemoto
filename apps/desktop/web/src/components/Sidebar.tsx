import React from 'react'
import './Sidebar.css'

interface SidebarProps {
  isOpen: boolean
  toggleSidebar: () => void
  selectedPage: string
  onSelectPage: (page: string) => void
}

const items = [
  { id: 'connect', label: 'Connect', icon: '🖥️' },
  { id: 'hosts', label: 'Hosts', icon: '�' },
  { id: 'keychain', label: 'Keychain', icon: '🔑' },
  { id: 'port', label: 'Port Forwarding', icon: '🔀' },
  { id: 'snippets', label: 'Snippets', icon: '{}' },
  { id: 'known', label: 'Known Hosts', icon: '📡' },
  { id: 'logs', label: 'Logs', icon: '🕘' },
]

const Sidebar: React.FC<SidebarProps> = ({ isOpen, toggleSidebar, selectedPage, onSelectPage }) => {
  return (
    <aside className={`sidebar ${isOpen ? 'open' : ''}`} aria-label="Main navigation">
      <nav className="sidebar-nav">
        {items.map(it => (
          <button
            key={it.id}
            className={`nav-item ${selectedPage === it.id ? 'active' : ''}`}
            aria-current={selectedPage === it.id ? 'page' : undefined}
            onClick={() => onSelectPage(it.id)}
            title={it.label}
          >
            <span className="nav-pill">
              <span className="icon">{it.icon}</span>
              <span className="label">{it.label}</span>
            </span>
          </button>
        ))}
      </nav>
    </aside>
  )
}

export default Sidebar
