import React from 'react'
import LandingPage from '../../pages/LandingPage'
import ConnectFormPage from '../../pages/ConnectFormPage'
import SavedHostsPage from '../../pages/SavedHostsPage'
import ThemesPage from '../../pages/ThemesPage'
import LogsPage from '../../pages/LogsPage'
import SftpPage from '../../pages/SftpPage'
import SnippetsPage from '../../pages/SnippetsPage'
import type { Tab } from '../../hooks/useAppTabs'
import type { SessionLog } from '../logs/SessionCard'

type Props = {
  tabs: Tab[]
  sessionMeta: Record<string, { label: string }>
  setSessionMeta: React.Dispatch<React.SetStateAction<Record<string, { label: string }>>>
  selectedPage: string
  setSelectedPage: (page: string) => void
  pendingHost: any | null
  setPendingHost: (payload: any | null) => void
  onConnectedFromConnect: (info: { id: string; label?: string } | null) => void
  onOpenLog: (session: SessionLog) => void
}

const HomeContainer: React.FC<Props> = ({
  tabs,
  sessionMeta,
  setSessionMeta,
  selectedPage,
  setSelectedPage,
  pendingHost,
  setPendingHost,
  onConnectedFromConnect,
  onOpenLog
}) => {
  return (
    <div style={{ height: '100%' }}>
      {selectedPage === 'landing' ? (
        <LandingPage
          onStartTutorial={() => setSelectedPage('landing')}
          onPageChange={setSelectedPage}
        />
      ) : selectedPage === 'connect' ? (
        <ConnectFormPage onConnected={onConnectedFromConnect} initialPayload={pendingHost} />
      ) : selectedPage === 'hosts' ? (
        <SavedHostsPage
          onConnected={(sessionId: string, label: string) => {
            setSessionMeta(prev => ({ ...prev, [sessionId]: { label } }))
            // Abrir pestaña de sesión (igual que al conectar desde ConnectForm)
            onConnectedFromConnect({ id: sessionId, label })
          }}
          onEdit={(hostData, originalFile) => {
            setPendingHost({ ...hostData, _originalFile: originalFile })
            setSelectedPage('connect')
          }}
        />
      ) : selectedPage === 'themes' ? (
        <ThemesPage />
      ) : selectedPage === 'logs' ? (
        <LogsPage onOpenLog={onOpenLog} />
      ) : selectedPage === 'sftp' ? (
        <SftpPage
          sessions={tabs.filter(t => t.type === 'session').map(t => t.id)}
          sessionsMeta={sessionMeta}
          activeSessionId={(() => {
            const sessionTabs = tabs.filter(t => t.type === 'session')
            return sessionTabs.length > 0 ? sessionTabs[0].id : undefined
          })()}
        />
      ) : selectedPage === 'snippets' ? (
        <SnippetsPage />
      ) : (
        <LandingPage
          onStartTutorial={() => setSelectedPage('landing')}
          onPageChange={setSelectedPage}
        />
      )}
    </div>
  )
}

export default HomeContainer
