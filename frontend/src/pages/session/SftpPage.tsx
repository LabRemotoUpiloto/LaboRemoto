import React, { useEffect, useMemo, useState, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import FileIcon from '../../components/shared/FileIcon'
import ContextMenu from '../../components/shared/ContextMenu'
import ConfirmModal from '../../components/modals/ConfirmModal'
import PromptModal from '../../components/modals/PromptModal'
import FileNavigationBar from '../../components/sftp/FileNavigationBar'
import DataTable from '../../components/sftp/DataTable'
import TransfersPanel from '../../components/sftp/TransfersPanel'
import { useLocalFsBrowser } from '../../hooks/useLocalFsBrowser'
import { useRemoteFsBrowser } from '../../hooks/useRemoteFsBrowser'
import { useSftpTransfers } from '../../hooks/useSftpTransfers'
import { useToasts } from '../../contexts/ToastContext'
import { formatDate, formatBytes } from '../../components/shared/fileFormatters'
import { joinLocalPath, joinRemotePath, getParentLocalPath, getParentRemotePath } from '../../components/shared/pathUtils'
import type { SftpEntry, LocalEntry } from '../../types'

type Props = {
  sessions: string[]
  activeSessionId?: string
  sessionsMeta?: Record<string,{ label: string }>
  initialPath?: string
  onPathChange?: (path: string) => void
}

const SftpPage: React.FC<Props> = ({ sessions, activeSessionId, sessionsMeta, initialPath, onPathChange }) => {
  const [sessionId, setSessionId] = useState<string | undefined>(activeSessionId)
  const { push } = useToasts()
  useEffect(()=> setSessionId(activeSessionId), [activeSessionId])
  const canUse = useMemo(()=> !!sessionId, [sessionId])
  const [activePane, setActivePane] = useState<'local'|'remote'>('local')

  const {
    path: lpath,
    setPath: setLpath,
    rows: lrows,
    display: ldisplay,
    loading: lload,
    drives: ldrives,
    selectedPath: lSelectedPath,
    setSelectedPath: setLSelectedPath,
    sort: lSort,
    setSort: setLSort,
    filter: lfilter,
    setFilter: setLfilter,
    refresh: refreshLocal
  } = useLocalFsBrowser()

  const {
    path: rpath,
    setPath: setRpath,
    rows: rrows,
    display: rdisplay,
    loading: rload,
    error: rerr,
    selectedPath: rSelectedPath,
    setSelectedPath: setRSelectedPath,
    sort: rSort,
    setSort: setRSort,
    filter: rfilter,
    setFilter: setRfilter,
    refresh: refreshRemote
  } = useRemoteFsBrowser(sessionId, initialPath)

  // Notificar al padre cuando cambia el path remoto
  useEffect(() => {
    if (onPathChange && rpath) {
      onPathChange(rpath)
    }
  }, [rpath, onPathChange])

  // Limpiar el path guardado si hay error (para no persistir paths inválidos)
  useEffect(() => {
    if (rerr && onPathChange && rerr.includes("no such file")) {
      // No guardar el path problemático, dejar que vuelva al home
      onPathChange("/")
    }
  }, [rerr, onPathChange])

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
  const { transfers, cancelTransfer: doCancel, clearCompleted: doClearTransfers } = useSftpTransfers(sessionId)

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
    }catch(e:any){ push({ type:'error', message:'Error al descargar: '+(e?.toString?.()||e) }) }
  }
  const doUpload = async ()=>{
    if(!sessionId || !lSelectedPath) return
    const entry = lrows.find(x=> x.path===lSelectedPath)
    if(!entry) return
    const remote = joinRemotePath(rpath, entry.name)
    try{
      if(entry.kind==='dir'){ await invoke('sftp_upload_dir_start', { id: sessionId, localPath: lSelectedPath, remotePath: remote }) }
      else { await invoke('sftp_upload_start', { id: sessionId, localPath: lSelectedPath, remotePath: remote }) }
    }catch(e:any){ push({ type:'error', message:'Error al subir: '+(e?.toString?.()||e) }) }
  }
  // UI Layout similar al screenshot: barra superior por pane (back/up, breadcrumbs, filter, actions)
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 grid-rows-[1fr_auto] h-full gap-2.5 p-2.5 pb-3.5 bg-primary">
      {/* Local */}
      <div className={`flex flex-col bg-secondary rounded-[10px] border overflow-hidden shadow-[0_2px_10px_rgba(0,0,0,0.15)] transition-all duration-150 relative ${activePane==='local'? 'border-accent shadow-[0_0_0_1px_rgba(16,185,129,0.2),0_4px_16px_rgba(0,0,0,0.2)]' : 'border-subtle'}`} onClick={()=> setActivePane('local')} data-tour="sftp-panel-local">
        <div className="flex items-center gap-[7px] py-[7px] px-3 bg-tertiary border-b border-subtle min-h-[42px]">
          <button 
            title='Atrás' 
            className="inline-flex items-center justify-center w-[26px] h-[26px] p-0 rounded-[5px] bg-transparent border border-subtle text-secondary text-[14px] leading-none cursor-pointer shrink-0 transition-colors duration-150 hover:not(:disabled):bg-white/5 hover:not(:disabled):border-strong hover:not(:disabled):text-primary disabled:opacity-35 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-1" 
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
          
          <div className="flex-1 flex items-center gap-[5px] justify-end min-w-0 relative">
            <input
              placeholder='Buscar...'
              className="h-[28px] pl-[9px] pr-[32px] rounded-[6px] bg-primary border border-subtle text-primary text-[12px] w-[160px] shrink min-w-[80px] transition-all duration-150 focus:outline-none focus:border-accent focus:shadow-[0_0_0_2px_rgba(16,185,129,0.2)] disabled:opacity-40 disabled:cursor-not-allowed placeholder:text-muted"
              value={lfilter}
              onChange={e=> setLfilter(e.target.value)}
            />
            {lfilter && <button className="absolute right-1 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-[22px] h-[22px] p-0 rounded bg-transparent border-none text-muted text-[16px] leading-none cursor-pointer transition-colors duration-100 hover:bg-white/5 hover:text-primary" title="Limpiar búsqueda" onClick={(e)=>{ e.stopPropagation(); setLfilter(''); }}>×</button>}
          </div>
        </div>
        
        <div className="flex items-center gap-[5px] py-[5px] px-3 border-b border-subtle min-h-[38px] bg-tertiary/40">
          <select 
            className="h-[28px] pl-[9px] pr-[26px] rounded-[6px] bg-primary border border-subtle text-secondary text-[12px] min-w-[80px] max-w-[130px] cursor-pointer shrink-0 appearance-none bg-no-repeat bg-[right_7px_center] transition-colors duration-150 hover:not(:disabled):border-strong hover:not(:disabled):text-primary focus:outline-2 focus:outline-accent focus:-outline-offset-1 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'6\' viewBox=\'0 0 10 6\'%3E%3Cpath d=\'M1 1l4 4 4-4\' stroke=\'%23888\' stroke-width=\'1.5\' fill=\'none\' stroke-linecap=\'round\'/%3E%3C/svg%3E")' }}
            onChange={e=>{ const next=e.target.value; setLpath(next); refreshLocal(next); }} 
            value={(()=>{ const d=ldrives; if(!d||d.length===0) return ''; const match=d.find(x=> lpath.toUpperCase().startsWith(x.toUpperCase())); return match || ''; })()}
            title="Seleccionar unidad"
          >
            <option value=''>Unidad</option>
            {ldrives.map(d=> <option key={d} value={d}>{d}</option>)}
          </select>
          
          <button 
            className="inline-flex items-center gap-[5px] h-[28px] px-[9px] rounded-[6px] bg-transparent border border-subtle text-secondary text-[12px] font-medium cursor-pointer whitespace-nowrap shrink-0 transition-colors duration-150 hover:not(:disabled):bg-white/5 hover:not(:disabled):border-strong hover:not(:disabled):text-primary active:not(:disabled):scale-95 disabled:opacity-40 disabled:cursor-not-allowed" 
            onClick={(e)=>{ e.stopPropagation(); refreshLocal(); }} 
            title="Actualizar lista"
          >
            <span className="text-[12px] leading-none opacity-80">↻</span>
            Actualizar
          </button>
          
          <div className="flex-1 flex items-center gap-[5px] justify-end min-w-0 relative">
            <button 
              className="inline-flex items-center gap-[5px] h-[28px] px-[9px] rounded-[6px] bg-accent border border-accent text-inverse font-semibold cursor-pointer whitespace-nowrap shrink-0 transition-colors duration-150 hover:not(:disabled):bg-[#0da574] hover:not(:disabled):border-[#0da574] active:not(:disabled):scale-95 disabled:opacity-40 disabled:cursor-not-allowed" 
              onClick={(e)=>{ e.stopPropagation(); doUpload(); }} 
              disabled={!sessionId || !lSelectedPath} 
              title="Subir al servidor remoto"
            >
              <span className="text-[12px] leading-none opacity-80">↑</span>
              Subir
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto relative min-h-0 custom-scrollbar">
          {lload ? (
            <div className="flex flex-col items-center justify-center py-[50px] px-5 gap-3 text-tertiary" aria-busy="true">
              <div className="w-[26px] h-[26px] border-2 border-subtle border-t-accent rounded-full animate-spin" />
              <span className="text-[12px]">Cargando archivos locales...</span>
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
                name: <div className="flex items-center gap-[10px] font-medium transition-colors duration-100 group-hover:text-primary"><div className="shrink-0 transition-opacity duration-200 opacity-[0.85] group-hover:opacity-100"><FileIcon name={e.name} kind={e.kind as any} /></div><span className="whitespace-nowrap overflow-hidden text-ellipsis min-w-0" title={e.name}>{e.name}</span></div>,
                modified: formatDate(e.mtime, false),
                size: <span className="font-mono text-[12px] tabular-nums">{formatBytes(e.size)}</span>,
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
      <div className={`flex flex-col bg-secondary rounded-[10px] border overflow-hidden shadow-[0_2px_10px_rgba(0,0,0,0.15)] transition-all duration-150 relative ${activePane==='remote'? 'border-accent shadow-[0_0_0_1px_rgba(16,185,129,0.2),0_4px_16px_rgba(0,0,0,0.2)]' : 'border-subtle'}`} onClick={()=> setActivePane('remote')} data-tour="sftp-panel-remote">
        <div className="flex items-center gap-[7px] py-[7px] px-3 bg-tertiary border-b border-subtle min-h-[42px]">
          <button 
            title='Atrás' 
            className="inline-flex items-center justify-center w-[26px] h-[26px] p-0 rounded-[5px] bg-transparent border border-subtle text-secondary text-[14px] leading-none cursor-pointer shrink-0 transition-colors duration-150 hover:not(:disabled):bg-white/5 hover:not(:disabled):border-strong hover:not(:disabled):text-primary disabled:opacity-35 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-1" 
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
          
          <div className="flex-1 flex items-center gap-[5px] justify-end min-w-0 relative">
            <span className={`inline-flex items-center gap-1.5 h-[22px] px-2 rounded-full text-[10px] font-bold uppercase tracking-[0.06em] shrink-0 before:content-[''] before:w-[5px] before:h-[5px] before:rounded-full before:inline-block before:shrink-0 ${canUse? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 before:bg-emerald-500 before:animate-pulse':'bg-tertiary text-muted border border-subtle before:bg-muted before:opacity-40'}`}>
              {canUse? 'Conectado':'Desconectado'}
            </span>
            <input
              placeholder='Buscar...'
              className="h-[28px] pl-[9px] pr-[32px] rounded-[6px] bg-primary border border-subtle text-primary text-[12px] w-[160px] shrink min-w-[80px] transition-all duration-150 focus:outline-none focus:border-accent focus:shadow-[0_0_0_2px_rgba(16,185,129,0.2)] disabled:opacity-40 disabled:cursor-not-allowed placeholder:text-muted"
              value={rfilter}
              onChange={e=> setRfilter(e.target.value)}
              disabled={!canUse}
            />
            {rfilter && <button className="absolute right-1 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-[22px] h-[22px] p-0 rounded bg-transparent border-none text-muted text-[16px] leading-none cursor-pointer transition-colors duration-100 hover:bg-white/5 hover:text-primary" title="Limpiar búsqueda" onClick={(e)=>{ e.stopPropagation(); setRfilter(''); }}>×</button>}
          </div>
        </div>
        
        <div className="flex items-center gap-[5px] py-[5px] px-3 border-b border-subtle min-h-[38px] bg-tertiary/40">
          <select 
            className="h-[28px] pl-[9px] pr-[26px] rounded-[6px] bg-primary border border-subtle text-secondary text-[12px] min-w-[80px] max-w-[130px] cursor-pointer shrink-0 appearance-none bg-no-repeat bg-[right_7px_center] transition-colors duration-150 hover:not(:disabled):border-strong hover:not(:disabled):text-primary focus:outline-2 focus:outline-accent focus:-outline-offset-1 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'6\' viewBox=\'0 0 10 6\'%3E%3Cpath d=\'M1 1l4 4 4-4\' stroke=\'%23888\' stroke-width=\'1.5\' fill=\'none\' stroke-linecap=\'round\'/%3E%3C/svg%3E")' }}
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
            className="inline-flex items-center gap-[5px] h-[28px] px-[9px] rounded-[6px] bg-transparent border border-subtle text-secondary text-[12px] font-medium cursor-pointer whitespace-nowrap shrink-0 transition-colors duration-150 hover:not(:disabled):bg-white/5 hover:not(:disabled):border-strong hover:not(:disabled):text-primary active:not(:disabled):scale-95 disabled:opacity-40 disabled:cursor-not-allowed" 
            onClick={(e)=>{ e.stopPropagation(); refreshRemote(); }} 
            disabled={!canUse} 
            title="Actualizar lista"
          >
            <span className="text-[12px] leading-none opacity-80">↻</span>
            Actualizar
          </button>
          
          <button 
            className="inline-flex items-center gap-[5px] h-[28px] px-[9px] rounded-[6px] bg-transparent border border-subtle text-secondary text-[12px] font-medium cursor-pointer whitespace-nowrap shrink-0 transition-colors duration-150 hover:not(:disabled):bg-white/5 hover:not(:disabled):border-strong hover:not(:disabled):text-primary active:not(:disabled):scale-95 disabled:opacity-40 disabled:cursor-not-allowed" 
            onClick={(e)=>{ e.stopPropagation(); doRemoteMkdir(); }} 
            disabled={!canUse} 
            title="Crear nueva carpeta"
          >
            <span className="text-[12px] leading-none opacity-80">+</span>
            Nueva carpeta
          </button>
          
          <div className="flex-1 flex items-center gap-[5px] justify-end min-w-0 relative">
            <button 
              className="inline-flex items-center gap-[5px] h-[28px] px-[9px] rounded-[6px] bg-accent border border-accent text-inverse font-semibold cursor-pointer whitespace-nowrap shrink-0 transition-colors duration-150 hover:not(:disabled):bg-[#0da574] hover:not(:disabled):border-[#0da574] active:not(:disabled):scale-95 disabled:opacity-40 disabled:cursor-not-allowed" 
              onClick={(e)=>{ e.stopPropagation(); doDownload(); }} 
              disabled={!canUse || !rSelectedPath} 
              title="Descargar a local"
            >
              <span className="text-[12px] leading-none opacity-80">↓</span>
              Descargar
            </button>
          </div>
        </div>
        
        <div className="flex-1 overflow-auto relative min-h-0 custom-scrollbar">
          {rerr && <div className="flex items-center gap-2.5 py-2.5 px-3.5 text-danger bg-danger/10 border border-danger/20 rounded-md m-2.5 text-[12px] before:content-['⚠'] before:text-[14px] before:shrink-0">{rerr}</div>}
          {rload ? (
            <div className="flex flex-col items-center justify-center py-[50px] px-5 gap-3 text-tertiary" aria-busy="true">
              <div className="w-[26px] h-[26px] border-2 border-subtle border-t-accent rounded-full animate-spin" />
              <span className="text-[12px]">Cargando archivos remotos...</span>
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
                name: <div className="flex items-center gap-[10px] font-medium transition-colors duration-100 group-hover:text-primary"><div className="shrink-0 transition-opacity duration-200 opacity-[0.85] group-hover:opacity-100"><FileIcon name={e.name} kind={e.kind as any} /></div><span className="whitespace-nowrap overflow-hidden text-ellipsis min-w-0" title={e.name}>{e.name}</span></div>,
                modified: formatDate(e.mtime, true),
                size: <span className="font-mono text-[12px] tabular-nums">{formatBytes(e.size)}</span>,
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
