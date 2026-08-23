import React, { useEffect } from 'react'
import LandingPage from '../../pages/home/LandingPage'
import ConnectFormPage from '../../pages/connection/ConnectFormPage'
import GuestConnectPage from '../../pages/connection/GuestConnectPage'
import SavedHostsPage from '../../pages/connection/SavedHostsPage'
import ThemesPage from '../../pages/settings/ThemesPage'
import PerfilPage from '../../pages/settings/PerfilPage'
import AjustesPage from '../../pages/settings/AjustesPage'
import LogsPage from '../../pages/logs/LogsPage'
import SftpPage from '../../pages/session/SftpPage'
import SnippetsPage from '../../pages/session/SnippetsPage'
import PracticesPage from '../../pages/practices/PracticesPage'
import ReservasPage from '../../pages/reservas/ReservasPage'
import UserManagementPage from '../../pages/admin/UserManagementPage'
import VigilanciaPage from '../../pages/vigilancia/VigilanciaPage'
import type { Tab } from '../../hooks/useAppTabs'
import type { SessionLog } from '../logs/SessionCard'
import { useAccessTier, canAccessPage, useCanAccessVigilancia } from '../../hooks/usePermissions'

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
  onStartPractice
}) => {
  const tier = useAccessTier()
  const canSeeVigilancia = useCanAccessVigilancia()
  // Segunda verificación: si selectedPage llegó aquí por un deep-link/estado
  // restaurado a una página que este rol no debería ver (la sidebar ya no
  // ofrece el botón, pero eso no impide que selectedPage tome ese valor por
  // otra vía), cae a landing en vez de renderizar la página restringida.
  // 'vigilancia' se valida por rol directo (no por tier/PAGE_ACCESS, ver
  // usePermissions.canAccessVigilancia) — sin este caso especial, al no
  // estar listado en PAGE_ACCESS, canAccessPage lo dejaría pasar para
  // cualquier tier por el fallback "ids no listados quedan abiertos".
  const effectivePage = selectedPage === 'vigilancia'
    ? (canSeeVigilancia ? 'vigilancia' : 'landing')
    : (canAccessPage(selectedPage, tier) ? selectedPage : 'landing')

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
          onStartTutorial={() => onOpenPanel('landing')}
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
        <PracticesPage onStartPractice={onStartPractice} onNewSession={onConnectedFromConnect} />
      ) : effectivePage === 'reservas' ? (
        <ReservasPage />
      ) : effectivePage === 'admin-users' ? (
        <UserManagementPage />
      ) : effectivePage === 'vigilancia' ? (
        <VigilanciaPage />
      ) : effectivePage === 'perfil' ? (
        <PerfilPage />
      ) : effectivePage === 'ajustes' ? (
        <AjustesPage onOpenPanel={onOpenPanel} />
      ) : (
        <LandingPage
          onStartTutorial={() => onOpenPanel('landing')}
          onOpenPanel={onOpenPanel}
        />
      )}
    </div>
  )
}

export default HomeContainer
