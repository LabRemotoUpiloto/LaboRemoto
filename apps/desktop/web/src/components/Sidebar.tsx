import React from 'react'
import './Sidebar.css'
import { getVersion } from '@tauri-apps/api/app'
import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { useToasts } from '../contexts/ToastContext'

interface SidebarProps {
  isOpen: boolean
  toggleSidebar: () => void
  selectedPage: string
  onSelectPage: (page: string) => void
}

const items = [
  { id: 'connect', label: 'Connect', icon: '🖥️' },
  // simple emoji icons for now; consider replacing with SVG react components later
  { id: 'hosts', label: 'Hosts', icon: '🧭' },
  { id: 'themes', label: 'Temas', icon: '🎨' },
  { id: 'sftp', label: 'SFTP', icon: '📂' },
  { id: 'snippets', label: 'Snippets', icon: '📎' },
]

const Sidebar: React.FC<SidebarProps> = ({ isOpen, toggleSidebar, selectedPage, onSelectPage }) => {
  const [appVersion, setAppVersion] = React.useState<string>('')
  const [checking, setChecking] = React.useState(false)
  const { push } = useToasts()
  React.useEffect(() => { getVersion().then(setAppVersion).catch(() => setAppVersion('')) }, [])

  const onCheckUpdate = async () => {
    try {
      setChecking(true)
      push({ type: 'info', message: 'Buscando actualización…' }, 2500)
      const update = await check()
      if (update) {
        push({ type: 'info', message: `Actualización ${update.version} disponible. Descargando…` }, 4000)
        await update.downloadAndInstall((event) => {
          switch (event.event) {
            case 'Started':
              console.log(`Update download started: ${event.data.contentLength} bytes`)
              break
            case 'Progress':
              console.log(`Downloaded ${event.data.chunkLength} bytes chunk`)
              break
            case 'Finished':
              console.log('Update download finished')
              break
          }
        })
        push({ type: 'success', message: 'Actualización instalada. Reiniciando…' }, 3000)
        await relaunch()
      } else {
        console.log('No updates available')
        push({ type: 'info', message: 'No hay actualizaciones disponibles' }, 3500)
      }
    } catch (e) {
      console.error('Updater error', e)
      let detail = ''
      if (typeof e === 'string') detail = e
      else if (e && typeof (e as any).message === 'string') detail = (e as any).message
      else { try { detail = JSON.stringify(e) } catch { detail = String(e) } }
      const msg = detail ? `Error al buscar/instalar actualización: ${detail}` : 'Error al buscar/instalar actualización. Revisa tu conexión o inténtalo más tarde.'
      push({ type: 'error', message: msg }, 7000)
    } finally { setChecking(false) }
  }
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
        <button
          className="nav-item"
          onClick={onCheckUpdate}
          title="Buscar actualización"
          disabled={checking}
        >
          <span className="nav-pill">
            <span className="icon" aria-hidden>⟳</span>
            <span className="label">{checking ? 'Buscando…' : 'Buscar actualización'}</span>
          </span>
        </button>
      </nav>
      <div className="sidebar-footer">
        {appVersion && <span className="version-badge">v{appVersion}</span>}
      </div>
    </aside>
  )
}

export default Sidebar
