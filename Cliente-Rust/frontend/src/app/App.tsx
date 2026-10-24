// App raíz: providers, layout shell y orquestación de hooks de alto nivel.
import React, { useCallback, useEffect, useMemo, useRef } from 'react'
import { EVENTO_VISTA_PRACTICA, type DetalleVistaPractica } from '@/features/practicas/linux/escritorioPractica'
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
import Sidebar from './layout/Sidebar'
import { MacWindowDragStrip } from './window/MacWindowDragStrip'
import HomeContainer from './layout/HomeContainer'
import SessionContainer from '@/features/sesion/SessionContainer'
import LogTabsContainer from '@/features/logs/LogTabsContainer'

// Panels
import SidePanel from './SidePanel'
import PinsPanel from '@/features/hardware/gpio/PinsPanel'
import DomoticaPanel from '@/features/hardware/arduino/DomoticaPanel'

// Contexts
import { LoadingProvider } from './providers/LoadingContext'
import GlobalLoader from './GlobalLoader'
import UpdateProgressOverlay from './UpdateProgressOverlay'
import { ToastProvider } from './providers/ToastContext'
import { ThemeProvider, useTheme } from './providers/ThemeContext'

// Hooks de orquestación
import { useAppTabs, HOME_TAB_ID } from './hooks/useAppTabs'
import { useUpdateCheck } from './hooks/useUpdateCheck'
import { useSidePanels } from './hooks/useSidePanels'
import { useTabLifecycle } from './hooks/useTabLifecycle'
import { usePracticeSession } from '@/features/practicas/usePracticeSession'
import { useLinuxPracticeSession } from '@/features/practicas/useLinuxPracticeSession'
import { requestPracticesFocus } from '@/features/practicas/practiceNavigation.service'
import { clearModuleBadge } from '@/features/practicas/badges.service'
import { usePracticeActivityReporter, type PracticaAbierta } from '@/features/practicas/usePracticeActivityReporter'
import { useUbicacionAppReporter } from '@/features/actividad/useUbicacionAppReporter'
import { useUsoAppReporter } from '@/features/actividad/useUsoAppReporter'
import { useEnlacesApp } from './hooks/useEnlacesApp'
import ResultadoMoodleAviso from '@/features/cursos/ResultadoMoodleAviso'
import BienvenidaTutorial from '@/features/onboarding/inicio/BienvenidaTutorial'
import TourPracticaLinux from '@/features/practicas/tour/TourPracticaLinux'
import { SesionPorPracticaContext } from '@/features/cursos/envioMoodle'
import { AuthProvider, useAuth } from '@/features/cuenta/AuthContext'
import { useAppStore } from '@/store/app'
import { useGrabadorPrueba } from '@/features/monitoreo/pruebaRendimiento'
import { canAccessPage, useEffectiveRole } from '@/features/cuenta/usePermissions'
import type { PracticeSessionMeta } from '@/types'

// ── Mantine theme — color primario y fuentes reactivas al tema CSS activo ───────────────
function buildMantineTheme(primaryColor: string) {
  return createTheme({
    primaryColor,
    defaultRadius: 'md',
    fontFamily: 'var(--font-body, Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif)',
    headings: {
      fontFamily: 'var(--font-heading, var(--font-body, Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif))',
    },
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
// Solo pregunta si instalar -- una vez confirmado, se cierra y en su lugar se
// muestra UpdateProgressOverlay (pantalla completa) con el estado real de
// descarga/instalación en vez de un spinner metido en el botón sin decir nada.
const UpdateModal: React.FC<{
  open: boolean
  version?: string
  notes?: string
  onConfirm: () => void
  onCancel: () => void
}> = ({ open, version, notes, onConfirm, onCancel }) => (
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
      <Button variant="subtle" color="gray" onClick={onCancel}>
        Ahora no
      </Button>
      <Button color="blue" onClick={onConfirm}>
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
    selectedPage, activeTab,
    closeTab, renameTab,
    handleNewSession, openLogTab,
    activePanel,
    openPanel,
    activeView, setActiveView,
    isChatOpen, setIsChatOpen,
  } = useAppTabs()

  // Una práctica puede pedir mostrar el escritorio remoto de su sesión o volver a la terminal
  // (ver features/practicas/linux/escritorioPractica.ts).
  useEffect(() => {
    const alPedirVista = (ev: Event) => {
      const vista = (ev as CustomEvent<DetalleVistaPractica>).detail?.vista
      if (vista === 'escritorio' || vista === 'terminal') setActiveView(vista)
    }
    document.addEventListener(EVENTO_VISTA_PRACTICA, alPedirVista)
    return () => document.removeEventListener(EVENTO_VISTA_PRACTICA, alPedirVista)
  }, [setActiveView])

  // ── Actualizaciones ──────────────────────────────────────────────────────────
  const { updateInfo, updating, updateProgress, confirmInstallUpdate, cancelUpdate, dismissUpdate } = useUpdateCheck()

  // ── Paneles laterales ────────────────────────────────────────────────────────
  const {
    isPinsPanelOpen, isCameraOpen, isDomoticaPanelOpen,
    togglePinsPanel, closePinsPanel,
    toggleCameraPanel, setCameraPanelOpen,
    closeDomoticaPanel,
  } = useSidePanels()

  // ── Estado local residual ────────────────────────────────────────────────────

  // ── Prácticas de laboratorio ─────────────────────────────────────────────────
  const { practiceMeta, handleStartPractice, clearPracticeMeta } = usePracticeSession({
    onNewSession: handleNewSession,
    setCameraOpen: setCameraPanelOpen,
    setChatOpen: setIsChatOpen,
  })

  // Módulos de práctica de la Pi (Linux y EV3): mismo patrón que
  // usePracticeSession -- se instancia una sola vez acá (nunca se desmonta, a
  // diferencia de HomeContainer, que sí se desmonta al navegar a la pestaña de
  // la sesión SSH) para que el polling de revalidación de progreso sobreviva
  // esa navegación.
  const linuxSession = useLinuxPracticeSession({
    onNewSession: handleNewSession,
    setChatOpen: setIsChatOpen,
    setCameraOpen: setCameraPanelOpen,
    // Convención de "fin de práctica" para TODA la app (ver
    // frontend/docs/practice-completion.md) -- al terminar un módulo,
    // volvemos a la pestaña de Inicio y a la vista de Prácticas, donde el
    // estudiante ve el módulo recién completado marcado con su insignia.
    // Cualquier práctica nueva (no solo Linux) que agregue su propio "flujo
    // de completar" debe reusar este mismo patrón: handleOpenPanel('practices').
    //
    // OJO: acá NO alcanza con setActiveTabId(HOME_TAB_ID) + setSelectedPage
    // a mano (bug real encontrado en producción) -- useAppTabs tiene un
    // efecto ("Auto-switch to first connected session when entering
    // terminal view") que, si `activePanel` se queda en 'terminal' mientras
    // `activeTabId` pasa a home, rebota de inmediato de vuelta a la sesión.
    // `handleOpenPanel` actualiza `activePanel` y `activeTabId` juntos (vía
    // `openPanel`), así que ese efecto nunca llega a dispararse.
    onModuleCompleted: () => {
      requestPracticesFocus('linux')
      handleOpenPanel('practices')
    },
  })

  // `practiceMeta` (de usePracticeSession) solo conoce prácticas del flujo
  // viejo (Eve3, etc.) -- las de Linux mapean sessionId -> moduleId adentro
  // de linuxSession.sessionModuleMap, un mapa aparte. SessionContainer /
  // TerminalView solo saben leer `practiceMeta`, así que acá se fusionan en
  // uno combinado: sin esto, practiceMeta?.[sessionId] queda `undefined`
  // para sesiones Linux y TerminalView nunca recibe su practiceId (rompe el
  // bloqueo de modo/modelo del chat y cualquier feature que dependa de él).
  // Tipo explícito (no inferido): sin esto, las dos ramas del useMemo abajo
  // devuelven tipos distintos (PracticeSessionMeta vs. el shape local con
  // student opcional) y TS infiere la unión de ambos -- lo que hace que
  // `Object.entries(combinedPracticeMeta ?? {})` más abajo (ver
  // practicasAbiertas) caiga en el overload genérico de Object.entries y
  // tipe cada valor como `unknown` en vez de la forma real.
  type CombinedPracticeMeta = { practiceId: string; assignmentId?: number; student?: PracticeSessionMeta['student'] | null; robotDashboard?: boolean };
  const combinedPracticeMeta = useMemo<Record<string, CombinedPracticeMeta>>(() => {
    const linuxEntries = Object.entries(linuxSession.sessionModuleMap)
    if (linuxEntries.length === 0) return practiceMeta
    // `student` es opcional/nullable en el tipo local PracticeMeta de
    // SessionContainer (ver ese archivo) -- las entradas Linux solo aportan
    // practiceId, sin inventar assignmentId/student.
    const merged: Record<string, CombinedPracticeMeta> = { ...(practiceMeta ?? {}) }
    for (const [sessionId, moduleId] of linuxEntries) {
      // `robotDashboard`: los módulos con `environment.panels.robot_dashboard`
      // (EV3) piden el panel del robot dentro de la pestaña de su terminal.
      merged[sessionId] = {
        practiceId: String(moduleId),
        robotDashboard: !!linuxSession.sessionPanels[sessionId]?.robot_dashboard,
      }
    }
    return merged
  }, [practiceMeta, linuxSession.sessionModuleMap, linuxSession.sessionPanels])

  // Al iniciar una práctica, la barra lateral se colapsa para dejarle el espacio a la terminal y al
  // chat (el estudiante la puede volver a abrir). Solo cuando aparece una práctica nueva, no en cada render.
  const cantidadPracticas = Object.keys(combinedPracticeMeta ?? {}).length
  const cantidadPracticasPrevia = useRef(cantidadPracticas)
  useEffect(() => {
    if (cantidadPracticas > cantidadPracticasPrevia.current) setIsSidebarOpen(false)
    cantidadPracticasPrevia.current = cantidadPracticas
  }, [cantidadPracticas, setIsSidebarOpen])

  // ── Sesión y Autenticación ───────────────────────────────────────────────────
  const { isAuthenticated, isLoading } = useAuth()

  // Registro central de sesiones: solo prácticas cuya pestaña ya existe (de
  // ahí sale el nombre que se reporta).
  const practicasAbiertas = useMemo(() => {
    const abiertas: Record<string, PracticaAbierta> = {}
    for (const [sessionId, meta] of Object.entries(combinedPracticeMeta ?? {})) {
      const tab = tabs.find(t => t.id === sessionId)
      if (tab) abiertas[sessionId] = { practiceId: meta.practiceId, nombre: tab.label }
    }
    return abiertas
  }, [combinedPracticeMeta, tabs])
  const { finalizarTodas: finalizarPracticasReportadas } = usePracticeActivityReporter(practicasAbiertas, isAuthenticated)
  // Prueba de rendimiento de la Pi4 en curso: se sigue grabando aunque el admin cambie de sección.
  const rolEfectivo = useEffectiveRole()
  useGrabadorPrueba(isAuthenticated && canAccessPage('rendimiento', rolEfectivo))
  // práctica -> sesión de terminal donde se hace (para adjuntar el registro al entregarla en Moodle)
  const sesionPorPractica = useMemo(
    () => Object.fromEntries(Object.entries(linuxSession.sessionModuleMap).map(([sessionId, moduleId]) => [moduleId, sessionId])),
    [linuxSession.sessionModuleMap],
  )
  useUbicacionAppReporter(isAuthenticated)
  const { finalizar: finalizarUsoApp } = useUsoAppReporter(isAuthenticated)
  // Enlaces laboremoto://practica/<id> (desde una tarea de Moodle): abren la vista de Prácticas en esa práctica.
  useEnlacesApp(isAuthenticated, () => handleOpenPanel('practices'))

  // ── Ciclo de vida de tabs ────────────────────────────────────────────────────
  const { handleCloseTab } = useTabLifecycle({
    tabs,
    closeTab,
    clearPracticeMeta,
    stopLinuxSession: linuxSession.stopSession,
  })

  // ── Cierre de sesiones al salir de la cuenta ─────────────────────────────────
  // Cierra todas las pestañas de terminal por el mismo camino que la «x» de la
  // pestaña: guarda el log, desconecta el SSH y limpia la práctica. Va por refs
  // porque el store la llama desde logout(), fuera del ciclo de render.
  const tabsRef = useRef(tabs)
  tabsRef.current = tabs
  const handleCloseTabRef = useRef(handleCloseTab)
  handleCloseTabRef.current = handleCloseTab
  const finalizarPracticasRef = useRef(finalizarPracticasReportadas)
  finalizarPracticasRef.current = finalizarPracticasReportadas
  const finalizarUsoAppRef = useRef(finalizarUsoApp)
  finalizarUsoAppRef.current = finalizarUsoApp

  const cerrarTerminalesAbiertas = useCallback(async () => {
    const abiertas = tabsRef.current.filter(t => t.type === 'session' || t.type === 'local-terminal')
    await Promise.allSettled(abiertas.map(t => handleCloseTabRef.current(t.id)))
  }, [])

  // Antes de revocar el token: con él todavía vigente se avisa el fin de la
  // práctica y del uso de la app al registro de sesiones (si no, Actividad los deja «conectados»).
  const setBeforeLogout = useAppStore((s) => s.setBeforeLogout)
  useEffect(() => {
    setBeforeLogout(async () => {
      await cerrarTerminalesAbiertas()
      await Promise.all([finalizarPracticasRef.current(), finalizarUsoAppRef.current()])
    })
    return () => setBeforeLogout(null)
  }, [setBeforeLogout, cerrarTerminalesAbiertas])

  // La sesión también puede terminar sin pasar por logout() (token vencido o
  // revocado): igual se cierran las terminales de esa cuenta para que no le
  // queden abiertas a la siguiente. Solo en la transición, para no tocar las
  // sesiones SSH de invitado que se abren sin haber iniciado sesión.
  const estabaAutenticado = useRef(isAuthenticated)
  useEffect(() => {
    if (estabaAutenticado.current && !isAuthenticated) void cerrarTerminalesAbiertas()
    estabaAutenticado.current = isAuthenticated
  }, [isAuthenticated, cerrarTerminalesAbiertas])

  // «Repetir de cero» del administrador al reabrir un módulo completo (ver PracticesPage): un rol
  // operativo necesita poder rehacer un módulo ya completo para revisar
  // comportamientos -- por ahora es exclusivo de `admin` (ver
  // usePermissions.ts), a futuro se abre a una lista de roles configurable.
  // Reusa el mismo cierre de sesión "real" que ya existe para el botón de
  // cerrar pestaña (desconecta el SSH, corta el polling, limpia
  // resultados/respuestas de quiz de ese módulo) y borra la insignia para
  // que vuelva a verse como no completado.
  const handleRestartLinuxModule = useCallback(async (moduleId: string) => {
    const existingSessionId = Object.entries(linuxSession.sessionModuleMap).find(([, mid]) => mid === moduleId)?.[0]
    if (existingSessionId) {
      await handleCloseTab(existingSessionId)
    }
    clearModuleBadge(moduleId)
  }, [linuxSession.sessionModuleMap, handleCloseTab])

  // ── Páginas de contexto ──────────────────────────────────────────────────────
  const HOME_PAGES = ['landing', 'connect', 'ssh-guest', 'hosts', 'themes', 'logs', 'practices', 'moodle-test', 'reservas', 'mis-cursos', 'admin-users', 'vigilancia', 'dashboard', 'rendimiento']
  const SESSION_PAGES = ['logs']

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
        <SesionPorPracticaContext.Provider value={sesionPorPractica}>
        <Notifications position="bottom-right" zIndex={9998} />
        <ResultadoMoodleAviso resultados={linuxSession.results} habilitado={isAuthenticated} />
        <BienvenidaTutorial abrirPagina={handleOpenPanel} />
        <TourPracticaLinux />
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
              showSessionActions={isSessionActive}
              sesionMosaico={(isSessionActive && !combinedPracticeMeta?.[activeTab.id]) || activeTab.type === 'local-terminal' ? activeTab.id : null}
              sesionMosaicoLocal={activeTab.type === 'local-terminal'}
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
            <main id="contenido" tabIndex={-1} className="content-area">
              {activeTab.type === 'home' && (
                <div style={{ height: '100%' }}>
                  <HomeContainer
                    selectedPage={selectedPage}
                    onOpenPanel={handleOpenPanel}
                    onConnectedFromConnect={handleNewSession}
                    onOpenLog={openLogTab}
                    onStartPractice={handleStartPractice}
                    setChatOpen={setIsChatOpen}
                    linuxSession={linuxSession}
                    onRestartLinuxModule={handleRestartLinuxModule}
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
                onOpenLog={openLogTab}
                practiceMeta={combinedPracticeMeta}
                onCloseTab={handleCloseTab}
                linuxSession={linuxSession}
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
          open={!!updateInfo && !updating}
          version={updateInfo?.version}
          notes={updateInfo?.notes}
          onConfirm={confirmInstallUpdate}
          onCancel={dismissUpdate}
        />
        {updating && updateProgress && (
          <UpdateProgressOverlay progress={updateProgress} onCancel={cancelUpdate} />
        )}
        </SesionPorPracticaContext.Provider>
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
