import React from 'react'
import TerminalView from '../terminal/TerminalView'
import SftpPage from '../../pages/SftpPage'
import SnippetsPage from '../../pages/SnippetsPage'
import LogsPage from '../../pages/LogsPage'
import type { Tab } from '../../hooks/useAppTabs'
import type { SessionLog } from '../logs/SessionCard'

type Props = {
  tabs: Tab[]
  activeTabId: string
  selectedPage: string
  activeView: 'terminal' | 'escritorio'
  isCameraOpen: boolean
  isChatOpen: boolean
  onCloseChat: () => void
  sessionMeta: Record<string, { label: string }>
  onOpenLog: (session: SessionLog) => void
}

const SessionContainer: React.FC<Props> = ({
  tabs,
  activeTabId,
  selectedPage,
  activeView,
  isCameraOpen,
  isChatOpen,
  onCloseChat,
  sessionMeta,
  onOpenLog
}) => {
  return (
    <>
      {tabs.filter(t => t.type === 'session').map(t => (
        <div key={t.id} style={{ display: activeTabId === t.id ? 'block' : 'none', height: '100%', width: '100%' }}>
          <div
            style={{
              display: selectedPage === 'sftp' || selectedPage === 'snippets' || selectedPage === 'logs' ? 'none' : 'block',
              height: '100%',
              width: '100%'
            }}
          >
            <TerminalView sessionId={t.id} activeView={activeView} isCameraOpen={isCameraOpen} isChatOpen={isChatOpen} onCloseChat={onCloseChat} />
          </div>
          {selectedPage === 'sftp' && (
            <SftpPage
              sessions={tabs.filter(tt => tt.type === 'session').map(tt => tt.id)}
              sessionsMeta={sessionMeta}
              activeSessionId={t.id}
            />
          )}
          {selectedPage === 'snippets' && <SnippetsPage />}
          {selectedPage === 'logs' && <LogsPage onOpenLog={onOpenLog} />}
        </div>
      ))}
    </>
  )
}

export default SessionContainer

