// App raíz: manejo de pestañas (Inicio persistente + sesiones) y navegación lateral.
import React, { useEffect, useState, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import './App.css'
import Header from './components/layout/Header'
import Sidebar from './components/layout/Sidebar'
import TerminalView from './components/terminal/TerminalView'
import TerminalOnly from './components/terminal/TerminalOnly'
import ConnectForm from './components/connect/ConnectForm'
import SavedHostsPage from './pages/SavedHostsPage'
import ConnectFormPage from './pages/ConnectFormPage'
import LandingPage from './pages/LandingPage'
import LogsPage from './pages/LogsPage'
import LogDetailPage from './pages/LogDetailPage'
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
import { useAppTabs, HOME_TAB_ID } from './hooks/useAppTabs'
import HomeContainer from './components/layout/HomeContainer'
import SessionContainer from './components/layout/SessionContainer'
import LogTabsContainer from './components/layout/LogTabsContainer'
// Sin autenticación

function AppContent() { return <AppMain /> }

const AppMain: React.FC = () => {
  const appContainerRef = useRef<HTMLDivElement>(null)
  
  const {
    tabs,
    activeTabId,
    setActiveTabId,
    isSidebarOpen,
    setIsSidebarOpen,
    sessionMeta,
    setSessionMeta,
    pendingHost,
    setPendingHost,
    selectedPage,
    activeTab,
    openSession,
    closeTab,
    handleNewSession,
    openLogTab,
    // Dual-header panel state
    openPanels,
    activePanel,
    openPanel,
    closePanel: closePanelTab,
    activeView,
    setActiveView,
    isChatOpen,
    setIsChatOpen,
    reorderTabs,
    reorderPanels,
  } = useAppTabs()
  const [updateInfo, setUpdateInfo] = useState<null | { version: string; notes?: string }>(null)
  const [updating, setUpdating] = useState(false)
  const [isCameraOpen, setCameraOpen] = useState(false)
  const [isPinsPanelOpen, setPinsPanelOpen] = useState(false)
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false)

  const handleTabClick = (id: string) => {
    setActiveTabId(id)
    
    const clickedTab = tabs.find(t => t.id === id)
    
    // Cerrar paneles laterales al cambiar de tab
    if (isPinsPanelOpen) closePinsPanel();
    if (isCameraOpen) setCameraOpen(false);
    
    if (clickedTab?.type === 'home') {
      // Al hacer clic en la pestaña de inicio, mantenemos la página actual si es una página de home,
      // de lo contrario (si veníamos de terminal/escritorio) volvemos a landing.
      if (!HOME_PAGES.includes(activePanel)) {
        handleOpenPanel('landing')
      }
    } else if (clickedTab?.type === 'session') {
      // Al hacer clic en una pestaña de sesión, nos aseguramos de mostrar el panel de terminal.
      handleOpenPanel('terminal')
    }
  }

  // Al cerrar una sesión SSH, pedir al backend que desconecte antes de remover la pestaña
  const handleCloseTab = async (id: string) => {
    const tab = tabs.find(t => t.id === id);
    if (tab?.type === 'log') {
      closeTab(id);
      return;
    }
    
    const savePromise = new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        resolve();
      }, 2000);
      
      const handleSaved = (event: CustomEvent) => {
        if (event.detail.sessionId === id) {
          clearTimeout(timeout);
          window.removeEventListener('app:session-saved', handleSaved as EventListener);
          window.removeEventListener('app:session-save-failed', handleFailed as EventListener);
          resolve();
        }
      };
      
      const handleFailed = (event: CustomEvent) => {
        if (event.detail.sessionId === id) {
          clearTimeout(timeout);
          window.removeEventListener('app:session-saved', handleSaved as EventListener);
          window.removeEventListener('app:session-save-failed', handleFailed as EventListener);
          resolve();
        }
      };
      
      window.addEventListener('app:session-saved', handleSaved as EventListener);
      window.addEventListener('app:session-save-failed', handleFailed as EventListener);
    });
    
    window.dispatchEvent(new CustomEvent('app:save-session-before-close', { detail: { sessionId: id } }));
    
    await savePromise;
    
    try {
      await invoke('ssh_disconnect', { id })
      closeTab(id)
    } catch {
      closeTab(id);
    }
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
      } catch {
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
    } catch {
      setUpdateInfo(null)
    } finally {
      setUpdating(false)
    }
  }

  const isPinsVisible = isPinsPanelOpen && activeTab.type === 'session'

  // Pages that belong to the HOME tab context
  const HOME_PAGES = ['landing', 'connect', 'hosts', 'themes', 'logs', 'sftp', 'snippets'];

  // Pages that have per-session context in SessionContainer (sftp, snippets, logs)
  const SESSION_PAGES = ['sftp', 'snippets', 'logs'];

  // Wrapper: when sidebar opens a panel that's a "home" page, also switch to HOME tab
  // Exception: session-contextual pages stay on the active session tab so the correct
  // device's data is shown (e.g. Jetson vs Pi storage).
  const handleOpenPanel = (panelId: string) => {
    openPanel(panelId);
    if (HOME_PAGES.includes(panelId)) {
      if (activeTab.type !== 'session' || !SESSION_PAGES.includes(panelId)) {
        setActiveTabId(HOME_TAB_ID);
      }
    }
  }

  const isH2Visible = activePanel === 'terminal';

  useEffect(() => {
    const handleOpenPanelEvent = (e: any) => {
      if (e.detail) {
        handleOpenPanel(e.detail);
      }
    };
    window.addEventListener('app:open-panel', handleOpenPanelEvent);
    return () => window.removeEventListener('app:open-panel', handleOpenPanelEvent);
  }, [handleOpenPanel]);

  const handleClosePanel = (panelId: string) => {
    if (panelId === 'terminal') {
      const sessionTabs = tabs.filter(t => t.type === 'session');
      sessionTabs.forEach(t => handleCloseTab(t.id));
    }
    closePanelTab(panelId);
  }

  return (
    <LoadingProvider>
      <ToastProvider>
        <ThemeProvider>
          <div ref={appContainerRef} className={`app-container ${isPinsVisible ? 'pins-open' : ''} ${isH2Visible ? 'h2-visible' : ''} ${isSidebarExpanded ? 'sidebar-expanded' : ''}`}>
            <Header
              openPanels={openPanels}
              activePanel={activePanel}
              onPanelClick={handleOpenPanel}
              onPanelClose={handleClosePanel}
              tabs={tabs}
              activeTabId={activeTabId}
              onTabClick={handleTabClick}
              onCloseTab={handleCloseTab}
              onNewSession={() => { setActiveTabId(HOME_TAB_ID); handleOpenPanel('connect'); }}
              activeView={activeView}
              onViewChange={setActiveView}
              showViewToggle={activeTab.type === 'session'}
              isChatOpen={isChatOpen}
              onToggleChat={() => setIsChatOpen(!isChatOpen)}
              onReorderTabs={reorderTabs}
              onReorderPanels={reorderPanels}
              onToggleCamera={toggleCameraPanel}
              onTogglePins={togglePinsPanel}
              isCameraActive={isCameraOpen}
              isPinsActive={isPinsPanelOpen}
            />
            <Sidebar
              activePanel={activePanel}
              onOpenPanel={handleOpenPanel}
              activeSessionId={activeTab.type === 'session' ? activeTab.label : null}
              selectedPage={selectedPage}
              isExpanded={isSidebarExpanded}
              onToggleExpand={() => setIsSidebarExpanded(prev => !prev)}
            />
            <div className="main-content">
              <main className="content-area">
                <div style={{ display: activeTab.type === 'home' ? 'block' : 'none', height: '100%' }}>
                  <HomeContainer
                    tabs={tabs}
                    sessionMeta={sessionMeta}
                    setSessionMeta={setSessionMeta}
                    selectedPage={selectedPage}
                    onOpenPanel={handleOpenPanel}
                    pendingHost={pendingHost}
                    setPendingHost={setPendingHost}
                    onConnectedFromConnect={handleNewSession}
                    onOpenLog={openLogTab}
                  />
                </div>
                <SessionContainer
                  tabs={tabs}
                  activeTabId={activeTabId}
                  selectedPage={selectedPage}
                  activeView={activeView}
                  isCameraOpen={isCameraOpen}
                  isChatOpen={isChatOpen}
                  onCloseChat={() => setIsChatOpen(false)}
                  sessionMeta={sessionMeta}
                  onOpenLog={openLogTab}
                />
                <LogTabsContainer tabs={tabs} activeTabId={activeTabId} />
              </main>
            </div>
            {isPinsVisible && (
              <aside className="pins-panel" aria-label="Panel de pines GPIO">
                <div className="pins-panel__header">
                  <span className="pins-panel__title">Control de Pines GPIO</span>
                  <button 
                    className="pins-panel__close-button" 
                    onClick={closePinsPanel}
                    title="Cerrar panel"
                  >
                    ×
                  </button>
                </div>
                <div className="pins-panel__content">
                  <PinsPanel sessionId={activeTab.id} />
                </div>
              </aside>
            )}
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

const App: React.FC = () => {
  return <AppContent />;
};

export default App;
