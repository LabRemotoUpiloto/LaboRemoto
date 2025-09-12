// App raíz: manejo de pestañas (Inicio persistente + sesiones) y navegación lateral.
import React, { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import './App.css'
import Header from './components/Header'
import Sidebar from './components/Sidebar'
import TerminalView from './components/TerminalView'
import ConnectForm from './components/ConnectForm'
import SavedHostsPage from './pages/SavedHostsPage'
import { connectFromHost } from './api/storage'
import { LoadingProvider } from './contexts/LoadingContext'
import GlobalLoader from './components/GlobalLoader'
import { ToastProvider } from './contexts/ToastContext'
import ToastContainer from './components/ToastContainer'
import { ThemeProvider } from './contexts/ThemeContext'
import ThemesPage from './pages/ThemesPage'
import SftpPage from './pages/SftpPage'

const App: React.FC = () => {
  // Representa una pestaña: 'home' (persistente) o 'session' (SSH)
  type Tab = { id: string; type: 'home' | 'session'; label: string }
  const HOME_ID = 'home'
  const [tabs, setTabs] = useState<Tab[]>([{ id: HOME_ID, type: 'home', label: 'Inicio' }])
  const [activeTabId, setActiveTabId] = useState<string>(HOME_ID)
  const [isSidebarOpen, setSidebarOpen] = useState(true)
  const [pendingHost, setPendingHost] = useState<any | null>(null)
  const [selectedPage, setSelectedPage] = useState<string>('connect') // subpágina dentro de Inicio

  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0]

  // Abre una nueva sesión si no existe, y la activa
  const openSession = (id: string) => {
    setTabs(prev => prev.some(t => t.id === id) ? prev : [...prev, { id, type: 'session', label: id }])
    setActiveTabId(id)
  }

  // Cierra pestaña (no permite cerrar Inicio) y re-calcula activa
  const closeTab = (id: string) => {
    if (id === HOME_ID) return
    setTabs(prev => {
      const next = prev.filter(t => t.id !== id)
      // recompute active fallback
      if (activeTabId === id) {
        const firstSession = next.find(t => t.type === 'session')
        setActiveTabId(firstSession ? firstSession.id : HOME_ID)
      }
      return next
    })
  }

  const handleNewSession = (id: string | null) => {
    if (!id) { setActiveTabId(HOME_ID); return }
    openSession(id)
  }

  const handleTabClick = (id: string) => {
    setActiveTabId(id)
  }

  // Al cerrar una sesión, pedir al backend que desconecte antes de remover la pestaña
  const handleCloseTab = async (id: string) => {
    try {
      await invoke('ssh_disconnect', { id })
      closeTab(id)
    } catch (e: any) {
      alert('No se pudo cerrar la sesión: ' + (e?.toString?.() ?? 'Error desconocido'))
    }
  }

  const toggleSidebar = () => {
    setSidebarOpen(!isSidebarOpen)
  }

  return (
    <LoadingProvider>
      <ToastProvider>
        <ThemeProvider>
  <div className="app-container">
        <Sidebar isOpen={isSidebarOpen} toggleSidebar={toggleSidebar} selectedPage={selectedPage} onSelectPage={(p)=>{ setActiveTabId(HOME_ID); setSelectedPage(p) }} />
        <div className={`main-content ${isSidebarOpen ? 'sidebar-open' : ''}`}>
          <Header
            tabs={tabs}
            activeTabId={activeTabId}
            onTabClick={handleTabClick}
            onCloseTab={handleCloseTab}
            onNewSession={() => setActiveTabId(HOME_ID)}
            toggleSidebar={toggleSidebar}
          />
          <main className="content-area">
            {/* Contenedor Home persistente */}
            <div style={{display: activeTab.type==='home' ? 'block' : 'none', height:'100%'}}>
              {selectedPage === 'connect' ? (
                <ConnectForm onConnected={handleNewSession} initialPayload={pendingHost} />
              ) : selectedPage === 'hosts' ? (
                <SavedHostsPage onConnect={async (h,p,u,pass) => {
                  try {
                    const sessionId = await connectFromHost(h, Number(p), u || '', pass || '')
                    if (sessionId) openSession(sessionId as any)
                  } catch (e) {
                    alert('Error connecting to host: ' + (e as any)?.toString?.())
                  }
                }} />
              ) : selectedPage === 'themes' ? (
                <ThemesPage />
              ) : selectedPage === 'sftp' ? (
                <SftpPage
                  sessions={tabs.filter(t=>t.type==='session').map(t=>t.id)}
                  activeSessionId={tabs.some(t=>t.id===activeTabId && t.type==='session') ? activeTabId : undefined}
                />
              ) : (
                <ConnectForm onConnected={handleNewSession} initialPayload={pendingHost} />
              )}
            </div>
            {/* Sesiones SSH persistentes */}
            {tabs.filter(t => t.type==='session').map(t => (
              <div key={t.id} style={{display: activeTabId===t.id ? 'flex':'none', height:'100%', width:'100%'}}>
                <TerminalView sessionId={t.id} />
              </div>
            ))}
          </main>
        </div>
          <GlobalLoader />
          <ToastContainer />
        </div>
        </ThemeProvider>
      </ToastProvider>
    </LoadingProvider>
  )
}

export default App
