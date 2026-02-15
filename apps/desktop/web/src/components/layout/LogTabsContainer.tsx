import React from 'react'
import LogDetailPage from '../../pages/LogDetailPage'
import type { Tab } from '../../hooks/useAppTabs'

type Props = {
  tabs: Tab[]
  activeTabId: string
}

const LogTabsContainer: React.FC<Props> = ({ tabs, activeTabId }) => {
  return (
    <>
      {tabs.filter(t => t.type === 'log').map(t => (
        <div key={t.id} style={{ display: activeTabId === t.id ? 'block' : 'none', height: '100%', width: '100%' }}>
          {t.logData && <LogDetailPage session={t.logData} />}
        </div>
      ))}
    </>
  )
}

export default LogTabsContainer

