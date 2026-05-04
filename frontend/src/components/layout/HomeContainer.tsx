import React from 'react'
import LandingPage from '../../pages/home/LandingPage'
import ConnectFormPage from '../../pages/connection/ConnectFormPage'
import SavedHostsPage from '../../pages/connection/SavedHostsPage'
import ThemesPage from '../../pages/settings/ThemesPage'
import LogsPage from '../../pages/logs/LogsPage'
import SftpPage from '../../pages/session/SftpPage'
import SnippetsPage from '../../pages/session/SnippetsPage'
import PracticesPage from '../../pages/practices/PracticesPage'
import type { Tab } from '../../hooks/useAppTabs'
import type { SessionLog } from '../logs/SessionCard'

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
  return (
    <div style={{ height: '100%' }}>
      {selectedPage === 'landing' ? (
        <LandingPage
          onStartTutorial={() => onOpenPanel('landing')}
          onOpenPanel={onOpenPanel}
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
            onOpenPanel('connect')
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
      ) : selectedPage === 'practices' ? (
        <PracticesPage onStartPractice={onStartPractice} />
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
