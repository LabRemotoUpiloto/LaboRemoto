// App raíz: providers, layout shell y orquestación de hooks de alto nivel.
import React, { useEffect, useRef, useState } from 'react'
import './App.css'

// Layout
import Header from './components/layout/Header'
import Sidebar from './components/layout/Sidebar'
import HomeContainer from './components/layout/HomeContainer'
import SessionContainer from './components/layout/SessionContainer'
import LogTabsContainer from './components/layout/LogTabsContainer'

// Panels & Modals
import SidePanel from './components/shared/SidePanel'
import PinsPanel from './components/raspberry/PinsPanel'
import DomoticaPanel from './components/arduino/DomoticaPanel'
import GlobalLoader from './components/modals/GlobalLoader'
import ToastContainer from './components/modals/ToastContainer'
import ConfirmModal from './components/modals/ConfirmModal'

// Contexts
import { LoadingProvider } from './contexts/LoadingContext'
import { ToastProvider } from './contexts/ToastContext'
import { ThemeProvider } from './contexts/ThemeContext'

// Hooks de orquestación
import { useAppTabs, HOME_TAB_ID } from './hooks/useAppTabs'
import { useUpdateCheck } from './hooks/useUpdateCheck'
import { useSidePanels } from './hooks/useSidePanels'
import { useTabLifecycle } from './hooks/useTabLifecycle'
import { usePracticeSession } from './hooks/usePracticeSession'

const AppMain: React.FC = () => {
  const appContainerRef = useRef<HTMLDivElement>(null)

  // ── Tabs y navegación ────────────────────────────────────────────────────────
  const {
    tabs, activeTabId, setActiveTabId,
    isSidebarOpen, setIsSidebarOpen,
    sessionMeta, setSessionMeta,
    pendingHost, setPendingHost,
    selectedPage, activeTab,
    openSession, closeTab,
    handleNewSession, openLogTab,
    openPanels, activePanel,
    openPanel, closePanel: closePanelTab,
    activeView, setActiveView,
    isChatOpen, setIsChatOpen,
    reorderTabs, reorderPanels,
  } = useAppTabs()

  // ── Actualizaciones ──────────────────────────────────────────────────────────
  const { updateInfo, updating, confirmInstallUpdate, dismissUpdate } = useUpdateCheck()

  // ── Paneles laterales ────────────────────────────────────────────────────────
  const {
    isPinsPanelOpen, isCameraOpen, isDomoticaPanelOpen,
    togglePinsPanel, closePinsPanel,
    toggleCameraPanel,
    toggleDomoticaPanel, closeDomoticaPanel,
    closeAllPanels,
  } = useSidePanels()

  // ── Estado local residual ────────────────────────────────────────────────────
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false)
  const [sftpPaths, setSftpPaths] = useState<Record<string, string>>({})

  // ── Prácticas de laboratorio ─────────────────────────────────────────────────
  const { practiceMeta, handleStartPractice, clearPracticeMeta } = usePracticeSession({
    onNewSession: handleNewSession,
    setCameraOpen: (open) => open ? toggleCameraPanel() : undefined,
    setChatOpen: setIsChatOpen,
  })

  // ── Ciclo de vida de tabs ────────────────────────────────────────────────────
  const { handleCloseTab } = useTabLifecycle({ tabs, closeTab, clearPracticeMeta })

  // ── Páginas de contexto ──────────────────────────────────────────────────────
  const HOME_PAGES = ['landing', 'connect', 'hosts', 'themes', 'logs', 'sftp', 'snippets', 'practices', 'moodle-test']
  const SESSION_PAGES = ['sftp', 'snippets', 'logs']

  const handleTabClick = (id: string) => {
    setActiveTabId(id)
    // Cerrar paneles laterales al cambiar de tab
    closeAllPanels()
    const clickedTab = tabs.find(t => t.id === id)
    if (clickedTab?.type === 'home') {
      if (!HOME_PAGES.includes(activePanel)) handleOpenPanel('landing')
    } else if (clickedTab?.type === 'session') {
      handleOpenPanel('terminal')
    }
  }

  const handleOpenPanel = (panelId: string) => {
    openPanel(panelId)
    if (HOME_PAGES.includes(panelId)) {
      if (activeTab.type !== 'session' || !SESSION_PAGES.includes(panelId)) {
        setActiveTabId(HOME_TAB_ID)
      }
    }
  }

  const handleClosePanel = (panelId: string) => {
    if (panelId === 'terminal') {
      const sessionTabs = tabs.filter(t => t.type === 'session')
      sessionTabs.forEach(t => handleCloseTab(t.id))
    }
    closePanelTab(panelId)
  }

  // ── Eventos globales ─────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail) handleOpenPanel(detail)
    }
    window.addEventListener('app:open-panel', handler)
    return () => window.removeEventListener('app:open-panel', handler)
  }, [handleOpenPanel])

  useEffect(() => {
    const handler = () => setIsChatOpen(true)
    window.addEventListener('tour:open-chat', handler)
    return () => window.removeEventListener('tour:open-chat', handler)
  }, [setIsChatOpen])

  // ── Visibilidad de paneles ───────────────────────────────────────────────────
  const isPinsVisible = isPinsPanelOpen && activeTab.type === 'session'
  const isDomoticaVisible = isDomoticaPanelOpen && activeTab.type === 'session'
  const isH2Visible = activePanel === 'terminal'

  return (
    <LoadingProvider>
      <ToastProvider>
        <ThemeProvider>
          <div
            ref={appContainerRef}
            className={[
              'app-container',
              isPinsVisible ? 'pins-open' : '',
              isDomoticaVisible ? 'domotica-open' : '',
              isH2Visible ? 'h2-visible' : '',
              isSidebarExpanded ? 'sidebar-expanded' : '',
            ].filter(Boolean).join(' ')}
          >
            <Header
              openPanels={openPanels}
              activePanel={activePanel}
              onPanelClick={handleOpenPanel}
              onPanelClose={handleClosePanel}
              tabs={tabs}
              activeTabId={activeTabId}
              onTabClick={handleTabClick}
              onCloseTab={handleCloseTab}
              onNewSession={() => { setActiveTabId(HOME_TAB_ID); handleOpenPanel('connect') }}
              activeView={activeView}
              onViewChange={setActiveView}
              showViewToggle={activeTab.type === 'session'}
              isChatOpen={isChatOpen}
              onToggleChat={() => setIsChatOpen(!isChatOpen)}
              onReorderTabs={reorderTabs}
              onReorderPanels={reorderPanels}
              onToggleCamera={toggleCameraPanel}
              onTogglePins={togglePinsPanel}
              onToggleDomotica={toggleDomoticaPanel}
              isCameraActive={isCameraOpen}
              isPinsActive={isPinsPanelOpen}
              isDomoticaActive={isDomoticaPanelOpen}
              isSidebarExpanded={isSidebarExpanded}
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
                    onStartPractice={handleStartPractice}
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
                  sftpPaths={sftpPaths}
                  setSftpPaths={setSftpPaths}
                  practiceMeta={practiceMeta}
                />
                <LogTabsContainer tabs={tabs} activeTabId={activeTabId} closeTab={handleCloseTab} />
              </main>
            </div>

            {isPinsVisible && (
              <SidePanel title="Control de Pines GPIO" ariaLabel="Panel de pines GPIO" onClose={closePinsPanel}>
                <PinsPanel sessionId={activeTab.id} />
              </SidePanel>
            )}

            {isDomoticaVisible && (
              <SidePanel title="Domótica (Arduino)" ariaLabel="Panel de Domótica" onClose={closeDomoticaPanel}>
                <DomoticaPanel sessionId={activeTab.id} />
              </SidePanel>
            )}
          </div>

          <GlobalLoader />
          <ToastContainer />
          <ConfirmModal
            open={!!updateInfo}
            title={updateInfo ? `Nueva versión ${updateInfo.version}` : 'Actualización disponible'}
            message={updateInfo?.notes || 'Hay una actualización disponible. ¿Deseas instalarla ahora?'}
            onConfirm={confirmInstallUpdate}
            onCancel={dismissUpdate}
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

const App: React.FC = () => <AppMain />

export default App
