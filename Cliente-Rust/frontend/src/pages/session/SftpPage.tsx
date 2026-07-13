import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { commandClient } from '../../services/command.service'
import { useMediaQuery } from '@mantine/hooks'
import { Monitor, Server } from 'lucide-react'
import FilePanel from '../../components/sftp/FilePanel'
import TransferDivider from '../../components/sftp/TransferDivider'
import TransferQueue from '../../components/sftp/TransferQueue'
import ContextMenu from '../../components/shared/ContextMenu'
import ConfirmModal from '../../components/modals/ConfirmModal'
import PromptModal from '../../components/modals/PromptModal'
import QuickViewModal from '../../components/sftp/QuickViewModal'
import { useLocalFsBrowser } from '../../hooks/useLocalFsBrowser'
import { useRemoteFsBrowser } from '../../hooks/useRemoteFsBrowser'
import { useSftpTransfers } from '../../hooks/useSftpTransfers'
import { usePointerDrag } from '../../components/sftp/usePointerDrag'
import { useToasts } from '../../contexts/ToastContext'
import {
  joinLocalPath,
  joinRemotePath,
  getParentLocalPath,
  getParentRemotePath,
} from '../../components/shared/pathUtils'
import { formatBytes } from '../../components/shared/fileFormatters'
import type { SftpEntry, LocalEntry } from '../../types'

type Props = {
  sessions: string[]
  activeSessionId?: string
  sessionsMeta?: Record<string, { label: string }>
  initialPath?: string
  onPathChange?: (path: string) => void
}

/** Trunca una lista de nombres a `max` elementos para mostrar en confirmaciones. */
function summarizeNames(names: string[], max = 10): string {
  const shown = names.slice(0, max)
  const rest = names.length - shown.length
  return rest > 0 ? `${shown.join(', ')}, …y ${rest} más` : shown.join(', ')
}

/** Extensiones consideradas de texto para habilitar "Vista rápida" (sftp_read_text). */
const TEXT_EXTENSIONS = new Set([
  'txt', 'log', 'md', 'py', 'sh', 'conf', 'cfg', 'ini', 'json', 'yaml', 'yml',
  'toml', 'xml', 'csv', 'js', 'ts', 'rs', 'c', 'cpp', 'h', 'html', 'css',
  'sql', 'service', 'env', 'gitignore',
])

/** Determina si un nombre de archivo corresponde a un archivo de texto conocido. */
function isTextFileName(name: string): boolean {
  const idx = name.lastIndexOf('.')
  if (idx === -1) return true
  const ext = name.slice(idx + 1).toLowerCase()
  return TEXT_EXTENSIONS.has(ext)
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
    selectedPaths: lSelectedPaths,
    lastSelected: lLastSelected,
    selectOnly: lSelectOnly,
    toggleSelect: lToggleSelect,
    selectRange: lSelectRange,
    selectAll: lSelectAll,
    clearSelection: lClearSelection,
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
    selectedPaths: rSelectedPaths,
    lastSelected: rLastSelected,
    selectOnly: rSelectOnly,
    toggleSelect: rToggleSelect,
    selectRange: rSelectRange,
    selectAll: rSelectAll,
    clearSelection: rClearSelection,
    sort: rSort,
    setSort: setRSort,
    filter: rfilter,
    setFilter: setRfilter,
    refresh: refreshRemote,
    insertEntry: insertRemoteEntry,
    removeEntry: removeRemoteEntry,
  } = useRemoteFsBrowser(sessionId, initialPath)

  // ── Transfers ──────────────────────────────────────────────────────────────
  const {
    transfers,
    cancelTransfer: doCancel,
    clearCompleted: doClearTransfers,
  } = useSftpTransfers(sessionId)

  // ── Actualización incremental del panel remoto tras subidas completadas ────
  // Cuando una transferencia de subida termina, inserta/actualiza la entrada
  // resultante en el panel remoto (sin refresh completo) si el directorio
  // destino de la subida sigue siendo el directorio remoto que se está viendo.
  const processedUploadIdsRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    for (const t of transfers) {
      if (t.direction !== 'upload' || t.status !== 'done') continue
      if (processedUploadIdsRef.current.has(t.id)) continue
      processedUploadIdsRef.current.add(t.id)
      const remotePath = t.remote_path
      if (!remotePath) continue
      const parent = getParentRemotePath(remotePath) ?? '/'
      if (parent === rpath) {
        const name = remotePath.split('/').filter(Boolean).pop() || remotePath
        insertRemoteEntry({
          name,
          path: remotePath,
          kind: 'file',
          size: t.total ?? t.bytes,
          mtime: Math.floor(Date.now() / 1000),
        })
      }
    }
  }, [transfers, rpath, insertRemoteEntry])

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
  const [renameOpen, setRenameOpen] = useState(false)
  const [quickView, setQuickView] = useState<{
    open: boolean
    fileName: string
    content: string
    truncated: boolean
  }>({ open: false, fileName: '', content: '', truncated: false })

  const anyModalOpen = mkdirOpen || confirmOpen || renameOpen || quickView.open

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

  // ── Selección: entradas seleccionadas resueltas (derivadas de rows) ───────
  const lSelectedEntries = useMemo(
    () => lrows.filter((x) => lSelectedPaths.has(x.path)),
    [lrows, lSelectedPaths]
  )
  const rSelectedEntries = useMemo(
    () => rrows.filter((x) => rSelectedPaths.has(getRemoteEntryPath(x))),
    [rrows, rSelectedPaths, getRemoteEntryPath]
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

  // ── Transfer actions (multi-archivo) ───────────────────────────────────────
  // Sube una lista de entradas locales al directorio remoto actual, de forma
  // secuencial (for..of, no en paralelo). Reutiliza exactamente los mismos
  // comandos/mecanismos de invocación que la versión de un solo archivo.
  const doUploadEntries = useCallback(
    async (entries: LocalEntry[]) => {
      if (!sessionId || entries.length === 0) return
      for (const entry of entries) {
        // Defensivo: nunca invocar upload con un path vacío/indefinido.
        if (!entry || typeof entry.path !== 'string' || entry.path.trim() === '') {
          push({
            type: 'error',
            message: `Ruta local inválida para "${entry?.name ?? 'elemento desconocido'}"`,
          })
          continue
        }
        const remote = joinRemotePath(rpath, entry.name)
        try {
          if (entry.kind === 'dir') {
            await invoke('sftp_upload_dir_start', {
              id: sessionId,
              localPath: entry.path,
              remotePath: remote,
            })
          } else {
            // Comando migrado al protocolo versionado (payload snake_case).
            await commandClient.invoke<
              { id: string; local_path: string; remote_path: string },
              { transfer_id: string }
            >('sftp_upload_start', {
              id: sessionId,
              local_path: entry.path,
              remote_path: remote,
            })
          }
        } catch (e: any) {
          push({ type: 'error', message: 'Error al subir: ' + (e?.toString?.() || e) })
        }
      }
    },
    [sessionId, rpath, push]
  )

  const doUpload = useCallback(() => {
    doUploadEntries(lSelectedEntries)
  }, [doUploadEntries, lSelectedEntries])

  // Sube un path local arbitrario (sin LocalEntry conocido) al directorio remoto
  // actual, determinando si es carpeta o archivo antes de elegir el comando.
  // Se usa para el drag & drop nativo de archivos del explorador de Windows.
  const doUploadPath = useCallback(
    async (localPath: string) => {
      if (!sessionId) return
      if (typeof localPath !== 'string' || localPath.trim() === '') {
        push({ type: 'error', message: 'Ruta local inválida' })
        return
      }
      const name = localPath.split(/[\\/]/).filter(Boolean).pop() || localPath
      const remote = joinRemotePath(rpath, name)
      let isDir = false
      try {
        await invoke('local_list_dir', { path: localPath })
        isDir = true
      } catch {
        isDir = false
      }
      try {
        if (isDir) {
          await invoke('sftp_upload_dir_start', {
            id: sessionId,
            localPath,
            remotePath: remote,
          })
        } else {
          await commandClient.invoke<
            { id: string; local_path: string; remote_path: string },
            { transfer_id: string }
          >('sftp_upload_start', {
            id: sessionId,
            local_path: localPath,
            remote_path: remote,
          })
        }
      } catch (e: any) {
        push({ type: 'error', message: 'Error al subir: ' + (e?.toString?.() || e) })
      }
    },
    [sessionId, rpath, push]
  )

  // Descarga una lista de entradas remotas al directorio local actual, de
  // forma secuencial (for..of).
  const doDownloadEntries = useCallback(
    async (entries: SftpEntry[]) => {
      if (!sessionId || entries.length === 0) return
      for (const entry of entries) {
        const remotePath = entry?.path || (entry ? joinRemotePath(rpath, entry.name) : undefined)
        // Defensivo: nunca invocar download con un path remoto o local vacío.
        if (!entry || typeof remotePath !== 'string' || remotePath.trim() === '') {
          push({
            type: 'error',
            message: `Ruta remota inválida para "${entry?.name ?? 'elemento desconocido'}"`,
          })
          continue
        }
        const local = joinLocalPath(lpath, entry.name)
        if (typeof local !== 'string' || local.trim() === '') {
          push({ type: 'error', message: `Ruta local de destino inválida para "${entry.name}"` })
          continue
        }
        try {
          if (entry.kind === 'dir') {
            await invoke('sftp_download_dir_start', {
              id: sessionId,
              remotePath,
              localPath: local,
            })
          } else {
            // Comando migrado al protocolo versionado (payload snake_case).
            await commandClient.invoke<
              { id: string; remote_path: string; local_path: string },
              { transfer_id: string }
            >('sftp_download_start', {
              id: sessionId,
              remote_path: remotePath,
              local_path: local,
            })
          }
        } catch (e: any) {
          push({ type: 'error', message: 'Error al descargar: ' + (e?.toString?.() || e) })
        }
      }
    },
    [sessionId, rpath, lpath, push]
  )

  const doDownload = useCallback(() => {
    doDownloadEntries(rSelectedEntries)
  }, [doDownloadEntries, rSelectedEntries])

  // ── Abrir / Abrir con… (local) ──────────────────────────────────────────────
  const doLocalOpenPath = useCallback(
    async (path: string) => {
      try {
        await invoke('local_open_path', { path })
      } catch (e: any) {
        push({ type: 'error', message: 'Error al abrir: ' + (e?.toString?.() || e) })
      }
    },
    [push]
  )

  const doLocalRevealInExplorer = useCallback(
    async (path: string) => {
      try {
        await invoke('local_reveal_in_explorer', { path })
      } catch (e: any) {
        push({ type: 'error', message: 'Error al mostrar en el explorador: ' + (e?.toString?.() || e) })
      }
    },
    [push]
  )

  // ── Abrir / Abrir con… (remoto): descargar-y-abrir y vista rápida ─────────
  // Mapa de transfer_id -> ruta local temporal pendiente de abrir cuando la
  // descarga termine (observado vía el efecto que sigue `transfers`).
  const pendingOpenTransfersRef = useRef<Map<string, string>>(new Map())

  const doDownloadAndOpen = useCallback(
    async (entry: SftpEntry) => {
      if (!sessionId) return
      const remotePath = getRemoteEntryPath(entry)
      if (typeof remotePath !== 'string' || remotePath.trim() === '') {
        push({ type: 'error', message: `Ruta remota inválida para "${entry.name}"` })
        return
      }
      try {
        const tempDir = await invoke<string>('local_temp_dir')
        const openDir = joinLocalPath(tempDir, 'laboremoto-open')
        const localPath = joinLocalPath(openDir, entry.name)
        const res = await commandClient.invoke<
          { id: string; remote_path: string; local_path: string },
          { transfer_id: string }
        >('sftp_download_start', { id: sessionId, remote_path: remotePath, local_path: localPath })
        pendingOpenTransfersRef.current.set(res.transfer_id, localPath)
      } catch (e: any) {
        push({ type: 'error', message: 'Error al descargar: ' + (e?.toString?.() || e) })
      }
    },
    [sessionId, getRemoteEntryPath, push]
  )

  // Cuando una transferencia de descarga marcada para "abrir" termina, se
  // invoca local_open_path con el archivo temporal descargado.
  useEffect(() => {
    for (const t of transfers) {
      const localPath = pendingOpenTransfersRef.current.get(t.id)
      if (!localPath) continue
      if (t.status === 'done') {
        pendingOpenTransfersRef.current.delete(t.id)
        invoke('local_open_path', { path: localPath }).catch((e: any) => {
          push({ type: 'error', message: 'Error al abrir: ' + (e?.toString?.() || e) })
        })
      } else if (t.status === 'error' || t.status === 'cancelled') {
        pendingOpenTransfersRef.current.delete(t.id)
      }
    }
  }, [transfers, push])

  const doQuickView = useCallback(
    async (entry: SftpEntry) => {
      if (!sessionId) return
      const remotePath = getRemoteEntryPath(entry)
      if (typeof remotePath !== 'string' || remotePath.trim() === '') {
        push({ type: 'error', message: `Ruta remota inválida para "${entry.name}"` })
        return
      }
      try {
        const res = await commandClient.invoke<
          { id: string; path: string; max_bytes?: number },
          { content: string; truncated: boolean; size?: number }
        >('sftp_read_text', { id: sessionId, path: remotePath })
        setQuickView({ open: true, fileName: entry.name, content: res.content, truncated: res.truncated })
      } catch (e: any) {
        push({ type: 'error', message: 'Error al leer el archivo: ' + (e?.toString?.() || e) })
      }
    },
    [sessionId, getRemoteEntryPath, push]
  )

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
        // Comando migrado al protocolo versionado.
        await commandClient.invoke<{ id: string; path: string }, { ok: boolean }>(
          'sftp_mkdir',
          { id: sessionId, path: p }
        )
        // Actualización local: inserta la carpeta nueva sin refrescar todo el directorio.
        insertRemoteEntry({ name, path: p, kind: 'dir', mtime: Math.floor(Date.now() / 1000) })
        push({ type: 'success', message: 'Carpeta creada' })
      } catch (e: any) {
        push({
          type: 'error',
          message: 'Error al crear carpeta: ' + (e?.toString?.() || e),
        })
      }
      setMkdirOpen(false)
    },
    [sessionId, rpath, insertRemoteEntry, push]
  )

  const doRemoteDelete = useCallback(() => {
    if (!sessionId || rSelectedPaths.size === 0) return
    setConfirmOpen(true)
  }, [sessionId, rSelectedPaths])

  const confirmRemoteDelete = useCallback(async () => {
    if (!sessionId || rSelectedEntries.length === 0) {
      setConfirmOpen(false)
      return
    }
    setConfirmOpen(false)
    let okCount = 0
    for (const entry of rSelectedEntries) {
      const path = getRemoteEntryPath(entry)
      const isDir = entry.kind === 'dir'
      try {
        await invoke('sftp_remove', {
          id: sessionId,
          path,
          recursive: isDir,
        })
        // Actualización local: quita la entrada eliminada sin refrescar todo el directorio.
        removeRemoteEntry(entry.name)
        okCount += 1
      } catch (e: any) {
        push({
          type: 'error',
          message: `Error eliminando "${entry.name}": ` + (e?.message ?? String(e)),
        })
      }
    }
    rClearSelection()
    if (okCount > 0) {
      push({ type: 'success', message: `Eliminado${okCount !== 1 ? 's' : ''} ${okCount} elemento${okCount !== 1 ? 's' : ''}` })
    }
  }, [sessionId, rSelectedEntries, getRemoteEntryPath, removeRemoteEntry, rClearSelection, push])

  const deleteConfirmMessage = useMemo(() => {
    const names = rSelectedEntries.map((e) => e.name)
    if (names.length === 0) return ''
    return `¿Eliminar ${names.length} elemento${names.length !== 1 ? 's' : ''} en ${rpath}? ${summarizeNames(names)}`
  }, [rSelectedEntries, rpath])

  // ── Renombrar (solo remoto) ─────────────────────────────────────────────────
  const doRemoteRename = useCallback(() => {
    if (!sessionId || rSelectedEntries.length !== 1) return
    setRenameOpen(true)
  }, [sessionId, rSelectedEntries])

  const confirmRemoteRename = useCallback(
    async (newName: string) => {
      setRenameOpen(false)
      if (!sessionId || rSelectedEntries.length !== 1) return
      const entry = rSelectedEntries[0]
      const oldPath = getRemoteEntryPath(entry)
      const newPath = joinRemotePath(rpath, newName)
      try {
        await commandClient.invoke<
          { id: string; old_path: string; new_path: string },
          { ok: boolean }
        >('sftp_rename', { id: sessionId, old_path: oldPath, new_path: newPath })
        removeRemoteEntry(entry.name)
        insertRemoteEntry({ ...entry, name: newName, path: newPath })
        rSelectOnly(newPath)
        push({ type: 'success', message: 'Elemento renombrado' })
      } catch (e: any) {
        push({ type: 'error', message: 'Error al renombrar: ' + (e?.toString?.() || e) })
      }
    },
    [sessionId, rSelectedEntries, getRemoteEntryPath, rpath, removeRemoteEntry, insertRemoteEntry, rSelectOnly, push]
  )

  // ── Drag & drop interno por puntero entre paneles ───────────────────────────
  const localPanelRef = useRef<HTMLDivElement | null>(null)
  const remotePanelRef = useRef<HTMLDivElement | null>(null)

  const handlePointerDropOnRemote = useCallback(() => {
    doUploadEntries(lSelectedEntries)
  }, [doUploadEntries, lSelectedEntries])

  const handlePointerDropOnLocal = useCallback(() => {
    doDownloadEntries(rSelectedEntries)
  }, [doDownloadEntries, rSelectedEntries])

  const {
    dragging,
    ghostPos,
    hoverSide,
    startPress,
    consumeSuppressedClick,
  } = usePointerDrag({
    localPanelRef,
    remotePanelRef,
    onDropOnLocal: handlePointerDropOnLocal,
    onDropOnRemote: handlePointerDropOnRemote,
  })

  const handleLocalRowPointerDown = useCallback(
    (_entry: LocalEntry | SftpEntry, e: React.MouseEvent) => {
      startPress('local', lSelectedPaths.size || 1, e)
    },
    [startPress, lSelectedPaths]
  )

  const handleRemoteRowPointerDown = useCallback(
    (_entry: LocalEntry | SftpEntry, e: React.MouseEvent) => {
      startPress('remote', rSelectedPaths.size || 1, e)
    },
    [startPress, rSelectedPaths]
  )

  // ── Drag & drop nativo de archivos del explorador de Windows ───────────────
  const [nativeDragOverRemote, setNativeDragOverRemote] = useState(false)

  useEffect(() => {
    let unlisten: (() => void) | undefined
    let cancelled = false

    getCurrentWebview()
      .onDragDropEvent((event) => {
        const el = remotePanelRef.current
        if (!el) return
        const payload = event.payload
        if (payload.type === 'leave') {
          setNativeDragOverRemote(false)
          return
        }
        // Las posiciones llegan en píxeles físicos; se convierten a CSS px
        // para compararlas contra getBoundingClientRect().
        const scale = window.devicePixelRatio || 1
        const x = payload.position.x / scale
        const y = payload.position.y / scale
        const rect = el.getBoundingClientRect()
        const inside = x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom

        if (payload.type === 'over') {
          setNativeDragOverRemote(inside)
          return
        }
        if (payload.type === 'drop') {
          setNativeDragOverRemote(false)
          if (!inside || !sessionId) return
          for (const p of payload.paths) {
            doUploadPath(p)
          }
        }
      })
      .then((fn) => {
        if (cancelled) fn()
        else unlisten = fn
      })

    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [sessionId, doUploadPath])

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
    if (lSelectedPaths.size !== 1) return
    const p = Array.from(lSelectedPaths)[0]
    const ent = ldisplay.find((e) => e.path === p)
    if (!ent) return
    if (ent.kind === 'dir') {
      handleLocalNavigate(ent.path)
    } else {
      doLocalOpenPath(getLocalEntryPath(ent))
    }
  }, [lSelectedPaths, ldisplay, handleLocalNavigate, doLocalOpenPath, getLocalEntryPath])

  // ── Selección única de archivo (no carpeta): habilita "Abrir con…" ────────
  const lSingleFileEntry = useMemo(() => {
    if (lSelectedPaths.size !== 1) return undefined
    const p = Array.from(lSelectedPaths)[0]
    const ent = ldisplay.find((e) => e.path === p)
    return ent && ent.kind !== 'dir' ? ent : undefined
  }, [lSelectedPaths, ldisplay])

  const rSingleFileEntry = useMemo(() => {
    if (rSelectedPaths.size !== 1) return undefined
    const p = Array.from(rSelectedPaths)[0]
    const ent = rdisplay.find((e) => getRemoteEntryPath(e) === p)
    return ent && ent.kind !== 'dir' ? (ent as SftpEntry) : undefined
  }, [rSelectedPaths, rdisplay, getRemoteEntryPath])

  // ── Context menu items ─────────────────────────────────────────────────────
  const ctxItems = useMemo(
    () =>
      ctx.side === 'local'
        ? [
            {
              label: 'Enviar al laboratorio',
              onClick: doUpload,
              disabled: !sessionId || lSelectedPaths.size === 0,
            },
            { label: 'Abrir', onClick: handleLocalOpen, disabled: lSelectedPaths.size !== 1 },
            {
              label: 'Abrir con…',
              disabled: !lSingleFileEntry,
              children: [
                {
                  label: 'Aplicación predeterminada',
                  onClick: () => lSingleFileEntry && doLocalOpenPath(getLocalEntryPath(lSingleFileEntry)),
                },
                {
                  label: 'Mostrar en el explorador',
                  onClick: () =>
                    lSingleFileEntry && doLocalRevealInExplorer(getLocalEntryPath(lSingleFileEntry)),
                },
              ],
            },
          ]
        : [
            { label: 'Traer', onClick: doDownload, disabled: !canUse || rSelectedPaths.size === 0 },
            {
              label: 'Abrir',
              onClick: () => rSingleFileEntry && doDownloadAndOpen(rSingleFileEntry),
              disabled: !canUse || !rSingleFileEntry,
            },
            {
              label: 'Abrir con…',
              disabled: !canUse || !rSingleFileEntry,
              children: [
                {
                  label: 'Descargar y abrir',
                  onClick: () => rSingleFileEntry && doDownloadAndOpen(rSingleFileEntry),
                },
                {
                  label: 'Vista rápida',
                  onClick: () => rSingleFileEntry && doQuickView(rSingleFileEntry),
                  disabled: !rSingleFileEntry || !isTextFileName(rSingleFileEntry.name),
                },
              ],
            },
            {
              label: 'Renombrar',
              onClick: doRemoteRename,
              disabled: !canUse || rSelectedPaths.size !== 1,
            },
            {
              label: 'Eliminar',
              onClick: doRemoteDelete,
              disabled: !canUse || rSelectedPaths.size === 0,
              danger: true,
            },
            { label: 'Nueva carpeta', onClick: doRemoteMkdir, disabled: !canUse },
          ],
    [
      ctx.side,
      sessionId,
      lSelectedPaths,
      canUse,
      rSelectedPaths,
      doUpload,
      doDownload,
      doRemoteRename,
      doRemoteMkdir,
      doRemoteDelete,
      handleLocalOpen,
      lSingleFileEntry,
      rSingleFileEntry,
      getLocalEntryPath,
      doLocalOpenPath,
      doLocalRevealInExplorer,
      doDownloadAndOpen,
      doQuickView,
    ]
  )

  // ── Atajos de teclado (nivel página) ────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (anyModalOpen) return
      const active = document.activeElement as HTMLElement | null
      const tag = active?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || active?.isContentEditable) {
        return
      }

      if (e.key === 'F5') {
        e.preventDefault()
        if (activePane === 'local') doUpload()
        else doDownload()
        return
      }
      if (e.key === 'F7') {
        e.preventDefault()
        doRemoteMkdir()
        return
      }
      if (e.key === 'Delete' || e.key === 'F8') {
        e.preventDefault()
        doRemoteDelete()
        return
      }
      if (e.key === 'F2') {
        e.preventDefault()
        doRemoteRename()
        return
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault()
        if (activePane === 'local') lSelectAll(ldisplay.map(getLocalEntryPath))
        else rSelectAll(rdisplay.map(getRemoteEntryPath))
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        if (activePane === 'local') lClearSelection()
        else rClearSelection()
        return
      }
      if (e.key === 'Enter') {
        if (activePane === 'local') {
          if (lSelectedPaths.size === 1) {
            const p = Array.from(lSelectedPaths)[0]
            const ent = ldisplay.find((x) => x.path === p)
            if (ent?.kind === 'dir') {
              e.preventDefault()
              handleLocalNavigate(ent.path)
            }
          }
        } else if (rSelectedPaths.size === 1) {
          const p = Array.from(rSelectedPaths)[0]
          const ent = rdisplay.find((x) => getRemoteEntryPath(x) === p)
          if (ent?.kind === 'dir') {
            e.preventDefault()
            handleRemoteNavigate(getRemoteEntryPath(ent))
          }
        }
        return
      }
      if (e.key === 'Backspace') {
        e.preventDefault()
        if (activePane === 'local') handleLocalBack()
        else handleRemoteBack()
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    anyModalOpen,
    activePane,
    doUpload,
    doDownload,
    doRemoteMkdir,
    doRemoteDelete,
    doRemoteRename,
    ldisplay,
    rdisplay,
    getLocalEntryPath,
    getRemoteEntryPath,
    lSelectAll,
    rSelectAll,
    lClearSelection,
    rClearSelection,
    lSelectedPaths,
    rSelectedPaths,
    handleLocalNavigate,
    handleRemoteNavigate,
    handleLocalBack,
    handleRemoteBack,
  ])

  // ── Header labels ──────────────────────────────────────────────────────────
  const remoteSessionLabel = sessionId ? sessionsMeta?.[sessionId]?.label || sessionId : undefined
  const remoteStatusColor = rerr ? 'var(--danger)' : canUse ? 'var(--success)' : 'var(--text-muted)'

  const microLabelStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: 'var(--text-secondary)',
    flexShrink: 0,
    minWidth: 0,
  }

  const renameDefaultValue = rSelectedEntries.length === 1 ? rSelectedEntries[0].name : ''

  // ── Barra de estado global (pane activo) ───────────────────────────────────
  const activeSelectedEntries = activePane === 'local' ? lSelectedEntries : rSelectedEntries
  const activeTotalEntries = activePane === 'local' ? lrows.length : rrows.length
  const activeSelectedSize = activeSelectedEntries.reduce(
    (sum, e) => sum + (e.kind === 'dir' ? 0 : e.size || 0),
    0
  )

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        gap: 6,
        padding: 8,
        minHeight: 0,
      }}
    >
      {/* Cabecera de sesión (franja delgada) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '5px 10px',
          borderRadius: 6,
          border: '1.5px solid var(--border-strong)',
          background: 'var(--surface-1)',
          flexShrink: 0,
        }}
      >
        <span style={{ ...microLabelStyle, flex: 1 }}>
          <Monitor size={13} aria-hidden="true" />
          Tu equipo
        </span>
        <div style={{ width: isNarrow ? 0 : 44, flexShrink: 0 }} aria-hidden="true" />
        <span style={{ ...microLabelStyle, flex: 1 }}>
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
      </div>

      {/* Paneles: local | divisor | remoto */}
      <div
        style={{
          display: 'flex',
          flexDirection: isNarrow ? 'column' : 'row',
          flex: 1,
          minHeight: 0,
          gap: 8,
        }}
      >
      {/* Local column */}
      <div
        ref={localPanelRef}
        style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: isNarrow ? 320 : 0, minWidth: 0 }}
      >
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
          selectedPaths={lSelectedPaths}
          lastSelected={lLastSelected}
          onSelectOnly={lSelectOnly}
          onToggleSelect={lToggleSelect}
          onSelectRange={lSelectRange}
          onClearSelection={lClearSelection}
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
          canUpload={!!sessionId && lSelectedPaths.size > 0}
          onContextMenu={handleLocalContextMenu}
          getEntryPath={getLocalEntryPath}
          onRowPointerDown={handleLocalRowPointerDown}
          consumeSuppressedClick={consumeSuppressedClick}
          forceDragOver={hoverSide === 'local'}
          onOpenFile={(entry) => doLocalOpenPath(getLocalEntryPath(entry))}
        />
      </div>

      {/* Divisor con botones de envío/recepción */}
      <TransferDivider
        vertical={!isNarrow}
        onUpload={doUpload}
        canUpload={!!sessionId && lSelectedPaths.size > 0}
        uploadCount={lSelectedPaths.size > 1 ? lSelectedPaths.size : undefined}
        onDownload={doDownload}
        canDownload={canUse && rSelectedPaths.size > 0}
        downloadCount={rSelectedPaths.size > 1 ? rSelectedPaths.size : undefined}
      />

      {/* Remote column */}
      <div
        ref={remotePanelRef}
        style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: isNarrow ? 320 : 0, minWidth: 0 }}
      >
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
          selectedPaths={rSelectedPaths}
          lastSelected={rLastSelected}
          onSelectOnly={rSelectOnly}
          onToggleSelect={rToggleSelect}
          onSelectRange={rSelectRange}
          onClearSelection={rClearSelection}
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
          onNewFolder={doRemoteMkdir}
          onRename={doRemoteRename}
          canRename={canUse && rSelectedPaths.size === 1}
          onDelete={doRemoteDelete}
          canDelete={canUse && rSelectedPaths.size > 0}
          onDownload={doDownload}
          canDownload={canUse && rSelectedPaths.size > 0}
          disabled={!canUse}
          onContextMenu={handleRemoteContextMenu}
          getEntryPath={getRemoteEntryPath}
          onRowPointerDown={handleRemoteRowPointerDown}
          consumeSuppressedClick={consumeSuppressedClick}
          forceDragOver={nativeDragOverRemote || hoverSide === 'remote'}
          onOpenFile={(entry) => doDownloadAndOpen(entry as SftpEntry)}
        />
      </div>
      </div>

      {/* Cola de transferencias (ancho completo, colapsable) */}
      <TransferQueue transfers={transfers} onCancel={doCancel} onClear={doClearTransfers} />

      {/* Barra de estado global */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '4px 10px',
          borderRadius: 6,
          border: '1px solid var(--border-subtle)',
          background: 'var(--surface-2)',
          flexShrink: 0,
          fontSize: 11,
          color: 'var(--text-secondary)',
        }}
      >
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
          {activeSelectedEntries.length > 0
            ? `${activeSelectedEntries.length} seleccionado${activeSelectedEntries.length !== 1 ? 's' : ''} — ${formatBytes(activeSelectedSize)}`
            : `${activeTotalEntries} elemento${activeTotalEntries !== 1 ? 's' : ''}`}
        </span>
        <div style={{ flex: 1 }} />
        <span>SFTP · {remoteSessionLabel || 'sin sesión'}</span>
        <span
          aria-hidden="true"
          title={rerr ? 'Error de conexión' : canUse ? 'Conectado' : 'Sin conexión'}
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: remoteStatusColor,
            flexShrink: 0,
          }}
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
        message={deleteConfirmMessage}
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
      <PromptModal
        open={renameOpen}
        title="Renombrar"
        message="Nuevo nombre:"
        placeholder="nuevo_nombre"
        defaultValue={renameDefaultValue}
        onCancel={() => setRenameOpen(false)}
        onConfirm={confirmRemoteRename}
      />
      <QuickViewModal
        open={quickView.open}
        fileName={quickView.fileName}
        content={quickView.content}
        truncated={quickView.truncated}
        onClose={() => setQuickView((q) => ({ ...q, open: false }))}
      />

      {/* Ghost de arrastre por puntero (drag & drop interno) */}
      {dragging && (
        <div
          style={{
            position: 'fixed',
            left: ghostPos.x + 12,
            top: ghostPos.y + 12,
            zIndex: 10001,
            pointerEvents: 'none',
            padding: '6px 10px',
            borderRadius: 8,
            border: '1.5px solid var(--border-strong)',
            background: 'var(--surface-1)',
            color: 'var(--text-primary)',
            fontSize: 12,
            fontWeight: 600,
            boxShadow: '2px 2px 0 var(--border-strong)',
          }}
        >
          {dragging.count} elemento{dragging.count !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  )
}

export default SftpPage
