import React, { useEffect, useMemo, useState, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import FileIcon from '../components/FileIcon'
import ContextMenu from '../components/ContextMenu'
import ConfirmModal from '../components/ConfirmModal'
import PromptModal from '../components/PromptModal'
import FileNavigationBar from '../components/sftp/FileNavigationBar'
import DataTable from '../components/sftp/DataTable'
import TransfersPanel from '../components/sftp/TransfersPanel'
import { useToasts } from '../contexts/ToastContext'
import { formatDate, formatBytes } from '../components/fileFormatters'
import { joinLocalPath, joinRemotePath, getParentLocalPath, getParentRemotePath } from '../components/pathUtils'
import './SftpPage.css'

type Props = { sessions: string[]; activeSessionId?: string; sessionsMeta?: Record<string,{ label: string }> }
type SftpEntry = { name: string; path: string; kind: string; size?: number; perms?: string; mtime?: number }
type LocalEntry = { name: string; path: string; kind: string; size?: number; mtime?: number }

const SftpPage: React.FC<Props> = ({ sessions, activeSessionId, sessionsMeta }) => {
  const [sessionId, setSessionId] = useState<string | undefined>(activeSessionId)
  const { push } = useToasts()
  useEffect(()=> setSessionId(activeSessionId), [activeSessionId])
  const canUse = useMemo(()=> !!sessionId, [sessionId])
  const [activePane, setActivePane] = useState<'local'|'remote'>('local')

  // local
  const [lpath, setLpath] = useState<string>('')
  const [lrows, setLrows] = useState<LocalEntry[]>([])
  const [lload, setLload] = useState(false)
  const [ldrives, setLdrives] = useState<string[]>([])
  const [lSelectedPath, setLSelectedPath] = useState<string|undefined>()
  const [lSort, setLSort] = useState<{key: 'name'|'mtime'|'size'|'kind'; dir: 'asc'|'desc'}>({key:'name',dir:'asc'})
  const [lfilter, setLfilter] = useState<string>('')
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
    const q = (lfilter||'').trim().toLowerCase()
    if(!q) return arr
    const toRegex = (s:string)=> {
      // escape regex then support * and ? wildcards
      const esc = s.replace(/[.+^${}()|[\\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')
      return new RegExp('^'+esc+'$','i')
    }
    const rx = (q.includes('*')||q.includes('?'))? toRegex(q) : null
    return arr.filter(e=> rx? rx.test(e.name) : e.name.toLowerCase().includes(q))
  },[lrows,lSort,lfilter])
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
  // Clear local filter when navigating to a different local path
  useEffect(()=>{ setLfilter('') }, [lpath])

  // remote
  const [rpath, setRpath] = useState<string>('/')
  const [rrows, setRrows] = useState<SftpEntry[]>([])
  const [rload, setRload] = useState(false)
  const [rerr, setRerr] = useState<string|undefined>()
  const [rSelectedPath, setRSelectedPath] = useState<string|undefined>()
  const [rSort, setRSort] = useState<{key: 'name'|'mtime'|'size'|'kind'; dir: 'asc'|'desc'}>({key:'name',dir:'asc'})
  const [rfilter, setRfilter] = useState<string>('')
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
    const q = (rfilter||'').trim().toLowerCase()
    if(!q) return arr
    const toRegex = (s:string)=> {
      const esc = s.replace(/[.+^${}()|[\\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')
      return new RegExp('^'+esc+'$','i')
    }
    const rx = (q.includes('*')||q.includes('?'))? toRegex(q) : null
    return arr.filter(e=> rx? rx.test(e.name) : e.name.toLowerCase().includes(q))
  },[rrows,rSort,rfilter])
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
  // Al establecer sesión por primera vez, intentar obtener home remoto y cambiar rpath antes de listar
  useEffect(()=>{
    if(!canUse) return;
    let cancelled = false;
    (async()=>{
      try{
        // solo si seguimos en root inicial
        if(rpath==='/'){
          const home = await invoke<string>('sftp_home', { id: sessionId });
          if(!cancelled && home && home.length>1){ setRpath(home); return; }
        }
      }catch{/* fallback root */}
      if(!cancelled) refreshRemote();
    })();
    return ()=>{ cancelled=true };
  }, [canUse, sessionId]);

  useEffect(()=>{ if(canUse) refreshRemote() }, [rpath])

  useEffect(()=>{ setRSelectedPath(undefined) }, [rpath])
  // Clear remote filter when navigating to a different remote path
  useEffect(()=>{ setRfilter('') }, [rpath])

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
          // Ignore updates if already cancelled
          if(cur.status === 'cancelled') {
            return next;
          }
          if(p.type==='progress'){
            cur.bytes = p.bytes; cur.total = p.total ?? cur.total
          } else if(p.type==='done'){
            cur.status='done'
          } else if(p.type==='canceled'){
            cur.status='cancelled'
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



  const [mkdirOpen, setMkdirOpen] = useState(false)
  const doRemoteMkdir = async ()=>{
    if(!sessionId) return
    setMkdirOpen(true)
  }
  const confirmRemoteMkdir = async (name: string)=>{
    if(!sessionId) { setMkdirOpen(false); return }
    const p = joinRemotePath(rpath, name)
    try{ 
      await invoke('sftp_mkdir', { id: sessionId, path: p })
      refreshRemote()
      push({ type:'success', message:'Carpeta creada' })
    } catch(e:any){ 
      push({ type:'error', message:'Error al crear carpeta: '+(e?.toString?.()||e) })
    }
    setMkdirOpen(false)
  }
  // Renombrar eliminado
  const [confirmOpen, setConfirmOpen] = useState(false)
  const doRemoteDelete = async ()=>{
    if(!sessionId || !rSelectedPath) return
    setConfirmOpen(true)
  }
  const confirmRemoteDelete = async ()=>{
    if(!sessionId || !rSelectedPath) { setConfirmOpen(false); return }
    const entry = rrows.find(x=> x.path===rSelectedPath || joinRemotePath(rpath, x.name)===rSelectedPath)
    const isDir = entry?.kind==='dir' || rSelectedPath.endsWith('/')
    try{ await invoke('sftp_remove', { id: sessionId, path: rSelectedPath, recursive: isDir }); setConfirmOpen(false); refreshRemote(); push({ type:'success', message:'Eliminado' }) }
    catch(e:any){ setConfirmOpen(false); push({ type:'error', message: 'Error eliminando: '+(e?.toString?.()||e) }) }
  }
  const doDownload = async ()=>{
    if(!sessionId || !rSelectedPath) return
    const entry = rrows.find(x=> x.path===rSelectedPath || joinRemotePath(rpath, x.name)===rSelectedPath)
    if(!entry) return
    const local = joinLocalPath(lpath, entry.name)
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
    const remote = joinRemotePath(rpath, entry.name)
    try{
      if(entry.kind==='dir'){ await invoke('sftp_upload_dir_start', { id: sessionId, localPath: lSelectedPath, remotePath: remote }) }
      else { await invoke('sftp_upload_start', { id: sessionId, localPath: lSelectedPath, remotePath: remote }) }
    }catch(e:any){ alert('upload: '+(e?.toString?.()||e)) }
  }
  const doCancel = async (tid:string)=>{
    if(!sessionId) return
    // Immediately mark as cancelled in UI
    setTransfers(prev => {
      const next = [...prev];
      const idx = next.findIndex(t => t.id === tid);
      if (idx >= 0) {
        next[idx] = { ...next[idx], status: 'cancelled' };
      }
      return next;
    });
    try{ await invoke('sftp_cancel', { id: sessionId, transferId: tid }) }catch(e:any){ /* ignore */ }
  }

  const doClearTransfers = () => {
    // Remove all completed, cancelled, and error transfers
    setTransfers(prev => prev.filter(t => t.status === 'running'));
  }

  // UI Layout similar al screenshot: barra superior por pane (back/up, breadcrumbs, filter, actions)
  return (
    <div className="sftp-page">
      {/* Local */}
      <div className={`sftp-panel ${activePane==='local'? 'active':''}`} onClick={()=> setActivePane('local')}>
        <div className="sftp-panel__header">
          <button 
            title='Atrás' 
            className="sftp-back-btn" 
            onClick={(e)=>{ 
              e.stopPropagation();
              const p=lpath.replace(/\\/g,'/'); 
              if(p==='/'||/^[A-Za-z]:\\?$/.test(lpath)) return; 
              const idx=p.lastIndexOf('/'); 
              if(idx>0){ const next=p.slice(0,idx); setLpath(next); refreshLocal(next); } 
            }}
            disabled={lpath==='/'||/^[A-Za-z]:\\?$/.test(lpath)}
          >
            ←
          </button>
          
          <FileNavigationBar rootLabel="Local" path={lpath} onNavigate={(p)=>{ setLpath(p); refreshLocal(p); }} />
          
          <div className="toolbar-spacer">
            <input
              placeholder='Buscar...'
              className="sftp-search-input"
              value={lfilter}
              onChange={e=> setLfilter(e.target.value)}
            />
            {lfilter && <button className="sftp-clear-btn" title="Limpiar búsqueda" onClick={(e)=>{ e.stopPropagation(); setLfilter(''); }}>×</button>}
          </div>
        </div>
        
        <div className="sftp-panel__subheader">
          <select 
            className="sftp-select" 
            onChange={e=>{ const next=e.target.value; setLpath(next); refreshLocal(next); }} 
            value={(()=>{ const d=ldrives; if(!d||d.length===0) return ''; const match=d.find(x=> lpath.toUpperCase().startsWith(x.toUpperCase())); return match || ''; })()}
            title="Seleccionar unidad"
          >
            <option value=''>Unidad</option>
            {ldrives.map(d=> <option key={d} value={d}>{d}</option>)}
          </select>
          
          <button 
            className="sftp-icon-btn" 
            onClick={(e)=>{ e.stopPropagation(); refreshLocal(); }} 
            title="Actualizar lista"
          >
            <span className="sftp-icon-btn__icon">↻</span>
            Actualizar
          </button>
          
          <div className="toolbar-spacer">
            <button 
              className="sftp-icon-btn sftp-icon-btn--primary" 
              onClick={(e)=>{ e.stopPropagation(); doUpload(); }} 
              disabled={!sessionId || !lSelectedPath} 
              title="Subir al servidor remoto"
            >
              <span className="sftp-icon-btn__icon">↑</span>
              Subir
            </button>
          </div>
        </div>
        <div className="sftp-panel__body scroll-accent">
          {lload ? (
            <div className="sftp-panel__loading" aria-busy="true">
              <div className="sftp-panel__loading-spinner" />
              <span className="sftp-panel__loading-text">Cargando archivos locales...</span>
            </div>
          ) : (
            <DataTable
              columns={[
                { key: 'name', label: 'Nombre', sortable: true },
                { key: 'modified', label: 'Modificado', sortable: true },
                { key: 'size', label: 'Tamaño', sortable: true, align: 'right' },
                { key: 'type', label: 'Tipo', sortable: true }
              ]}
              data={ldisplay.map(e => ({
                name: <div className="file-name"><FileIcon name={e.name} kind={e.kind as any} /><span title={e.name}>{e.name}</span></div>,
                modified: formatDate(e.mtime, false),
                size: <span style={{fontVariantNumeric:'tabular-nums'}}>{formatBytes(e.size)}</span>,
                type: e.kind === 'dir' ? 'carpeta' : 'archivo',
                _raw: e
              }))}
              selectedIndex={lSelectedPath ? ldisplay.findIndex(e => e.path === lSelectedPath) : undefined}
              onRowClick={(i) => setLSelectedPath(ldisplay[i]?.path)}
              onClearSelection={() => setLSelectedPath(undefined)}
              onRowDoubleClick={(i) => {
                const ent = ldisplay[i];
                if (ent.kind !== 'dir') return;
                const base = lpath;
                const sep = /^[A-Za-z]:/.test(base) ? '\\' : '/';
                const next = base && !base.endsWith(sep) ? base + sep + ent.name : base + ent.name;
                setLpath(next);
                refreshLocal(next);
              }}
              onSort={(key) => {
                setLSort(s => ({ key: key as any, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }));
              }}
              onContextMenu={(i, e) => {
                setLSelectedPath(ldisplay[i]?.path);
                setCtx({ open: true, x: e.clientX, y: e.clientY, side: 'local', index: i });
              }}
              sortKey={lSort.key}
              sortDir={lSort.dir}
              emptyMessage="No hay archivos locales"
            />
          )}
        </div>
      </div>

      {/* Remote */}
      <div className={`sftp-panel ${activePane==='remote'? 'active':''}`} onClick={()=> setActivePane('remote')}>
        <div className="sftp-panel__header">
          <button 
            title='Atrás' 
            className="sftp-back-btn" 
            onClick={(e)=>{ 
              e.stopPropagation();
              if(rpath==='/') return; 
              const p=rpath.endsWith('/')? rpath.slice(0,-1): rpath; 
              const idx=p.lastIndexOf('/'); 
              setRpath(idx<=0? '/': p.slice(0,idx)); 
            }}
            disabled={rpath==='/'}
          >
            ←
          </button>
          
          <FileNavigationBar
            rootLabel="Remoto"
            path={rpath}
            onNavigate={(p)=> setRpath(p)}
            prefix="/"
          />
          
          <div className="toolbar-spacer">
            <span className={`sftp-status-badge ${canUse? 'sftp-status-badge--connected':'sftp-status-badge--disconnected'}`}>
              {canUse? 'Conectado':'Desconectado'}
            </span>
            <input
              placeholder='Buscar...'
              className="sftp-search-input"
              value={rfilter}
              onChange={e=> setRfilter(e.target.value)}
              disabled={!canUse}
            />
            {rfilter && <button className="sftp-clear-btn" title="Limpiar búsqueda" onClick={(e)=>{ e.stopPropagation(); setRfilter(''); }}>×</button>}
          </div>
        </div>
        
        <div className="sftp-panel__subheader">
          <select 
            className="sftp-select" 
            value={sessionId||''} 
            onChange={e=>setSessionId(e.target.value||undefined)} 
            title={sessionId ? `Sesión: ${sessionsMeta?.[sessionId]?.label || sessionId}` : 'Seleccionar sesión'}
          >
            <option value=''>Sesión</option>
            {sessions.map(id=> {
              const label = sessionsMeta?.[id]?.label || id
              return <option key={id} value={id} title={id}>{label}</option>
            })}
          </select>
          
          <button 
            className="sftp-icon-btn" 
            onClick={(e)=>{ e.stopPropagation(); refreshRemote(); }} 
            disabled={!canUse} 
            title="Actualizar lista"
          >
            <span className="sftp-icon-btn__icon">↻</span>
            Actualizar
          </button>
          
          <button 
            className="sftp-icon-btn" 
            onClick={(e)=>{ e.stopPropagation(); doRemoteMkdir(); }} 
            disabled={!canUse} 
            title="Crear nueva carpeta"
          >
            <span className="sftp-icon-btn__icon">+</span>
            Nueva carpeta
          </button>
          
          <div className="toolbar-spacer">
            <button 
              className="sftp-icon-btn sftp-icon-btn--primary" 
              onClick={(e)=>{ e.stopPropagation(); doDownload(); }} 
              disabled={!canUse || !rSelectedPath} 
              title="Descargar a local"
            >
              <span className="sftp-icon-btn__icon">↓</span>
              Descargar
            </button>
          </div>
        </div>
        
        <div className="sftp-panel__body scroll-accent">
          {rerr && <div className="sftp-panel__error">{rerr}</div>}
          {rload ? (
            <div className="sftp-panel__loading" aria-busy="true">
              <div className="sftp-panel__loading-spinner" />
              <span className="sftp-panel__loading-text">Cargando archivos remotos...</span>
            </div>
          ) : (
            <DataTable
              columns={[
                { key: 'name', label: 'Nombre', sortable: true },
                { key: 'modified', label: 'Modificado', sortable: true },
                { key: 'size', label: 'Tamaño', sortable: true, align: 'right' },
                { key: 'type', label: 'Tipo', sortable: true }
              ]}
              data={rdisplay.map(e => ({
                name: <div className="file-name"><FileIcon name={e.name} kind={e.kind as any} /><span title={e.name}>{e.name}</span></div>,
                modified: formatDate(e.mtime, true),
                size: <span className="size-cell">{formatBytes(e.size)}</span>,
                type: e.kind === 'dir' ? 'carpeta' : 'archivo',
                _raw: e
              }))}
              selectedIndex={rSelectedPath ? rdisplay.findIndex(e => (e.path || joinRemotePath(rpath, e.name)) === rSelectedPath) : undefined}
              onRowClick={(i) => setRSelectedPath(rdisplay[i]?.path || joinRemotePath(rpath, rdisplay[i]?.name || ''))}
              onClearSelection={() => setRSelectedPath(undefined)}
              onRowDoubleClick={(i) => {
                const ent = rdisplay[i];
                if (ent.kind !== 'dir') return;
                const base = rpath.endsWith('/') ? rpath.slice(0, -1) : rpath;
                const next = base === '/' ? '/' + ent.name : base + '/' + ent.name;
                setRpath(next);
              }}
              onSort={(key) => {
                setRSort(s => ({ key: key as any, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }));
              }}
              onContextMenu={(i, e) => {
                const p = rdisplay[i]?.path || joinRemotePath(rpath, rdisplay[i]?.name || '');
                setRSelectedPath(p);
                setCtx({ open: true, x: e.clientX, y: e.clientY, side: 'remote', index: i });
              }}
              sortKey={rSort.key}
              sortDir={rSort.dir}
              emptyMessage="No hay archivos remotos"
            />
          )}
        </div>
      </div>
      
      {/* Transfers Panel */}
      <TransfersPanel 
        transfers={transfers} 
        onCancel={doCancel} 
        onClear={doClearTransfers}
      />
      
      <ContextMenu
        x={ctx.x}
        y={ctx.y}
        open={ctx.open}
        onClose={()=> setCtx(c=> ({...c, open:false}))}
        items={(ctx.side==='local'? [
          { label: 'Subir', onClick: doUpload, disabled: !sessionId || !lSelectedPath },
          { label: 'Abrir', onClick: ()=>{ if(lSelectedPath){ const ent=ldisplay.find(e=> e.path===lSelectedPath); if(ent?.kind==='dir'){ const base=lpath; const sep = /^[A-Za-z]:/.test(base)? '\\' : '/'; const next = base && !base.endsWith(sep) ? base+sep+ent.name : base+ent.name; setLpath(next); refreshLocal(next); } } } },
        ] : [
          { label: 'Nueva carpeta', onClick: doRemoteMkdir, disabled: !canUse },
          { label: 'Eliminar', onClick: doRemoteDelete, disabled: !canUse || !rSelectedPath, danger: true },
          { label: 'Descargar', onClick: doDownload, disabled: !canUse || !rSelectedPath },
        ])}
      />
      <ConfirmModal open={confirmOpen} title="Eliminar en remoto" message={`¿Eliminar "${rSelectedPath?.split('/').pop()||''}" en ${rpath}?`} onCancel={()=> setConfirmOpen(false)} onConfirm={confirmRemoteDelete} />
      <PromptModal 
        open={mkdirOpen} 
        title="Nueva carpeta" 
        message="Nombre de la carpeta nueva:" 
        placeholder="nombre_carpeta"
        onCancel={()=> setMkdirOpen(false)} 
        onConfirm={confirmRemoteMkdir} 
      />
    </div>
  )
}

export default SftpPage
