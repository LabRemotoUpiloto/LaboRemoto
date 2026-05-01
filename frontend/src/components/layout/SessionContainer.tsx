import React from 'react'
import TerminalView from '../terminal/TerminalView'
import SftpPage from '../../pages/session/SftpPage'
import SnippetsPage from '../../pages/session/SnippetsPage'
import LogsPage from '../../pages/session/LogsPage'
import type { Tab } from '../../hooks/useAppTabs'
import type { SessionLog } from '../logs/SessionCard'

type PracticeMeta = {
  practiceId: string
  assignmentId?: number
  student: { id: number; username: string; fullname: string; email: string }
}

type Props = {
  tabs: Tab[]
  activeTabId: string
  practiceMeta?: Record<string, PracticeMeta>
  selectedPage: string
  activeView: 'terminal' | 'escritorio'
  isCameraOpen: boolean
  isChatOpen: boolean
  onCloseChat: () => void
  sessionMeta: Record<string, { label: string }>
  onOpenLog: (session: SessionLog) => void
  sftpPaths: Record<string, string>
  setSftpPaths: React.Dispatch<React.SetStateAction<Record<string, string>>>
}

const SessionContainer: React.FC<Props> = ({
  tabs,
  activeTabId,
  practiceMeta,
  selectedPage,
  activeView,
  isCameraOpen,
  isChatOpen,
  onCloseChat,
  sessionMeta,
  onOpenLog,
  sftpPaths,
  setSftpPaths
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
            <TerminalView
              sessionId={t.id}
              activeView={activeView}
              isCameraOpen={isCameraOpen}
              isChatOpen={isChatOpen}
              onCloseChat={onCloseChat}
              isTabActive={activeTabId === t.id}
              practiceId={practiceMeta?.[t.id]?.practiceId ?? null}
              assignmentId={practiceMeta?.[t.id]?.assignmentId}
              student={practiceMeta?.[t.id]?.student ?? null}
            />
          </div>
          {selectedPage === 'sftp' && (
            <SftpPage
              sessions={tabs.filter(tt => tt.type === 'session').map(tt => tt.id)}
              sessionsMeta={sessionMeta}
              activeSessionId={t.id}
              initialPath={sftpPaths[t.id]}
              onPathChange={(path) => setSftpPaths(prev => ({ ...prev, [t.id]: path }))}
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

