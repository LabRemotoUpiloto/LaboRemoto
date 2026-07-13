import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useMediaQuery } from '@mantine/hooks'
import { Monitor, Server } from 'lucide-react'
import FilePanel from '../../components/sftp/FilePanel'
import TransferBridge from '../../components/sftp/TransferBridge'
import ContextMenu from '../../components/shared/ContextMenu'
import ConfirmModal from '../../components/modals/ConfirmModal'
import PromptModal from '../../components/modals/PromptModal'
import { useLocalFsBrowser } from '../../hooks/useLocalFsBrowser'
import { useRemoteFsBrowser } from '../../hooks/useRemoteFsBrowser'
import { useSftpTransfers } from '../../hooks/useSftpTransfers'
import { useToasts } from '../../contexts/ToastContext'
import {
  joinLocalPath,
  joinRemotePath,
  getParentLocalPath,
  getParentRemotePath,
} from '../../components/shared/pathUtils'
import type { SftpEntry, LocalEntry } from '../../types'

type Props = {
  sessions: string[]
  activeSessionId?: string
  sessionsMeta?: Record<string, { label: string }>
  initialPath?: string
  onPathChange?: (path: string) => void
}

const SftpPage: React.FC<Props> = ({
  sessions,
  activeSessionId,
  sessionsMeta,
  initialPath,
  onPathChange,
}) => {
  const { push } = useToasts()
  const [sessionId, setSessionId] = useState<string | undefined>(activeSessionId)
  const [activePane, setActivePane] = useState<'local' | 'remote'>('local')
  const isNarrow = useMediaQuery('(max-width: 1099px)')

  useEffect(() => setSessionId(activeSessionId), [activeSessionId])

  const canUse = useMemo(() => !!sessionId, [sessionId])

  // ── Local file browser ─────────────────────────────────────────────────────
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
    refresh: refreshLocal,
  } = useLocalFsBrowser()

  // ── Remote file browser ────────────────────────────────────────────────────
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
    refresh: refreshRemote,
  } = useRemoteFsBrowser(sessionId, initialPath)

  // ── Transfers ──────────────────────────────────────────────────────────────
  const {
    transfers,
    cancelTransfer: doCancel,
    clearCompleted: doClearTransfers,
  } = useSftpTransfers(sessionId)

  // ── Sync remote path to parent ─────────────────────────────────────────────
  const onPathChangeRef = React.useRef(onPathChange)
  useEffect(() => {
    onPathChangeRef.current = onPathChange
  }, [onPathChange])

  useEffect(() => {
    if (onPathChangeRef.current && rpath) onPathChangeRef.current(rpath)
  }, [rpath])

  useEffect(() => {
    if (rerr && onPathChangeRef.current && rerr.includes('no such file')) {
      onPathChangeRef.current('/')
    }
  }, [rerr])

  // ── Context menu state ─────────────────────────────────────────────────────
  const [ctx, setCtx] = useState<{
    open: boolean
    x: number
    y: number
    side: 'local' | 'remote'
  }>({ open: false, x: 0, y: 0, side: 'local' })

  useEffect(() => {
    const close = () => setCtx((c) => ({ ...c, open: false }))
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [])

  // ── Modal states ───────────────────────────────────────────────────────────
  const [mkdirOpen, setMkdirOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  // ── Path helpers (memoized) ────────────────────────────────────────────────
  const getLocalEntryPath = useCallback(
    (entry: LocalEntry | SftpEntry) => (entry as LocalEntry).path,
    []
  )

  const getRemoteEntryPath = useCallback(
    (entry: LocalEntry | SftpEntry) => {
      const e = entry as SftpEntry
      return e.path || joinRemotePath(rpath, e.name)
    },
    [rpath]
  )

  const currentLocalDrive = useMemo(() => {
    if (!ldrives || ldrives.length === 0) return ''
    return ldrives.find((d) => lpath.toUpperCase().startsWith(d.toUpperCase())) || ''
  }, [ldrives, lpath])

  const localCanGoBack = useMemo(
    () => lpath !== '/' && !/^[A-Za-z]:\\?$/.test(lpath),
    [lpath]
  )

  // ── Navigation handlers ────────────────────────────────────────────────────
  const handleLocalNavigate = useCallback(
    (p: string) => {
      setLpath(p)
      refreshLocal(p)
    },
    [setLpath, refreshLocal]
  )

  const handleLocalBack = useCallback(() => {
    const parent = getParentLocalPath(lpath)
    if (parent) handleLocalNavigate(parent)
  }, [lpath, handleLocalNavigate])

  const handleLocalDriveChange = useCallback(
    (drive: string) => {
      if (drive) handleLocalNavigate(drive)
    },
    [handleLocalNavigate]
  )

  const handleRemoteNavigate = useCallback(
    (p: string) => setRpath(p),
    [setRpath]
  )

  const handleRemoteBack = useCallback(() => {
    const parent = getParentRemotePath(rpath)
    if (parent) setRpath(parent)
  }, [rpath, setRpath])

  // Callbacks estables para que el memo de FilePanelToolbar/AddressBar surta efecto.
  const handleLocalRefresh = useCallback(() => {
    refreshLocal()
  }, [refreshLocal])

  const handleRemoteRefresh = useCallback(() => {
    refreshRemote()
  }, [refreshRemote])

  const handleSetActivePaneLocal = useCallback(() => setActivePane('local'), [])
  const handleSetActivePaneRemote = useCallback(() => setActivePane('remote'), [])

  // ── Sort handlers ──────────────────────────────────────────────────────────
  const handleLocalSort = useCallback(
    (key: string) => {
      setLSort((s) => ({
        key: key as any,
        dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc',
      }))
    },
    [setLSort]
  )

  const handleRemoteSort = useCallback(
    (key: string) => {
      setRSort((s) => ({
        key: key as any,
        dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc',
      }))
    },
    [setRSort]
  )

  // ── Transfer actions ───────────────────────────────────────────────────────
  const doUpload = useCallback(async () => {
    if (!sessionId || !lSelectedPath) return
    const entry = lrows.find((x) => x.path === lSelectedPath)
    if (!entry) return
    const remote = joinRemotePath(rpath, entry.name)
    try {
      if (entry.kind === 'dir') {
        await invoke('sftp_upload_dir_start', {
          id: sessionId,
          localPath: lSelectedPath,
          remotePath: remote,
        })
      } else {
        await invoke('sftp_upload_start', {
          id: sessionId,
          localPath: lSelectedPath,
          remotePath: remote,
        })
      }
    } catch (e: any) {
      push({ type: 'error', message: 'Error al subir: ' + (e?.toString?.() || e) })
    }
  }, [sessionId, lSelectedPath, lrows, rpath, push])

  const doDownload = useCallback(async () => {
    if (!sessionId || !rSelectedPath) return
    const entry = rrows.find(
      (x) =>
        x.path === rSelectedPath || joinRemotePath(rpath, x.name) === rSelectedPath
    )
    if (!entry) return
    const local = joinLocalPath(lpath, entry.name)
    try {
      if (entry.kind === 'dir') {
        await invoke('sftp_download_dir_start', {
          id: sessionId,
          remotePath: rSelectedPath,
          localPath: local,
        })
      } else {
        await invoke('sftp_download_start', {
          id: sessionId,
          remotePath: rSelectedPath,
          localPath: local,
        })
      }
    } catch (e: any) {
      push({ type: 'error', message: 'Error al descargar: ' + (e?.toString?.() || e) })
    }
  }, [sessionId, rSelectedPath, rrows, rpath, lpath, push])

  // ── Remote operations ──────────────────────────────────────────────────────
  const doRemoteMkdir = useCallback(() => {
    if (!sessionId) return
    setMkdirOpen(true)
  }, [sessionId])

  const confirmRemoteMkdir = useCallback(
    async (name: string) => {
      if (!sessionId) {
        setMkdirOpen(false)
        return
      }
      const p = joinRemotePath(rpath, name)
      try {
        await invoke('sftp_mkdir', { id: sessionId, path: p })
        refreshRemote()
        push({ type: 'success', message: 'Carpeta creada' })
      } catch (e: any) {
        push({
          type: 'error',
          message: 'Error al crear carpeta: ' + (e?.toString?.() || e),
        })
      }
      setMkdirOpen(false)
    },
    [sessionId, rpath, refreshRemote, push]
  )

  const doRemoteDelete = useCallback(() => {
    if (!sessionId || !rSelectedPath) return
    setConfirmOpen(true)
  }, [sessionId, rSelectedPath])

  const confirmRemoteDelete = useCallback(async () => {
    if (!sessionId || !rSelectedPath) {
      setConfirmOpen(false)
      return
    }
    const entry = rrows.find(
      (x) =>
        x.path === rSelectedPath || joinRemotePath(rpath, x.name) === rSelectedPath
    )
    const isDir = entry?.kind === 'dir' || rSelectedPath.endsWith('/')
    try {
      await invoke('sftp_remove', {
        id: sessionId,
        path: rSelectedPath,
        recursive: isDir,
      })
      setConfirmOpen(false)
      refreshRemote()
      push({ type: 'success', message: 'Eliminado' })
    } catch (e: any) {
      setConfirmOpen(false)
      push({
        type: 'error',
        message: 'Error eliminando: ' + (e?.toString?.() || e),
      })
    }
  }, [sessionId, rSelectedPath, rrows, rpath, refreshRemote, push])

  // ── Context menu handlers ──────────────────────────────────────────────────
  const handleLocalContextMenu = useCallback(
    (_entry: LocalEntry | SftpEntry, e: React.MouseEvent) => {
      setCtx({ open: true, x: e.clientX, y: e.clientY, side: 'local' })
    },
    []
  )

  const handleRemoteContextMenu = useCallback(
    (_entry: LocalEntry | SftpEntry, e: React.MouseEvent) => {
      setCtx({ open: true, x: e.clientX, y: e.clientY, side: 'remote' })
    },
    []
  )

  const handleLocalOpen = useCallback(() => {
    if (!lSelectedPath) return
    const ent = ldisplay.find((e) => e.path === lSelectedPath)
    if (ent?.kind === 'dir') {
      handleLocalNavigate(ent.path)
    }
  }, [lSelectedPath, ldisplay, handleLocalNavigate])

  // ── Context menu items ─────────────────────────────────────────────────────
  const ctxItems = useMemo(
    () =>
      ctx.side === 'local'
        ? [
            { label: 'Subir', onClick: doUpload, disabled: !sessionId || !lSelectedPath },
            { label: 'Abrir', onClick: handleLocalOpen },
          ]
        : [
            { label: 'Nueva carpeta', onClick: doRemoteMkdir, disabled: !canUse },
            {
              label: 'Eliminar',
              onClick: doRemoteDelete,
              disabled: !canUse || !rSelectedPath,
              danger: true,
            },
            {
              label: 'Descargar',
              onClick: doDownload,
              disabled: !canUse || !rSelectedPath,
            },
          ],
    [
      ctx.side,
      sessionId,
      lSelectedPath,
      canUse,
      rSelectedPath,
      doUpload,
      doDownload,
      doRemoteMkdir,
      doRemoteDelete,
      handleLocalOpen,
    ]
  )

  // ── Header labels ──────────────────────────────────────────────────────────
  const remoteSessionLabel = sessionId ? sessionsMeta?.[sessionId]?.label || sessionId : undefined
  const remoteStatusColor = rerr ? 'var(--danger)' : canUse ? 'var(--success)' : 'var(--text-muted)'

  const headerLabelStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 2px 6px',
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: 'var(--text-secondary)',
    flexShrink: 0,
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: isNarrow ? '1fr' : '1fr clamp(200px, 18vw, 260px) 1fr',
        gridTemplateRows: isNarrow ? 'auto auto auto' : '1fr',
        height: '100%',
        gap: 8,
        padding: 8,
        minHeight: 0,
      }}
    >
      {/* Local column */}
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: isNarrow ? 320 : 0, minWidth: 0 }}>
        <span style={headerLabelStyle}>
          <Monitor size={13} aria-hidden="true" />
          Tu equipo
        </span>
        <FilePanel
          side="local"
          active={activePane === 'local'}
          onClick={handleSetActivePaneLocal}
          path={lpath}
          onNavigate={handleLocalNavigate}
          onBack={handleLocalBack}
          canGoBack={localCanGoBack}
          entries={ldisplay}
          loading={lload}
          selectedPath={lSelectedPath}
          onSelect={setLSelectedPath}
          sortKey={lSort.key}
          sortDir={lSort.dir}
          onSort={handleLocalSort}
          filter={lfilter}
          onFilterChange={setLfilter}
          rootLabel="Local"
          onRefresh={handleLocalRefresh}
          drives={ldrives}
          currentDrive={currentLocalDrive}
          onDriveChange={handleLocalDriveChange}
          onUpload={doUpload}
          canUpload={!!sessionId && !!lSelectedPath}
          onContextMenu={handleLocalContextMenu}
          getEntryPath={getLocalEntryPath}
        />
      </div>

      {/* Bridge column */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          minHeight: isNarrow ? undefined : 0,
          minWidth: 0,
          borderRadius: 10,
          border: '1.5px solid var(--border-strong)',
          background: 'var(--surface-1)',
          boxShadow: '2px 2px 0 var(--border-strong)',
        }}
      >
        <TransferBridge
          vertical={!isNarrow}
          onUpload={doUpload}
          canUpload={!!sessionId && !!lSelectedPath}
          onDownload={doDownload}
          canDownload={canUse && !!rSelectedPath}
          transfers={transfers}
          onCancel={doCancel}
          onClear={doClearTransfers}
        />
      </div>

      {/* Remote column */}
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: isNarrow ? 320 : 0, minWidth: 0 }}>
        <span style={headerLabelStyle}>
          <Server size={13} aria-hidden="true" />
          Laboratorio
          {remoteSessionLabel && (
            <span style={{ color: 'var(--text-primary)', fontWeight: 600, textTransform: 'none', letterSpacing: 'normal' }}>
              {remoteSessionLabel}
            </span>
          )}
          <span
            aria-hidden="true"
            title={rerr ? 'Error de conexión' : canUse ? 'Conectado' : 'Sin conexión'}
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: remoteStatusColor,
              flexShrink: 0,
              marginLeft: 'auto',
            }}
          />
        </span>
        <FilePanel
          side="remote"
          active={activePane === 'remote'}
          onClick={handleSetActivePaneRemote}
          path={rpath}
          onNavigate={handleRemoteNavigate}
          onBack={handleRemoteBack}
          canGoBack={rpath !== '/'}
          entries={rdisplay}
          loading={rload}
          error={rerr}
          selectedPath={rSelectedPath}
          onSelect={setRSelectedPath}
          sortKey={rSort.key}
          sortDir={rSort.dir}
          onSort={handleRemoteSort}
          filter={rfilter}
          onFilterChange={setRfilter}
          rootLabel="Remoto"
          addressPrefix="/"
          onRefresh={handleRemoteRefresh}
          sessions={sessions}
          sessionId={sessionId}
          sessionsMeta={sessionsMeta}
          onSessionChange={setSessionId}
          isConnected={canUse}
          onNewFolder={doRemoteMkdir}
          onDelete={doRemoteDelete}
          canDelete={canUse && !!rSelectedPath}
          onDownload={doDownload}
          canDownload={canUse && !!rSelectedPath}
          disabled={!canUse}
          onContextMenu={handleRemoteContextMenu}
          getEntryPath={getRemoteEntryPath}
        />
      </div>

      {/* Context Menu */}
      <ContextMenu
        x={ctx.x}
        y={ctx.y}
        open={ctx.open}
        onClose={() => setCtx((c) => ({ ...c, open: false }))}
        items={ctxItems}
      />

      {/* Modals */}
      <ConfirmModal
        open={confirmOpen}
        title="Eliminar en remoto"
        message={`¿Eliminar "${rSelectedPath?.split('/').pop() || ''}" en ${rpath}?`}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={confirmRemoteDelete}
      />
      <PromptModal
        open={mkdirOpen}
        title="Nueva carpeta"
        message="Nombre de la carpeta nueva:"
        placeholder="nombre_carpeta"
        onCancel={() => setMkdirOpen(false)}
        onConfirm={confirmRemoteMkdir}
      />
    </div>
  )
}

export default SftpPage
