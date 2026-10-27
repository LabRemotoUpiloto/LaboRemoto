import React, { Suspense } from 'react'
import LandingPage from '@/features/inicio/LandingPage'
// Inicio llega con la app; las demás páginas se cargan aparte (app/diferidos.ts), casi siempre antes de que alguien las abra
import {
  AjustesPage, ConexionesPage, DashboardPage, GuestConnectPage, MisCursosPage, PerfilPage, PracticesPage, ReservasPage,
  RendimientoPage, ThemesPage, UserManagementPage, VigilanciaPage,
} from '@/app/diferidos'
import type { SessionLog } from '@/features/logs/sesiones'
import { useEffectiveRole, canAccessPage } from '@/features/cuenta/usePermissions'
import type { LinuxPracticeSessionApi } from '@/features/practicas/useLinuxPracticeSession'
import { pedirTutorialBienvenida } from '@/features/onboarding/inicio/BienvenidaTutorial'

type Props = {
  selectedPage: string
  onOpenPanel: (panelId: string) => void
  onConnectedFromConnect: (info: { id: string; label?: string } | null) => void
  onOpenLog: (session: SessionLog) => void
  onStartPractice?: (practice: any) => Promise<void>
  setChatOpen?: (open: boolean) => void
  /** Instancia única de useLinuxPracticeSession, ver App.tsx. */
  linuxSession?: LinuxPracticeSessionApi
  /** «Repetir de cero» del administrador al reabrir un módulo completo (PracticesPage) -- ver App.tsx. */
  onRestartLinuxModule?: (moduleId: string) => Promise<void>
}

const HomeContainer: React.FC<Props> = ({
  selectedPage,
  onOpenPanel,
  onConnectedFromConnect,
  onOpenLog,
  onStartPractice,
  setChatOpen,
  linuxSession,
  onRestartLinuxModule
}) => {
  const role = useEffectiveRole()
  // Segunda verificación: si selectedPage llegó aquí por un deep-link/estado
  // restaurado a una página que este rol no debería ver (la sidebar ya no
  // ofrece el botón, pero eso no impide que selectedPage tome ese valor por
  // otra vía), cae a landing en vez de renderizar la página restringida.
  const effectivePage = canAccessPage(selectedPage, role) ? selectedPage : 'landing'

  return (
    <div style={{ height: '100%' }}>
      <Suspense fallback={<CargandoPagina />}>
      {effectivePage === 'landing' ? (
        <LandingPage
          onStartTutorial={pedirTutorialBienvenida}
          onOpenPanel={onOpenPanel}
        />
      ) : effectivePage === 'connect' || effectivePage === 'hosts' || effectivePage === 'logs' ? (
        // Equipos guardados y Sesiones SSH viven en Conexiones (id viejos: enlaces y el recorrido guiado aún los usan)
        <ConexionesPage onConnected={onConnectedFromConnect} onOpenLog={onOpenLog}
          pestanaInicial={effectivePage === 'logs' ? 'registros' : 'equipos'} />
      ) : effectivePage === 'ssh-guest' ? (
        <GuestConnectPage onConnected={onConnectedFromConnect} onBack={() => onOpenPanel('landing')} />
      ) : effectivePage === 'themes' ? (
        <ThemesPage />
      ) : effectivePage === 'practices' || effectivePage === 'encuestas' ? (
        <PracticesPage pestanaInicial={effectivePage === 'encuestas' ? 'encuestas' : 'practicas'} onStartPractice={onStartPractice} onNewSession={onConnectedFromConnect} setChatOpen={setChatOpen} linuxSession={linuxSession} onRestartLinuxModule={onRestartLinuxModule} />
      ) : effectivePage === 'reservas' ? (
        <ReservasPage />
      ) : effectivePage === 'mis-cursos' ? (
        <MisCursosPage />
      ) : effectivePage === 'admin-users' ? (
        <UserManagementPage />
      ) : effectivePage === 'vigilancia' ? (
        <VigilanciaPage />
      ) : effectivePage === 'dashboard' ? (
        <DashboardPage />
      ) : effectivePage === 'rendimiento' ? (
        <RendimientoPage onOpenPanel={onOpenPanel} />
      ) : effectivePage === 'perfil' ? (
        <PerfilPage />
      ) : effectivePage === 'ajustes' ? (
        <AjustesPage onOpenPanel={onOpenPanel} />
      ) : (
        <LandingPage
          onStartTutorial={pedirTutorialBienvenida}
          onOpenPanel={onOpenPanel}
        />
      )}
      </Suspense>
    </div>
  )
}

/** Si la página todavía no había terminado de cargar de fondo: un instante, con el fondo de la página. */
function CargandoPagina() {
  return (
    <div role="status" className="flex h-full items-center justify-center bg-ui-fondo text-[13px] text-ui-apagado">
      Cargando…
    </div>
  )
}

export default HomeContainer
