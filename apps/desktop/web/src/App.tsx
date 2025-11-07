// App raíz: manejo de pestañas (Inicio persistente + sesiones) y navegación lateral.
import React, { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import './App.css'
import Header from './components/layout/Header'
import Sidebar from './components/layout/Sidebar'
import { navigateFromSidebar } from './navigation/navigation'
import TerminalView from './components/terminal/TerminalView'
import TerminalOnly from './components/terminal/TerminalOnly'
import ConnectForm from './components/connect/ConnectForm'
import SavedHostsPage from './pages/SavedHostsPage'
import ConnectFormPage from './pages/ConnectFormPage'
import LandingPage from './pages/LandingPage'
import LogsPage from './pages/LogsPage'
import LogDetailPage from './pages/LogDetailPage'
import { connectFromHost } from './api/storage'
import { LoadingProvider } from './contexts/LoadingContext'
import GlobalLoader from './components/modals/GlobalLoader'
import { ToastProvider } from './contexts/ToastContext'
import ToastContainer from './components/modals/ToastContainer'
import { ThemeProvider } from './contexts/ThemeContext'
import ThemesPage from './pages/ThemesPage'
import SftpPage from './pages/SftpPage'
import SnippetsPage from './pages/SnippetsPage'
import ConfirmModal from './components/modals/ConfirmModal'
import ChatPane from './components/ChatPane'
import PinsPanel from './components/raspberry/PinsPanel'
import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'

const App: React.FC = () => {
  // Representa una pestaña: 'home' (persistente) o 'session' (SSH)
  type Tab = { id: string; type: 'home' | 'session' | 'log'; label: string; logData?: import('./components/logs/SessionCard').SessionLog }
  const HOME_ID = 'home'
  const [tabs, setTabs] = useState<Tab[]>([{ id: HOME_ID, type: 'home', label: 'Inicio' }])
  const [activeTabId, setActiveTabId] = useState<string>(HOME_ID)
  const [isSidebarOpen, setSidebarOpen] = useState(true)
  const [sessionMeta, setSessionMeta] = useState<Record<string,{ label: string }>>({})
  const [pendingHost, setPendingHost] = useState<any | null>(null)
  const [selectedPage, setSelectedPage] = useState<string>('landing') // subpágina dentro de Inicio - empieza en landing
  const [updateInfo, setUpdateInfo] = useState<null | { version: string; notes?: string }>(null)
  const [updating, setUpdating] = useState(false)
  const [isCameraOpen, setCameraOpen] = useState(false)
  const [isPinsPanelOpen, setPinsPanelOpen] = useState(false)

  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0]


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
    
    // Si estás cerrando la pestaña activa, cerrar los paneles laterales
    if (id === activeTabId) {
      if (isPinsPanelOpen) {
        closePinsPanel();
      }
      if (isCameraOpen) {
        setCameraOpen(false);
      }
    }
    
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
    // Asegurar que al conectar, la página esté en 'connect' para mostrar el terminal
    setSelectedPage('connect')
  }

  // Abrir un log en una pestaña nueva
  const openLogTab = (session: import('./components/logs/SessionCard').SessionLog) => {
    const logTabId = `log:${session.id}`
    const logLabel = `Log ${session.user}@${session.host}`
    setTabs(prev => {
      const exists = prev.some(t => t.id === logTabId)
      if (exists) return prev
      return [...prev, { id: logTabId, type: 'log', label: logLabel, logData: session }]
    })
    setActiveTabId(logTabId)
  }

  const handleTabClick = (id: string) => {
    console.log('🔄 Tab clicked:', id)
    console.log('📋 Current tabs:', tabs.map(t => ({ id: t.id, type: t.type, label: t.label })))
    
    setActiveTabId(id)
    
    const clickedTab = tabs.find(t => t.id === id)
    console.log('🎯 Clicked tab:', clickedTab)
    
    // Cerrar paneles laterales al cambiar de tab
    if (isPinsPanelOpen) {
      closePinsPanel();
    }
    if (isCameraOpen) {
      setCameraOpen(false);
    }
    
    // Resetear selectedPage si cambias a la pestaña "Inicio" o a una pestaña de sesión SSH
    if (clickedTab?.type === 'home') {
      console.log('🏠 Resetting selectedPage for home tab')
      setSelectedPage('landing')
    } else if (clickedTab?.type === 'session') {
      console.log('🔗 Resetting selectedPage for session tab')
      // Cuando cambias a una pestaña de sesión SSH, resetear selectedPage para mostrar terminal
      setSelectedPage('connect')
    }
  }

  // Mantiene sincronizadas las etiquetas de pestañas con los alias en sessionMeta
  useEffect(() => {
    console.log('🔄 Updating tabs labels from sessionMeta:', sessionMeta)
    setTabs(prev => prev.map(t => (
      t.type === 'session' && sessionMeta[t.id]?.label && t.label !== sessionMeta[t.id].label
        ? { ...t, label: sessionMeta[t.id].label }
        : t
    )))
  }, [sessionMeta])

  // Log del estado actual
  useEffect(() => {
    console.log('📊 Current state:', {
      activeTabId,
      activeTab: tabs.find(t => t.id === activeTabId),
      sessionMeta,
      selectedPage
    })
  }, [activeTabId, tabs, sessionMeta, selectedPage])

  // Al cerrar una sesión SSH, pedir al backend que desconecte antes de remover la pestaña
  // Para pestañas de logs, simplemente cerrar sin desconectar
  const handleCloseTab = async (id: string) => {
    // Verificar si es una pestaña de log
    const tab = tabs.find(t => t.id === id);
    if (tab?.type === 'log') {
      // Para logs, simplemente cerrar la pestaña sin intentar desconectar
      closeTab(id);
      return;
    }
    
    // Para sesiones SSH, intentar desconectar
    try {
      await invoke('ssh_disconnect', { id })
      closeTab(id)
    } catch (e: any) {
      // Si falla la desconexión (por ejemplo, sesión ya cerrada), cerrar la pestaña de todas formas
      console.warn('Error al desconectar:', e);
      closeTab(id);
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


  const emitPinsToggleEvents = (next: boolean) => {
    const detail = { isOpen: next }
    try { window.dispatchEvent(new CustomEvent('app:pins-toggled', { detail: { ...detail, phase: 'start' } })) } catch {}
    try {
      requestAnimationFrame(() => {
        try { window.dispatchEvent(new CustomEvent('app:pins-toggled', { detail: { ...detail, phase: 'frame' } })) } catch {}
      })
    } catch {}
    try { window.setTimeout(() => { try { window.dispatchEvent(new CustomEvent('app:pins-toggled', { detail: { ...detail, phase: 'end' } })) } catch {} }, 320) } catch {}
  }

  const emitBottomBarToggleEvents = (next: boolean) => {
    const detail = { isOpen: next }
    try { window.dispatchEvent(new CustomEvent('app:bottombar-toggled', { detail: { ...detail, phase: 'start' } })) } catch {}
    try {
      requestAnimationFrame(() => {
        try { window.dispatchEvent(new CustomEvent('app:bottombar-toggled', { detail: { ...detail, phase: 'frame' } })) } catch {}
      })
    } catch {}
    try { window.setTimeout(() => { try { window.dispatchEvent(new CustomEvent('app:bottombar-toggled', { detail: { ...detail, phase: 'end' } })) } catch {} }, 320) } catch {}
  }

  const togglePinsPanel = () => {
    setPinsPanelOpen(prev => {
      const next = !prev
      emitPinsToggleEvents(next)
      return next
    })
  }

  const closePinsPanel = () => {
    setPinsPanelOpen(prev => {
      if (!prev) return prev
      emitPinsToggleEvents(false)
      return false
    })
  }

  const toggleCameraPanel = () => {
    setCameraOpen(prev => {
      const next = !prev
      emitBottomBarToggleEvents(next)
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
                navigateFromSidebar({
                  page: p,
                  activeTabType: activeTab.type,
                  HOME_ID,
                  setActiveTabId,
                  setSelectedPage,
                  pendingHost,
                  setPendingHost,
                  isPinsPanelOpen,
                  closePinsPanel,
                  isCameraOpen,
                  setCameraOpen,
                })
              }}
              activeSessionId={activeTab.type === 'session' ? activeTab.label : null}
              isCameraOpen={isCameraOpen}
              isPinsPanelOpen={isPinsPanelOpen}
              onToggleCamera={toggleCameraPanel}
              onTogglePins={togglePinsPanel}
            />
            {isPinsVisible && (
              <aside className="pins-panel" aria-label="Panel de pines GPIO">
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
          />
          <main className="content-area">
            {/* Contenedor Home persistente */}
            <div style={{display: activeTab.type==='home' ? 'block' : 'none', height:'100%'}}>
              {selectedPage === 'landing' ? (
                <LandingPage 
                  onStartTutorial={() => setSelectedPage('landing')} 
                  onPageChange={setSelectedPage}
                />
              ) : selectedPage === 'connect' ? (
                <ConnectFormPage onConnected={handleNewSession} initialPayload={pendingHost} />
              ) : selectedPage === 'hosts' ? (
                <SavedHostsPage 
                  onConnected={(sessionId: string, label: string) => {
                    setSessionMeta(prev => ({ ...prev, [sessionId]: { label } }));
                    openSession(sessionId, label);
                  }}
                  onEdit={(hostData, originalFile) => {
                    // Cambiar a la página de conexión con los datos del host prellenados
                    // Agregar el archivo original para que sepa que es edición
                    setPendingHost({ ...hostData, _originalFile: originalFile })
                    setSelectedPage('connect')
                  }}
                />
              ) : selectedPage === 'themes' ? (
                <ThemesPage />
              ) : selectedPage === 'logs' ? (
                <LogsPage onOpenLog={openLogTab} />
              ) : selectedPage === 'sftp' ? (
                <SftpPage
                  sessions={tabs.filter(t=>t.type==='session').map(t=>t.id)}
                  sessionsMeta={sessionMeta}
                  activeSessionId={(() => {
                    // Usar la primera sesión disponible como fallback
                    const sessionTabs = tabs.filter(t=>t.type==='session');
                    return sessionTabs.length > 0 ? sessionTabs[0].id : undefined;
                  })()}
                />
              ) : selectedPage === 'snippets' ? (
                <SnippetsPage />
              ) : (
                <LandingPage 
                  onStartTutorial={() => setSelectedPage('landing')} 
                  onPageChange={setSelectedPage}
                />
              )}
            </div>
            {/* Sesiones SSH persistentes */}
            {tabs.filter(t => t.type==='session').map(t => (
              <div key={t.id} style={{display: activeTabId===t.id ? 'block':'none', height:'100%', width:'100%'}}>
                {/* Terminal siempre montado, se oculta con CSS cuando se muestra SFTP, Snippets o Logs */}
                <div style={{display: selectedPage === 'sftp' || selectedPage === 'snippets' || selectedPage === 'logs' ? 'none' : 'block', height:'100%', width:'100%'}}>
                  <TerminalView sessionId={t.id} isCameraOpen={isCameraOpen} />
                </div>
                
                {/* SFTP solo se renderiza cuando selectedPage es 'sftp' */}
                {selectedPage === 'sftp' && (
                  <SftpPage
                    sessions={tabs.filter(t=>t.type==='session').map(t=>t.id)}
                    sessionsMeta={sessionMeta}
                    activeSessionId={t.id}
                  />
                )}
                
                {/* Snippets solo se renderiza cuando selectedPage es 'snippets' */}
                {selectedPage === 'snippets' && (
                  <SnippetsPage />
                )}
                
                {/* Logs solo se renderiza cuando selectedPage es 'logs' */}
                {selectedPage === 'logs' && (
                  <LogsPage onOpenLog={openLogTab} />
                )}
              </div>
            ))}
            {/* Pestañas de Logs */}
            {tabs.filter(t => t.type==='log').map(t => (
              <div key={t.id} style={{display: activeTabId===t.id ? 'block':'none', height:'100%', width:'100%'}}>
                {t.logData && (
                  <LogDetailPage session={t.logData} />
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
