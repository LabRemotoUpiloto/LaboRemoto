// App raíz: manejo de pestañas (Inicio persistente + sesiones) y navegación lateral.
import React, { useEffect, useState } from 'react'
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
import SnippetsPage from './pages/SnippetsPage'
import ConfirmModal from './components/ConfirmModal'
import ChatPane from './components/ChatPane'
import PinsPanel from './components/PinsPanel'
import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'

const App: React.FC = () => {
  // Representa una pestaña: 'home' (persistente) o 'session' (SSH)
  type Tab = { id: string; type: 'home' | 'session'; label: string }
  const HOME_ID = 'home'
  const [tabs, setTabs] = useState<Tab[]>([{ id: HOME_ID, type: 'home', label: 'Inicio' }])
  const [activeTabId, setActiveTabId] = useState<string>(HOME_ID)
  const [isSidebarOpen, setSidebarOpen] = useState(true)
  const [sessionMeta, setSessionMeta] = useState<Record<string,{ label: string }>>({})
  const [pendingHost, setPendingHost] = useState<any | null>(null)
  const [selectedPage, setSelectedPage] = useState<string>('connect') // subpágina dentro de Inicio
  const [updateInfo, setUpdateInfo] = useState<null | { version: string; notes?: string }>(null)
  const [updating, setUpdating] = useState(false)
  const [isCameraOpen, setCameraOpen] = useState(false)
  const [isPinsPanelOpen, setPinsPanelOpen] = useState(false)

  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0]

  // Debug: ver estados
  useEffect(() => {
    console.log('🔍 Debug Panel States:', {
      isPinsPanelOpen,
      isCameraOpen,
      activeTabType: activeTab.type,
      activeTabLabel: activeTab.label,
      shouldShowPanel: isPinsPanelOpen && activeTab.type === 'session'
    })
  }, [isPinsPanelOpen, isCameraOpen, activeTab])

  // Abre una nueva sesión si no existe, y la activa
  const openSession = (id: string, label?: string) => {
    setTabs(prev => {
      const exists = prev.some(t => t.id === id)
      if (exists) {
        return prev.map(t => (t.id === id && label) ? { ...t, label } : t)
      }
      return [...prev, { id, type: 'session', label: label || sessionMeta[id]?.label || id }]
    })
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

  const handleNewSession = (info: { id: string; label?: string } | null) => {
    if (!info) { setActiveTabId(HOME_ID); return }
    const { id, label } = info
    if (label) setSessionMeta(prev => ({ ...prev, [id]: { label } }))
    openSession(id, label)
  }

  const handleTabClick = (id: string) => {
    setActiveTabId(id)
  }

  // Mantiene sincronizadas las etiquetas de pestañas con los alias en sessionMeta
  useEffect(() => {
    setTabs(prev => prev.map(t => (
      t.type === 'session' && sessionMeta[t.id]?.label && t.label !== sessionMeta[t.id].label
        ? { ...t, label: sessionMeta[t.id].label }
        : t
    )))
  }, [sessionMeta])

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
    setSidebarOpen(prev => {
      const next = !prev
      // Avisar a la UI que el layout cambiará (inicio)
      try { window.dispatchEvent(new CustomEvent('app:sidebar-toggled', { detail: { isOpen: next, phase: 'start' } })) } catch {}
      // Aviso tras el siguiente frame, por si hay cálculos vinculados al DOM
      try { requestAnimationFrame(() => window.dispatchEvent(new CustomEvent('app:sidebar-toggled', { detail: { isOpen: next, phase: 'frame' } }))) } catch {}
      // Aviso al final de la transición CSS (~300ms declarados en App.css)
      try { window.setTimeout(() => window.dispatchEvent(new CustomEvent('app:sidebar-toggled', { detail: { isOpen: next, phase: 'end' } })), 320) } catch {}
      return next
    })
  }



  // Check for updates on startup (once)
  useEffect(() => {
    (async () => {
      try {
        const upd = await check()
        if (upd) {
          setUpdateInfo({ version: upd.version, notes: upd.body })
        }
      } catch (e) {
        console.warn('Auto-update check failed', e)
      }
    })()
  }, [])

  const confirmInstallUpdate = async () => {
    if (!updateInfo) return
    try {
      setUpdating(true)
      const upd = await check()
      if (upd) {
        await upd.downloadAndInstall()
        await relaunch()
      } else {
        setUpdateInfo(null)
      }
    } catch (e) {
      console.error('Update install failed', e)
      setUpdateInfo(null)
    } finally {
      setUpdating(false)
    }
  }

  const isPinsVisible = isPinsPanelOpen && activeTab.type === 'session'

  return (
    <LoadingProvider>
      <ToastProvider>
        <ThemeProvider>
          <div className={`app-container ${isSidebarOpen ? 'sidebar-open' : 'sidebar-collapsed'} ${isPinsVisible ? 'pins-open' : ''}`}>
            <Sidebar
              isOpen={isSidebarOpen}
              toggleSidebar={toggleSidebar}
              selectedPage={selectedPage}
              onSelectPage={(p) => {
                // No cambiar el tab activo si se selecciona pines
                if (p !== 'pins') {
                  setActiveTabId(HOME_ID)
                }
                setSelectedPage(p)
              }}
              activeSessionId={activeTab.type === 'session' ? activeTab.label : null}
              isCameraOpen={isCameraOpen}
              isPinsPanelOpen={isPinsPanelOpen}
              onToggleCamera={() => setCameraOpen(prev => !prev)}
              onTogglePins={() => setPinsPanelOpen(prev => !prev)}
            />
            {isPinsVisible && (
              <aside className="pins-panel" aria-label="Panel de pines GPIO">
                <div className="pins-panel__header">
                  <strong className="pins-panel__title">📌 Pines GPIO</strong>
                  <button
                    onClick={() => setPinsPanelOpen(false)}
                    className="pins-panel__close-button"
                    type="button"
                    title="Cerrar panel"
                    aria-label="Cerrar panel de pines"
                  >
                    ×
                  </button>
                </div>
                <div className="pins-panel__content">
                  <PinsPanel sessionId={activeTab.id} />
                </div>
              </aside>
            )}
            <div className={`main-content ${isSidebarOpen ? 'sidebar-open' : ''}`}>
          <Header
            tabs={tabs}
            activeTabId={activeTabId}
            onTabClick={handleTabClick}
            onCloseTab={handleCloseTab}
            onNewSession={() => { setActiveTabId(HOME_ID); setSelectedPage('connect'); }}
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
                    if (sessionId) {
                      const label = (u? `${u}@`:'') + h
                      setSessionMeta(prev => ({ ...prev, [String(sessionId)]: { label } }))
                      openSession(String(sessionId), label)
                    }
                  } catch (e) {
                    alert('Error connecting to host: ' + (e as any)?.toString?.())
                  }
                }} />
              ) : selectedPage === 'themes' ? (
                <ThemesPage />
              ) : selectedPage === 'sftp' ? (
                <SftpPage
                  sessions={tabs.filter(t=>t.type==='session').map(t=>t.id)}
                  sessionsMeta={sessionMeta}
                  activeSessionId={tabs.some(t=>t.id===activeTabId && t.type==='session') ? activeTabId : undefined}
                />
              ) : (
                <ConnectForm onConnected={handleNewSession} initialPayload={pendingHost} />
              )}
            </div>
            {/* Sesiones SSH persistentes */}
            {tabs.filter(t => t.type==='session').map(t => (
              <div key={t.id} style={{display: activeTabId===t.id ? 'flex':'none', height:'100%', width:'100%', flexDirection: (selectedPage !== 'connect' && selectedPage !== 'hosts') ? 'column' : 'row'}}>
                {selectedPage === 'sftp' ? (
                  <>
                    <div style={{ height: '25%', width: '100%' }}>
                      <TerminalView sessionId={t.id} isCameraOpen={isCameraOpen} />
                    </div>
                    <div style={{ height: '75%', width: '100%' }}>
                      <SftpPage />
                    </div>
                  </>
                ) : selectedPage === 'snippets' ? (
                  <>
                    <div style={{ height: '25%', width: '100%' }}>
                      <TerminalView sessionId={t.id} isCameraOpen={isCameraOpen} />
                    </div>
                    <div style={{ height: '75%', width: '100%' }}>
                      <SnippetsPage />
                    </div>
                  </>
                ) : (
                  <TerminalView sessionId={t.id} isCameraOpen={isCameraOpen} />
                )}
              </div>
            ))}
          </main>
            </div>
          </div>
          <GlobalLoader />
          <ToastContainer />
          <ConfirmModal
            open={!!updateInfo}
            title={updateInfo ? `Nueva versión ${updateInfo.version}` : 'Actualización disponible'}
            message={updateInfo?.notes || 'Hay una actualización disponible. ¿Deseas instalarla ahora?'}
            onConfirm={confirmInstallUpdate}
            onCancel={() => setUpdateInfo(null)}
            confirmLabel="Instalar y reiniciar"
            cancelLabel="Ahora no"
            confirmClassName="new"
            loading={updating}
          />
        </ThemeProvider>
      </ToastProvider>
    </LoadingProvider>
  )
}

export default App
