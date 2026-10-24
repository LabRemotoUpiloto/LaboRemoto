import React from 'react'
import LandingPage from '@/features/inicio/LandingPage'
import ConexionesPage from '@/features/conexion/ConexionesPage'
import GuestConnectPage from '@/features/conexion/GuestConnectPage'
import ThemesPage from '@/features/cuenta/ThemesPage'
import PerfilPage from '@/features/cuenta/PerfilPage'
import AjustesPage from '@/features/cuenta/AjustesPage'
import SftpPage from '@/features/sftp/SftpPage'
import SnippetsPage from '@/features/snippets/SnippetsPage'
import PracticesPage from '@/features/practicas/PracticesPage'
import ReservasPage from '@/features/reservas/ReservasPage'
import MisCursosPage from '@/features/cursos/MisCursosPage'
import UserManagementPage from '@/features/usuarios/UserManagementPage'
import VigilanciaPage from '@/features/camaras/VigilanciaPage'
import DashboardPage from '@/features/actividad/DashboardPage'
import RendimientoPage from '@/features/monitoreo/RendimientoPage'
import type { Tab } from '../hooks/useAppTabs'
import type { SessionLog } from '@/features/logs/sesiones'
import { useEffectiveRole, canAccessPage } from '@/features/cuenta/usePermissions'
import type { LinuxPracticeSessionApi } from '@/features/practicas/useLinuxPracticeSession'
import { pedirTutorialBienvenida } from '@/features/onboarding/inicio/BienvenidaTutorial'

type Props = {
  tabs: Tab[]
  sessionMeta: Record<string, { label: string }>
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
  tabs,
  sessionMeta,
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
      ) : effectivePage === 'sftp' ? (
        <SftpPage
          sessions={tabs.filter(t => t.type === 'session').map(t => t.id)}
          sessionsMeta={sessionMeta}
          activeSessionId={(() => {
            const sessionTabs = tabs.filter(t => t.type === 'session')
            return sessionTabs.length > 0 ? sessionTabs[0].id : undefined
          })()}
        />
      ) : effectivePage === 'snippets' ? (
        <SnippetsPage />
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
    </div>
  )
}

export default HomeContainer
