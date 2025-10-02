import React from 'react'

/**
 * PinsPanel: placeholder para pines de Raspberry Pi (UI futura).
 */
const PinsPanel: React.FC = () => {
  return (
    <div style={{display:'flex',flexDirection:'column',gap:8,height:'100%'}}>
      <header style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <strong>Pines Raspberry Pi</strong>
      </header>
      <div style={{flex:'1 1 auto',minHeight:0,display:'flex',alignItems:'center',justifyContent:'center',opacity:.8}}>
        <span>Contenido próximamente…</span>
      </div>
    </div>
  )
}

export default PinsPanel
