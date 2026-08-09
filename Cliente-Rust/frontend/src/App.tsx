// App raíz: providers, layout shell y orquestación de hooks de alto nivel.
import React, { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import './App.css'

// Anchos de la sidebar (deben coincidir con --sidebar-width por defecto en App.css).
const SIDEBAR_WIDTH_EXPANDED = 200
const SIDEBAR_WIDTH_COLLAPSED = 64

// ── Mantine ──────────────────────────────────────────────────────────────────
import { MantineProvider, createTheme, Modal, Button, Text, Group } from '@mantine/core'
import { ModalsProvider } from '@mantine/modals'
import { Notifications } from '@mantine/notifications'

// Layout
import Sidebar from './components/layout/Sidebar'
import { MacWindowDragStrip } from './components/window/MacWindowDragStrip'
import HomeContainer from './components/layout/HomeContainer'
import SessionContainer from './components/layout/SessionContainer'
import LogTabsContainer from './components/layout/LogTabsContainer'

// Panels
import SidePanel from './components/shared/SidePanel'
import PinsPanel from './components/raspberry/PinsPanel'
import DomoticaPanel from './components/arduino/DomoticaPanel'

// Contexts
import { LoadingProvider } from './contexts/LoadingContext'
import GlobalLoader from './components/modals/GlobalLoader'
import { ToastProvider } from './contexts/ToastContext'
import { ThemeProvider, useTheme } from './contexts/ThemeContext'

// Hooks de orquestación
import { useAppTabs, HOME_TAB_ID } from './hooks/useAppTabs'
import { useUpdateCheck } from './hooks/useUpdateCheck'
import { useSidePanels } from './hooks/useSidePanels'
import { useTabLifecycle } from './hooks/useTabLifecycle'
import { usePracticeSession } from './hooks/usePracticeSession'
import { AuthProvider, useAuth } from './contexts/AuthContext'

// ── Mantine theme — color primario reactivo al tema CSS activo ───────────────
function buildMantineTheme(primaryColor: string) {
  return createTheme({
    primaryColor,
    defaultRadius: 'md',
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
    colors: {
      // Escala roja institucional Unipiloto (10 pasos requeridos por Mantine)
      'unipiloto-red': [
        '#fff0f0', '#ffd6d6', '#ffadad', '#ff8080', '#f26b69',
        '#e8403d', '#d51f22', '#b81a1d', '#a81010', '#930000',
      ],
    },
  })
}

// ── Modal de actualización con Mantine ────────────────────────────────────────
const UpdateModal: React.FC<{
  open: boolean
  version?: string
  notes?: string
  loading: boolean
  onConfirm: () => void
  onCancel: () => void
}> = ({ open, version, notes, loading, onConfirm, onCancel }) => (
  <Modal
    opened={open}
    onClose={onCancel}
    title={`Nueva versión ${version ?? ''}`}
    centered
    size="md"
    overlayProps={{ blur: 0 }}
  >
    <Text size="sm" c="dimmed" mb="md">
      {notes || 'Hay una actualización disponible. ¿Deseas instalarla ahora?'}
    </Text>
    <Group justify="flex-end" gap="sm">
      <Button variant="subtle" color="gray" onClick={onCancel} disabled={loading}>
        Ahora no
      </Button>
      <Button color="blue" onClick={onConfirm} loading={loading}>
        Instalar y reiniciar
      </Button>
    </Group>
  </Modal>
)

// ── AppMain — lógica principal ───────────────────────────────────────────────
const AppMain: React.FC = () => {
  const appContainerRef = useRef<HTMLDivElement>(null)
  const { mantineColorScheme, theme } = useTheme()

  const mantineTheme = buildMantineTheme(theme === 'unipiloto' ? 'unipiloto-red' : 'blue')

  // ── Tabs y navegación ────────────────────────────────────────────────────────
  const {
    tabs, activeTabId, setActiveTabId,
    isSidebarOpen, setIsSidebarOpen,
    sessionMeta, setSessionMeta,
    pendingHost, setPendingHost,
    selectedPage, activeTab,
    openSession, closeTab, renameTab,
    handleNewSession, openLogTab, openLocalTerminalTab,
    openPanels, activePanel,
    openPanel, closePanel: closePanelTab,
    activeView, setActiveView,
    isChatOpen, setIsChatOpen,
  } = useAppTabs()

  // ── Actualizaciones ──────────────────────────────────────────────────────────
  const { updateInfo, updating, confirmInstallUpdate, dismissUpdate } = useUpdateCheck()

  // ── Paneles laterales ────────────────────────────────────────────────────────
  const {
    isPinsPanelOpen, isCameraOpen, isDomoticaPanelOpen,
    togglePinsPanel, closePinsPanel,
    toggleCameraPanel, setCameraPanelOpen,
    toggleDomoticaPanel, closeDomoticaPanel,
  } = useSidePanels()

  // ── Estado local residual ────────────────────────────────────────────────────
  const [sftpPaths, setSftpPaths] = useState<Record<string, string>>({})

  // ── Prácticas de laboratorio ─────────────────────────────────────────────────
  const { practiceMeta, handleStartPractice, clearPracticeMeta } = usePracticeSession({
    onNewSession: handleNewSession,
    setCameraOpen: setCameraPanelOpen,
    setChatOpen: setIsChatOpen,
  })

  // ── Sesión y Autenticación ───────────────────────────────────────────────────
  const { isAuthenticated, isLoading } = useAuth()

  // ── Ciclo de vida de tabs ────────────────────────────────────────────────────
  const { handleCloseTab } = useTabLifecycle({ tabs, closeTab, clearPracticeMeta })

  // ── Páginas de contexto ──────────────────────────────────────────────────────
  const HOME_PAGES = ['landing', 'connect', 'hosts', 'themes', 'logs', 'sftp', 'snippets', 'practices', 'moodle-test', 'reservas', 'admin-users']
  const SESSION_PAGES = ['sftp', 'snippets', 'logs']

  const handleTabClick = (id: string) => {
    setActiveTabId(id)
    closePinsPanel()
    closeDomoticaPanel()
    const clickedTab = tabs.find(t => t.id === id)
    if (clickedTab?.type === 'home') {
      if (!HOME_PAGES.includes(activePanel)) handleOpenPanel('landing')
    } else if (clickedTab?.type === 'session' || clickedTab?.type === 'local-terminal') {
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
      const sessionTabs = tabs.filter(t => t.type === 'session' || t.type === 'local-terminal')
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

  // ── Reset state on logout ────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) {
      openPanel('landing')
      setActiveTabId(HOME_TAB_ID)
    }
  }, [isAuthenticated, openPanel, setActiveTabId])

  // ── Colapsar/expandir sidebar (GSAP, no CSS transition) ──────────────────────
  // --sidebar-width alimenta el offset de .app-header y .main-content además del
  // ancho de la propia sidebar (ver App.css) — animarla acá con GSAP mueve las
  // tres cosas en un solo sistema sincronizado, en vez de que cada elemento la
  // persiga por separado con su propia `transition: all` (eso era lo que se veía
  // "sucio": dos motores de animación compitiendo por la misma propiedad).
  useEffect(() => {
    const el = appContainerRef.current
    if (!el || !isAuthenticated) return
    gsap.to(el, {
      '--sidebar-width': `${isSidebarOpen ? SIDEBAR_WIDTH_EXPANDED : SIDEBAR_WIDTH_COLLAPSED}px`,
      duration: 0.4,
      ease: 'power3.inOut',
    })
  }, [isSidebarOpen, isAuthenticated])

  // ── Visibilidad de paneles ───────────────────────────────────────────────────
  const isPinsVisible = isPinsPanelOpen && activeTab.type === 'session'
  const isDomoticaVisible = isDomoticaPanelOpen && activeTab.type === 'session'
  const isH2Visible = activePanel === 'terminal'
  const hasSessionTabs = tabs.some(t => t.type === 'session' || t.type === 'local-terminal')
  const isSessionActive = activeTab.type === 'session'

  if (isLoading) {
    return (
      <MantineProvider theme={mantineTheme} forceColorScheme={mantineColorScheme}>
        <div style={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          Cargando sesión...
        </div>
      </MantineProvider>
    )
  }

  // Removed AuthGuard to allow public access to the Landing Page

  return (
    <MantineProvider theme={mantineTheme} forceColorScheme={mantineColorScheme}>
      <ModalsProvider>
        <Notifications position="bottom-right" zIndex={9998} />
        <GlobalLoader />

        <div
          ref={appContainerRef}
          className={[
            'app-container',
            isPinsVisible ? 'pins-open' : '',
            isDomoticaVisible ? 'domotica-open' : '',
            isH2Visible ? 'h2-visible' : '',
            !isAuthenticated ? 'no-sidebar' : '',
          ].filter(Boolean).join(' ')}
        >
          {isAuthenticated && (
            <Sidebar
              activePanel={activePanel}
              onOpenPanel={handleOpenPanel}
              tabs={tabs}
              activeTabId={activeTabId}
              onTabClick={handleTabClick}
              onCloseTab={handleCloseTab}
              onRenameTab={renameTab}
              onNewSession={() => { setActiveTabId(HOME_TAB_ID); handleOpenPanel('connect') }}
              onNewLocalTerminal={openLocalTerminalTab}
              showSessionActions={isSessionActive}
              activeView={activeView}
              onViewChange={setActiveView}
              isChatOpen={isChatOpen}
              onToggleChat={() => setIsChatOpen(!isChatOpen)}
              onToggleCamera={() => toggleCameraPanel(activeTab.id)}
              onTogglePins={togglePinsPanel}
              isCameraActive={isCameraOpen(activeTab.id)}
              isPinsActive={isPinsPanelOpen}
              hasSessions={hasSessionTabs}
              collapsed={!isSidebarOpen}
              onToggleCollapse={() => setIsSidebarOpen(o => !o)}
            />
          )}
          <div className="main-content">
            <MacWindowDragStrip />
            <main className="content-area">
              {activeTab.type === 'home' && (
                <div style={{ height: '100%' }}>
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
              )}
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
                onCloseTab={handleCloseTab}
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

        <UpdateModal
          open={!!updateInfo}
          version={updateInfo?.version}
          notes={updateInfo?.notes}
          loading={updating}
          onConfirm={confirmInstallUpdate}
          onCancel={dismissUpdate}
        />
      </ModalsProvider>
    </MantineProvider>
  )
}

// ── App raíz — inyecta todos los providers de contexto ───────────────────────
const App: React.FC = () => (
  <LoadingProvider>
    <ToastProvider>
      <ThemeProvider>
        <AuthProvider>
          <AppMain />
        </AuthProvider>
      </ThemeProvider>
    </ToastProvider>
  </LoadingProvider>
)

export default App
