import React from 'react'
import './StatusBar.css'

interface StatusBarProps {
  sessionInfo?: { host: string; user: string } | null
  sessionCount: number
}

const StatusBar: React.FC<StatusBarProps> = ({ sessionInfo, sessionCount }) => {
  return (
    <div className="statusbar">
      {sessionInfo && (
        <div className="sbi hi">{sessionInfo.user}@{sessionInfo.host}</div>
      )}
      <div className="sbi">bash</div>
      <div className="sbr">
        <div className="sbi">{sessionCount} sesión{sessionCount !== 1 ? 'es' : ''}</div>
        <div className="sbi">UTF-8</div>
      </div>
    </div>
  )
}

export default StatusBar
