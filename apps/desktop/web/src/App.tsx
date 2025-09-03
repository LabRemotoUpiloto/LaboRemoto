import React from 'react'
import ConnectForm from './components/ConnectForm'
import TerminalPane from './components/TerminalPane'

export default function App() {
  const [sessionId, setSessionId] = React.useState<string | null>(null)

  return (
    <div style={{ height: '100%', display: 'grid', gridTemplateRows: 'auto 1fr' }}>
      <header style={{ padding: '8px 16px', borderBottom: '1px solid #222C3A', display: 'flex', alignItems: 'center', gap: 12 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600 }}>SSH AI Client</h1>
        <span style={{ fontSize: 12, opacity: 0.7 }}>MVP • russh + xterm.js</span>
      </header>
      <main style={{ display: 'grid', gridTemplateColumns: '360px 1fr', height: '100%' }}>
        <aside style={{ borderRight: '1px solid #222C3A', padding: 12, overflow: 'auto' }}>
          <ConnectForm onConnected={(id) => setSessionId(id)} />
        </aside>
        <section style={{ padding: 0, overflow: 'hidden' }}>
          <TerminalPane sessionId={sessionId} />
        </section>
      </main>
    </div>
  )
}
