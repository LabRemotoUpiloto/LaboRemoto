import React, { useEffect } from 'react'
import LandingPage from '@/features/inicio/LandingPage'
import ConnectFormPage from '@/features/conexion/ConnectFormPage'
import GuestConnectPage from '@/features/conexion/GuestConnectPage'
import SavedHostsPage from '@/features/conexion/SavedHostsPage'
import ThemesPage from '@/features/cuenta/ThemesPage'
import PerfilPage from '@/features/cuenta/PerfilPage'
import AjustesPage from '@/features/cuenta/AjustesPage'
import LogsPage from '@/features/logs/LogsPage'
import SftpPage from '@/features/sftp/SftpPage'
import SnippetsPage from '@/features/snippets/SnippetsPage'
import PracticesPage from '@/features/practicas/PracticesPage'
import ReservasPage from '@/features/reservas/ReservasPage'
import MisCursosPage from '@/features/cursos/MisCursosPage'
import UserManagementPage from '@/features/usuarios/UserManagementPage'
import VigilanciaPage from '@/features/camaras/VigilanciaPage'
import DashboardPage from '@/features/actividad/DashboardPage'
import EncuestasPage from '@/features/actividad/EncuestasPage'
import RendimientoPage from '@/features/monitoreo/RendimientoPage'
import type { Tab } from '../hooks/useAppTabs'
import type { SessionLog } from '@/features/logs/sesiones'
import { useEffectiveRole, canAccessPage } from '@/features/cuenta/usePermissions'
import type { LinuxPracticeSessionApi } from '@/features/practicas/useLinuxPracticeSession'
import { pedirTutorialBienvenida } from '@/features/onboarding/inicio/BienvenidaTutorial'

type Props = {
  tabs: Tab[]
  sessionMeta: Record<string, { label: string }>
  setSessionMeta: React.Dispatch<React.SetStateAction<Record<string, { label: string }>>>
  selectedPage: string
  onOpenPanel: (panelId: string) => void
  pendingHost: any | null
  setPendingHost: (payload: any | null) => void
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
  setSessionMeta,
  selectedPage,
  onOpenPanel,
  pendingHost,
  setPendingHost,
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

  // ConnectFormPage solo lee pendingHost una vez al montarse (ver el comentario
  // en useConnectionForm) -- lo limpiamos acá apenas se consume para que una
  // visita posterior a "Conexión" que NO venga de "Editar" no encuentre datos
  // viejos dando vueltas.
  useEffect(() => {
    if (effectivePage === 'connect' && pendingHost) {
      setPendingHost(null)
    }
  }, [effectivePage])

  return (
    <div style={{ height: '100%' }}>
      {effectivePage === 'landing' ? (
        <LandingPage
          onStartTutorial={pedirTutorialBienvenida}
          onOpenPanel={onOpenPanel}
        />
      ) : effectivePage === 'connect' ? (
        <ConnectFormPage onConnected={onConnectedFromConnect} initialPayload={pendingHost} />
      ) : effectivePage === 'ssh-guest' ? (
        <GuestConnectPage onConnected={onConnectedFromConnect} onBack={() => onOpenPanel('landing')} />
      ) : effectivePage === 'hosts' ? (
        <SavedHostsPage
          onConnected={(sessionId: string, label: string) => {
            setSessionMeta(prev => ({ ...prev, [sessionId]: { label } }))
            // Abrir pestaña de sesión (igual que al conectar desde ConnectForm)
            onConnectedFromConnect({ id: sessionId, label })
          }}
          onEdit={(hostData, originalFile) => {
            setPendingHost({ ...hostData, _originalFile: originalFile })
            onOpenPanel('connect')
          }}
        />
      ) : effectivePage === 'themes' ? (
        <ThemesPage />
      ) : effectivePage === 'logs' ? (
        <LogsPage onOpenLog={onOpenLog} />
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
      ) : effectivePage === 'practices' ? (
        <PracticesPage onStartPractice={onStartPractice} onNewSession={onConnectedFromConnect} setChatOpen={setChatOpen} linuxSession={linuxSession} onRestartLinuxModule={onRestartLinuxModule} />
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
      ) : effectivePage === 'encuestas' ? (
        <EncuestasPage />
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
