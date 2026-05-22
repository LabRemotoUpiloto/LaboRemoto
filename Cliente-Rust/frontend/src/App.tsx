// App raíz: providers, layout shell y orquestación de hooks de alto nivel.
import React, { useEffect, useRef, useState } from 'react'
import './App.css'

// ── Mantine ──────────────────────────────────────────────────────────────────
import { MantineProvider, createTheme, LoadingOverlay, Modal, Button, Text, Group } from '@mantine/core'
import { ModalsProvider } from '@mantine/modals'
import { Notifications } from '@mantine/notifications'

// Layout
import Header from './components/layout/header/Header'
import Sidebar from './components/layout/Sidebar'
import { isMacOS } from './utils/platform'
import HomeContainer from './components/layout/HomeContainer'
import SessionContainer from './components/layout/SessionContainer'
import LogTabsContainer from './components/layout/LogTabsContainer'

// Panels
import SidePanel from './components/shared/SidePanel'
import PinsPanel from './components/raspberry/PinsPanel'
import DomoticaPanel from './components/arduino/DomoticaPanel'

// Contexts
import { LoadingProvider, useLoading } from './contexts/LoadingContext'
import { ToastProvider } from './contexts/ToastContext'
import { ThemeProvider, useTheme } from './contexts/ThemeContext'

// Hooks de orquestación
import { useAppTabs, HOME_TAB_ID } from './hooks/useAppTabs'
import { useUpdateCheck } from './hooks/useUpdateCheck'
import { useSidePanels } from './hooks/useSidePanels'
import { useTabLifecycle } from './hooks/useTabLifecycle'
import { usePracticeSession } from './hooks/usePracticeSession'

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

// ── GlobalLoader con Mantine LoadingOverlay ───────────────────────────────────
const GlobalLoader: React.FC = () => {
  const { loading, label, onCancel } = useLoading()
  return (
    <LoadingOverlay
      visible={loading}
      zIndex={9999}
      overlayProps={{ radius: 'sm', blur: 0 }}
      loaderProps={{ color: 'blue', type: 'oval', size: 'md' }}
    >
      {loading && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, pointerEvents: 'none' }}>
          {label && <Text c="dimmed" size="sm" mt={60}>{label}</Text>}
          {onCancel && (
            <Button
              variant="subtle" color="red" size="xs"
              style={{ pointerEvents: 'all' }}
              onClick={onCancel}
            >
              Cancelar
            </Button>
          )}
        </div>
      )}
    </LoadingOverlay>
  )
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

  // El header solo se muestra cuando hay sesiones activas (tabs de terminal).
  // En home sin sesiones el layout es sidebar + contenido directo, como Claude.
  const showHeader = tabs.some(t => t.type === 'session')

  return (
    <MantineProvider theme={mantineTheme} defaultColorScheme={mantineColorScheme}>
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
          ].filter(Boolean).join(' ')}
          style={{ '--header-height': showHeader ? '46px' : '0px' } as React.CSSProperties}
        >
          {/* macOS (titleBar overlay): franja drag sobre el contenido; Win/Linux usan barra nativa */}
          {isMacOS() && (
            <div
              data-tauri-drag-region
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                height: '60px',
                zIndex: 100,
                cursor: 'grab',
                userSelect: 'none',
              }}
            />
          )}

          {showHeader && (
            <Header
              activePanel={activePanel}
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
            />
          )}
          <Sidebar
            activePanel={activePanel}
            onOpenPanel={handleOpenPanel}
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
        <AppMain />
      </ThemeProvider>
    </ToastProvider>
  </LoadingProvider>
)

export default App
