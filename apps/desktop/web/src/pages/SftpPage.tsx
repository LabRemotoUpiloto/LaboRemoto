import React, { useEffect, useMemo, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import FileIcon from '../components/FileIcon'
import ContextMenu from '../components/ContextMenu'

type Props = { sessions: string[]; activeSessionId?: string }
type SftpEntry = { name: string; path: string; kind: string; size?: number; perms?: string; mtime?: number }
type LocalEntry = { name: string; path: string; kind: string; size?: number; mtime?: number }

const CrumbBar: React.FC<{ rootLabel: string; path: string; onNavigate: (p: string) => void; prefix?: string }>=({rootLabel,path,onNavigate,prefix})=>{
  const segs = useMemo(()=>{
    const norm = path.replace(/\\/g,'/');
    const parts = norm.split('/').filter(Boolean);
    let acc = prefix ?? (norm.startsWith('/')? '/':'');
    const crumbs: {name:string; full:string}[] = [];
    if(acc==='/') crumbs.push({name:'/', full:'/'});
    for(const p of parts){
      acc = acc ? (acc.endsWith('/')? acc+p : acc+'/'+p) : p;
      crumbs.push({name:p, full:acc});
    }
    return crumbs;
  },[path,prefix]);
  return (
    <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
      <span style={{opacity:.8}}>{rootLabel}</span>
      <span style={{opacity:.35}}>/</span>
      {segs.map((c,i)=> (
        <React.Fragment key={c.full}>
          <button onClick={()=>onNavigate(c.full)} style={{background:'transparent',border:'none',color:'var(--text)',cursor:'pointer',padding:0}}>{c.name}</button>
          {i<segs.length-1 && <span style={{opacity:.35}}>/</span>}
        </React.Fragment>
      ))}
    </div>
  )
}

const Table: React.FC<{ cols: string[]; rows: React.ReactNode[][]; onRowDoubleClick?: (index: number) => void; onRowClick?: (index:number)=>void; selectedIndex?: number; onSort?: (colIndex:number)=>void; onContextMenuRow?: (index:number, e: React.MouseEvent)=>void }>=({cols,rows,onRowDoubleClick,onRowClick,selectedIndex,onSort,onContextMenuRow})=>{
  return (
    <table style={{width:'100%',borderCollapse:'collapse'}}>
      <thead>
        <tr>
          {cols.map((c,i)=> (
            <th key={c} style={{textAlign:'left',borderBottom:'1px solid var(--border)',padding:'6px 4px'}}>
              <button onClick={()=>onSort?.(i)} style={{all:'unset',cursor:onSort? 'pointer':'default'}}>{c}</button>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length===0 ? <tr><td colSpan={cols.length} style={{opacity:.7,padding:'8px 4px'}}>Vacío</td></tr> : rows.map((r,i)=> (
          <tr key={i} className="file-row" onClick={()=> onRowClick?.(i)} onDoubleClick={()=> onRowDoubleClick?.(i)} onContextMenu={(e)=>{ e.preventDefault(); onContextMenuRow?.(i, e) }} style={{cursor: onRowDoubleClick? 'pointer': undefined, background: selectedIndex===i? 'rgba(125,125,200,0.15)': undefined}}>
            {r.map((cell,j)=> <td key={j} style={{padding:'6px 4px',borderBottom:'1px solid rgba(0,0,0,0.05)'}}>{cell}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const SftpPage: React.FC<Props> = ({ sessions, activeSessionId }) => {
  const [sessionId, setSessionId] = useState<string | undefined>(activeSessionId)
  useEffect(()=> setSessionId(activeSessionId), [activeSessionId])
  const canUse = useMemo(()=> !!sessionId, [sessionId])

  // local
  const [lpath, setLpath] = useState<string>('')
  const [lrows, setLrows] = useState<LocalEntry[]>([])
  const [lload, setLload] = useState(false)
  const [ldrives, setLdrives] = useState<string[]>([])
  const [lSelectedPath, setLSelectedPath] = useState<string|undefined>()
  const [lSort, setLSort] = useState<{key: 'name'|'mtime'|'size'|'kind'; dir: 'asc'|'desc'}>({key:'name',dir:'asc'})
  const ldisplay = useMemo(()=>{
    const arr = [...lrows]
    const cmp = (a:LocalEntry,b:LocalEntry)=>{
      const mult = lSort.dir==='asc'? 1 : -1
      switch(lSort.key){
        case 'name': return a.name.localeCompare(b.name) * mult
        case 'mtime': return ((a.mtime||0) - (b.mtime||0)) * mult
        case 'size': return ((a.size||0) - (b.size||0)) * mult
        case 'kind': return a.kind.localeCompare(b.kind) * mult
      }
    }
    arr.sort(cmp as any)
    return arr
  },[lrows,lSort])
  const refreshLocal = async (nextRoot?: string)=>{
    try{
      setLload(true)
      let root = nextRoot ?? lpath
      if(!root){ root = await invoke<string>('local_home_dir'); setLpath(root) }
      if(ldrives.length===0){ try{ const d = await invoke<string[]>('local_list_drives'); setLdrives(d) }catch{} }
      const list = await invoke<LocalEntry[]>('local_list_dir', { path: root })
      setLrows(list||[])
    } finally { setLload(false) }
  }
  useEffect(()=>{ refreshLocal() },[])

  useEffect(()=>{
    // clear selection if path changed
    setLSelectedPath(undefined)
  },[lpath])

  // remote
  const [rpath, setRpath] = useState<string>('/')
  const [rrows, setRrows] = useState<SftpEntry[]>([])
  const [rload, setRload] = useState(false)
  const [rerr, setRerr] = useState<string|undefined>()
  const [rSelectedPath, setRSelectedPath] = useState<string|undefined>()
  const [rSort, setRSort] = useState<{key: 'name'|'mtime'|'size'|'kind'; dir: 'asc'|'desc'}>({key:'name',dir:'asc'})
  const rdisplay = useMemo(()=>{
    const arr = [...rrows]
    const cmp = (a:SftpEntry,b:SftpEntry)=>{
      const mult = rSort.dir==='asc'? 1 : -1
      switch(rSort.key){
        case 'name': return a.name.localeCompare(b.name) * mult
        case 'mtime': return ((a.mtime||0) - (b.mtime||0)) * mult
        case 'size': return ((a.size||0) - (b.size||0)) * mult
        case 'kind': return a.kind.localeCompare(b.kind) * mult
      }
    }
    arr.sort(cmp as any)
    return arr
  },[rrows,rSort])
  const [ctx, setCtx] = useState<{open:boolean; x:number; y:number; side:'local'|'remote'; index:number|null}>({open:false,x:0,y:0,side:'local',index:null})
  useEffect(()=>{
    const close = ()=> setCtx(c=> ({...c, open:false}))
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    window.addEventListener('click', (e)=>{
      // Close when clicking outside tables (ContextMenu itself handles inside click)
      if ((e.target as HTMLElement)?.closest('table')) return
      close()
    })
    return ()=>{
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  },[])
  const refreshRemote = async ()=>{
    if(!sessionId) return
    setRload(true); setRerr(undefined)
    try{
      await invoke('sftp_open', { id: sessionId })
      const list = await invoke<SftpEntry[]>('sftp_list', { id: sessionId, path: rpath })
      setRrows(list||[])
    }catch(e:any){ setRerr(e?.toString?.()||'Error') }
    finally{ setRload(false) }
  }
  useEffect(()=>{ if(canUse) refreshRemote() }, [canUse, rpath])

  useEffect(()=>{ setRSelectedPath(undefined) }, [rpath])

  // transfers panel
  type Transfer = { id:string; direction:'download'|'upload'; session_id?:string; remote_path?:string; local_path?:string; total?: number|null; bytes?: number; status: 'running'|'done'|'error'|'canceled'; message?: string }
  const [transfers, setTransfers] = useState<Transfer[]>([])
  useEffect(()=>{
    const unsubs: Array<() => void> = []
    let mounted = true
    listen('sftp_transfer', (e:any)=>{
      if(!mounted) return
      const p = e?.payload || {}
      setTransfers(prev => {
        const next = [...prev]
        const idx = next.findIndex(t=> t.id===p.id)
        if(p.type==='started'){
          const t: Transfer = { id: p.id, direction: p.direction, session_id: p.session_id, remote_path: p.remote_path, local_path: p.local_path, total: p.total ?? null, bytes: 0, status:'running' }
          if(idx>=0) next[idx] = t; else next.unshift(t)
        } else if(idx>=0) {
          const cur = next[idx]
          if(p.type==='progress'){
            cur.bytes = p.bytes; cur.total = p.total ?? cur.total
          } else if(p.type==='done'){
            cur.status='done'
          } else if(p.type==='canceled'){
            cur.status='canceled'
          } else if(p.type==='error'){
            cur.status='error'; cur.message = p.message
          }
          next[idx] = { ...cur }
        }
        return next
      })
    }).then(unsub=> unsubs.push(unsub))
    return ()=> { mounted=false; unsubs.forEach(u=>u()) }
  },[])

  const joinLocal = (base:string, name:string)=>{
    const isWin = /^[A-Za-z]:/.test(base)
    const sep = isWin? '\\' : '/'
    return base && !base.endsWith(sep) ? base+sep+name : base+name
  }
  const joinRemote = (base:string, name:string)=> (base==='/'? '/'+name : base.replace(/\/$/,'')+'/'+name)

  const doRemoteMkdir = async ()=>{
    if(!sessionId) return
    const name = window.prompt('Nombre de la carpeta nueva:')
    if(!name) return
    const p = joinRemote(rpath, name)
    try{ await invoke('sftp_mkdir', { id: sessionId, path: p }); refreshRemote() }catch(e:any){ alert('mkdir: '+(e?.toString?.()||e)) }
  }
  const doRemoteRename = async ()=>{
    if(!sessionId || !rSelectedPath) return
    const entry = rrows.find(x=> x.path===rSelectedPath || joinRemote(rpath, x.name)===rSelectedPath) || rrows.find(x=> joinRemote(rpath, x.name)===rSelectedPath)
    const oldName = entry?.name || rSelectedPath.split('/').pop()
    const name = window.prompt('Nuevo nombre:', oldName || '')
    if(!name) return
    const parent = rSelectedPath.replace(/\/$/,'').split('/').slice(0,-1).join('/') || '/'
    const to = parent==='/'? '/'+name : parent+'/'+name
    try{ await invoke('sftp_rename', { id: sessionId, from: rSelectedPath, to }); refreshRemote() }catch(e:any){ alert('rename: '+(e?.toString?.()||e)) }
  }
  const doRemoteDelete = async ()=>{
    if(!sessionId || !rSelectedPath) return
    const entry = rrows.find(x=> x.path===rSelectedPath || joinRemote(rpath, x.name)===rSelectedPath)
    const isDir = entry?.kind==='dir' || rSelectedPath.endsWith('/')
    if(!window.confirm(`Eliminar ${isDir? 'carpeta':'archivo'}?`)) return
    try{ await invoke('sftp_remove', { id: sessionId, path: rSelectedPath, recursive: isDir }); refreshRemote() }catch(e:any){ alert('remove: '+(e?.toString?.()||e)) }
  }
  const doDownload = async ()=>{
    if(!sessionId || !rSelectedPath) return
    const entry = rrows.find(x=> x.path===rSelectedPath || joinRemote(rpath, x.name)===rSelectedPath)
    if(!entry) return
    const local = joinLocal(lpath, entry.name)
    const isDir = entry.kind==='dir'
    try{
      if(isDir){ await invoke('sftp_download_dir_start', { id: sessionId, remotePath: rSelectedPath, localPath: local }) }
      else { await invoke('sftp_download_start', { id: sessionId, remotePath: rSelectedPath, localPath: local }) }
    }catch(e:any){ alert('download: '+(e?.toString?.()||e)) }
  }
  const doUpload = async ()=>{
    if(!sessionId || !lSelectedPath) return
    const entry = lrows.find(x=> x.path===lSelectedPath)
    if(!entry) return
    const remote = joinRemote(rpath, entry.name)
    try{
      if(entry.kind==='dir'){ await invoke('sftp_upload_dir_start', { id: sessionId, localPath: lSelectedPath, remotePath: remote }) }
      else { await invoke('sftp_upload_start', { id: sessionId, localPath: lSelectedPath, remotePath: remote }) }
    }catch(e:any){ alert('upload: '+(e?.toString?.()||e)) }
  }
  const doCancel = async (tid:string)=>{
    if(!sessionId) return
  try{ await invoke('sftp_cancel', { id: sessionId, transferId: tid }) }catch(e:any){ /* ignore */ }
  }

  // UI Layout similar al screenshot: barra superior por pane (back/up, breadcrumbs, filter, actions)
  return (
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',height:'100%',gap:16,padding:12}}>
      {/* Local */}
      <div style={{display:'flex',flexDirection:'column',minHeight:0,border:'1px solid var(--border)',borderRadius:12,overflow:'hidden',background:'var(--panel)'}}>
        <div style={{display:'flex',alignItems:'center',gap:8,padding:'10px 12px',borderBottom:'1px solid var(--border)'}}>
          <button title='Atrás' style={{border:'none',background:'transparent'}}>◀</button>
          <button title='Arriba' style={{border:'none',background:'transparent'}} onClick={()=>{ const p=lpath.replace(/\\/g,'/'); if(p==='/'||/^[A-Za-z]:\\?$/.test(lpath)) return; const idx=p.lastIndexOf('/'); if(idx>0){ const next=p.slice(0,idx); setLpath(next); refreshLocal(next); } }}>
            ↑
          </button>
          <CrumbBar rootLabel='Local' path={lpath} onNavigate={(p)=>{ setLpath(p); refreshLocal(p); }} />
          <div style={{marginLeft:'auto',display:'flex',gap:8,alignItems:'center'}}>
            <input placeholder='Filter' style={{width:140}} />
            <button onClick={doUpload} disabled={!sessionId || !lSelectedPath}>Upload →</button>
          </div>
        </div>
        <div style={{display:'flex',gap:8,padding:'8px 12px',borderBottom:'1px solid var(--border)'}}>
          <select onChange={e=>{ const next=e.target.value; setLpath(next); refreshLocal(next); }} value={(()=>{ const d=ldrives; if(!d||d.length===0) return ''; const match=d.find(x=> lpath.toUpperCase().startsWith(x.toUpperCase())); return match || ''; })()}>
            <option value=''>Drive</option>
            {ldrives.map(d=> <option key={d} value={d}>{d}</option>)}
          </select>
          <button onClick={refreshLocal}>Refresh</button>
        </div>
        <div style={{flex:1,overflow:'auto'}}>
          {lload? <div style={{padding:8}}>Loading…</div> : (
            <Table cols={["Name","Date Modified","Size","Kind"]}
              rows={ldisplay.map(e=>[
                <div className="file-name"><FileIcon name={e.name} kind={e.kind as any} /><span>{e.name}</span></div>,
                e.mtime? new Date(e.mtime).toLocaleString(): '',
                e.size ?? '',
                e.kind,
              ])}
              onRowClick={(i)=> setLSelectedPath(ldisplay[i]?.path)}
              onRowDoubleClick={(i)=>{
                const ent=ldisplay[i];
                if(ent.kind!=='dir') return;
                const base=lpath;
                const sep = /^[A-Za-z]:/.test(base)? '\\' : '/';
                const next = base && !base.endsWith(sep) ? base+sep+ent.name : base+ent.name;
                setLpath(next); refreshLocal(next);
              }}
              selectedIndex={lSelectedPath? ldisplay.findIndex(e=> e.path===lSelectedPath) : undefined}
              onSort={(col)=>{
                const map: Record<number,'name'|'mtime'|'size'|'kind'> = {0:'name',1:'mtime',2:'size',3:'kind'}
                const key = map[col]
                setLSort(s=> ({ key, dir: s.key===key && s.dir==='asc'? 'desc':'asc' }))
              }}
              onContextMenuRow={(i,e)=>{ setLSelectedPath(ldisplay[i]?.path); setCtx({open:true,x:e.clientX,y:e.clientY,side:'local',index:i}) }}
            />
          )}
        </div>
      </div>

      {/* Remote */}
      <div style={{display:'flex',flexDirection:'column',minHeight:0,border:'1px solid var(--border)',borderRadius:12,overflow:'hidden',background:'var(--panel)'}}>
        <div style={{display:'flex',alignItems:'center',gap:8,padding:'10px 12px',borderBottom:'1px solid var(--border)'}}>
          <button title='Atrás' style={{border:'none',background:'transparent'}}>◀</button>
          <button title='Arriba' style={{border:'none',background:'transparent'}} onClick={()=>{ if(rpath==='/') return; const p=rpath.endsWith('/')? rpath.slice(0,-1): rpath; const idx=p.lastIndexOf('/'); setRpath(idx<=0? '/': p.slice(0,idx)); }}>
            ↑
          </button>
          <CrumbBar rootLabel={sessionId || 'Remote'} path={rpath} onNavigate={(p)=> setRpath(p)} />
          <div style={{marginLeft:'auto',display:'flex',gap:8,alignItems:'center'}}>
            <input placeholder='Filter' style={{width:140}} />
            <button onClick={doRemoteMkdir} disabled={!canUse}>Nueva carpeta</button>
            <button onClick={doRemoteRename} disabled={!canUse || !rSelectedPath}>Renombrar</button>
            <button onClick={doRemoteDelete} disabled={!canUse || !rSelectedPath}>Eliminar</button>
            <button onClick={doDownload} disabled={!canUse || !rSelectedPath}>Descargar ↓</button>
          </div>
        </div>
        <div style={{display:'flex',gap:8,padding:'8px 12px',borderBottom:'1px solid var(--border)'}}>
          <select value={sessionId||''} onChange={e=>setSessionId(e.target.value||undefined)}>
            <option value=''>Session</option>
            {sessions.map(id=> <option key={id} value={id}>{id}</option>)}
          </select>
          <button onClick={refreshRemote} disabled={!canUse}>Refresh</button>
        </div>
        <div style={{flex:1,overflow:'auto'}}>
          {rerr && <div style={{color:'crimson',padding:8}}>Error: {rerr}</div>}
          {rload? <div style={{padding:8}}>Loading…</div> : (
            <Table cols={["Name","Date Modified","Size","Kind"]}
              rows={rdisplay.map(e=>[
                <div className="file-name"><FileIcon name={e.name} kind={e.kind as any} /><span>{e.name}</span></div>,
                e.mtime? new Date(e.mtime*1000).toLocaleString(): '',
                e.size ?? '',
                e.kind,
              ])}
              onRowClick={(i)=> setRSelectedPath(rdisplay[i]?.path || joinRemote(rpath, rdisplay[i]?.name || ''))}
              onRowDoubleClick={(i)=>{
                const ent=rdisplay[i];
                if(ent.kind!=='dir') return;
                const base=rpath.endsWith('/')? rpath.slice(0,-1): rpath;
                const next = base==='/'? '/'+ent.name : base+'/'+ent.name;
                setRpath(next);
              }}
              selectedIndex={rSelectedPath? rdisplay.findIndex(e=> (e.path || joinRemote(rpath,e.name))===rSelectedPath) : undefined}
              onSort={(col)=>{
                const map: Record<number,'name'|'mtime'|'size'|'kind'> = {0:'name',1:'mtime',2:'size',3:'kind'}
                const key = map[col]
                setRSort(s=> ({ key, dir: s.key===key && s.dir==='asc'? 'desc':'asc' }))
              }}
              onContextMenuRow={(i,e)=>{ const p=rdisplay[i]?.path || joinRemote(rpath, rdisplay[i]?.name || ''); setRSelectedPath(p); setCtx({open:true,x:e.clientX,y:e.clientY,side:'remote',index:i}) }}
            />
          )}
        </div>
      </div>
      {/* Transfers Panel */}
  <div style={{gridColumn:'1 / span 2', border:'1px solid var(--border)',borderRadius:10, padding:10, background:'var(--panel)', maxHeight:180, overflow:'auto'}}>
        <div style={{display:'flex',alignItems:'center',gap:8, marginBottom:6}}>
          <strong>Transfers</strong>
          <span style={{opacity:.6}}>({transfers.length})</span>
        </div>
        {transfers.length===0? <div style={{opacity:.7}}>No hay transferencias</div> : (
          <div style={{display:'grid', gridTemplateColumns:'auto 1fr auto auto auto', gap:8, alignItems:'center'}}>
            {transfers.map(t=>{
              const pct = t.total && t.total>0 ? Math.min(100, Math.floor(((t.bytes||0)/t.total)*100)) : undefined
              return (
                <React.Fragment key={t.id}>
                  <div style={{fontFamily:'monospace'}}>{t.direction==='download'? '↓':'↑'}</div>
                  <div>
                    <div style={{fontSize:12,opacity:.8}}>{t.direction==='download'? t.remote_path: t.local_path} → {t.direction==='download'? t.local_path: t.remote_path}</div>
                    <div style={{height:6, background:'rgba(0,0,0,0.1)', borderRadius:4, overflow:'hidden', marginTop:4}}>
                      <div style={{height:'100%', width: pct? pct+'%':'0%', background:'linear-gradient(90deg, #4e8cff, #6ad1ff)'}} />
                    </div>
                  </div>
                  <div style={{fontSize:12,opacity:.8}}>
                    {t.status==='running' ? (t.total? `${t.bytes||0} / ${t.total}` : `${t.bytes||0}`) : t.status}
                  </div>
                  <button onClick={()=> doCancel(t.id)} disabled={t.status!=='running'}>Cancelar</button>
                  <div style={{fontSize:12,color: t.status==='error'? 'crimson': undefined}}>{t.message}</div>
                </React.Fragment>
              )
            })}
          </div>
        )}
      </div>
      <ContextMenu
        x={ctx.x}
        y={ctx.y}
        open={ctx.open}
        onClose={()=> setCtx(c=> ({...c, open:false}))}
        items={(ctx.side==='local'? [
          { label: 'Upload', onClick: doUpload, disabled: !sessionId || !lSelectedPath },
          { label: 'Abrir', onClick: ()=>{ if(lSelectedPath){ const ent=ldisplay.find(e=> e.path===lSelectedPath); if(ent?.kind==='dir'){ const base=lpath; const sep = /^[A-Za-z]:/.test(base)? '\\' : '/'; const next = base && !base.endsWith(sep) ? base+sep+ent.name : base+ent.name; setLpath(next); refreshLocal(next); } } } },
        ] : [
          { label: 'Nueva carpeta', onClick: doRemoteMkdir, disabled: !canUse },
          { label: 'Renombrar', onClick: doRemoteRename, disabled: !canUse || !rSelectedPath },
          { label: 'Eliminar', onClick: doRemoteDelete, disabled: !canUse || !rSelectedPath, danger: true },
          { label: 'Descargar', onClick: doDownload, disabled: !canUse || !rSelectedPath },
        ])}
      />
    </div>
  )
}

export default SftpPage
