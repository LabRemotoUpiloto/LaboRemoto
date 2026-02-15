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

function AppMain() {
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
    setSelectedPage,
    activeTab,
    openSession,
    closeTab,
    handleNewSession,
    openLogTab
  } = useAppTabs()
  const [updateInfo, setUpdateInfo] = useState<null | { version: string; notes?: string }>(null)
  const [updating, setUpdating] = useState(false)
  const [isCameraOpen, setCameraOpen] = useState(false)
  const [isPinsPanelOpen, setPinsPanelOpen] = useState(false)

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
    
    // Para sesiones SSH, emitir evento para que TerminalPane guarde la sesión
    console.log(`📝 Requesting session save for ${id} before disconnect`);
    
    // Crear una promesa que se resuelve cuando se recibe confirmación
    const savePromise = new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        console.warn(`⏱️ Timeout waiting for session save confirmation for ${id}`);
        resolve();
      }, 2000); // 2 segundos timeout
      
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
          console.error(`❌ Session save failed for ${id}:`, event.detail.error);
          window.removeEventListener('app:session-saved', handleSaved as EventListener);
          window.removeEventListener('app:session-save-failed', handleFailed as EventListener);
          resolve(); // Continuar de todas formas
        }
      };
      
      window.addEventListener('app:session-saved', handleSaved as EventListener);
      window.addEventListener('app:session-save-failed', handleFailed as EventListener);
    });
    
    // Emitir evento de guardado
    window.dispatchEvent(new CustomEvent('app:save-session-before-close', { detail: { sessionId: id } }));
    
    // Esperar a que se guarde (o timeout)
    await savePromise;
    
    // Luego desconectar
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
    setIsSidebarOpen(prev => {
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
                  HOME_ID: HOME_TAB_ID,
                  setActiveTabId,
                  setSelectedPage,
                  pendingHost,
                  setPendingHost: (val: any | null) => setPendingHost(val),
                  isPinsPanelOpen,
                  closePinsPanel,
                  isCameraOpen,
                  setCameraOpen: (open: boolean) => setCameraOpen(open),
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
            onNewSession={() => { setActiveTabId(HOME_TAB_ID); setSelectedPage('connect'); }}
          />
          <main className="content-area">
            <div style={{ display: activeTab.type === 'home' ? 'block' : 'none', height: '100%' }}>
              <HomeContainer
                tabs={tabs}
                sessionMeta={sessionMeta}
                setSessionMeta={setSessionMeta}
                selectedPage={selectedPage}
                setSelectedPage={setSelectedPage}
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
              isCameraOpen={isCameraOpen}
              sessionMeta={sessionMeta}
              onOpenLog={openLogTab}
            />
            <LogTabsContainer tabs={tabs} activeTabId={activeTabId} />
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

const App: React.FC = () => {
  return <AppContent />;
};

export default App;
