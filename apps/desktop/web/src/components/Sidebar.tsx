import React, { useEffect, useState } from 'react';
import './Sidebar.css';
import { listHostFiles, listHostEntries, connectFromHost } from '../api/storage';

interface SidebarProps {
  isOpen: boolean;
  toggleSidebar: () => void;
  onOpenHome: (payload?: any) => void; // navigate to home (ConnectForm) with optional payload
  onCreateSession?: (id: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen, toggleSidebar, onOpenHome, onCreateSession }) => {
  const [hasSavedHosts, setHasSavedHosts] = useState(false);
  const [entries, setEntries] = useState<any[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const files = await listHostFiles();
        if (mounted) setHasSavedHosts((files || []).length > 0);
        const ents = await listHostEntries();
        if (mounted) setEntries(ents || []);
      } catch (_e) {
        // ignore
      }
    })();
    return () => { mounted = false };
  }, []);

  return (
    <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
      <nav className="sidebar-nav">
        {hasSavedHosts && (
          <a href="#" className="nav-item" onClick={(e) => { e.preventDefault(); onOpenHome(); }}>New Host</a>
        )}

        {entries.map((it, idx) => (
          <a key={idx} href="#" className="nav-item" onClick={async (e) => {
            e.preventDefault();
            const p = it.payload;
            // Open Home and show prefilled form immediately
            onOpenHome({ host: p.host, port: p.port, user: p.user, password: p.password, autoConnect: true });
            try {
              // Attempt background connect using same credentials
              const sessionId = await connectFromHost(p.host, p.port, p.user, p.password);
              if (sessionId) onCreateSession?.(sessionId);
            } catch (err) {
              console.error('connectFromHost', err);
              alert('Error al conectar desde host guardado: ' + err?.toString?.());
            }
          }}>{it.payload?.host ?? 'saved host'}</a>
        ))}

        <a href="#" className="nav-item">SFTP</a>
        <a href="#" className="nav-item">Logs</a>
        <a href="#" className="nav-item">Temas</a>
        <a href="#" className="nav-item">Info</a>
      </nav>
    </aside>
  );
};

export default Sidebar;
