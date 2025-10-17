import React, { useEffect, useRef, useState } from 'react'
import { listHostEntries, deleteHostFile } from '../api/storage'
import './SavedHostsPage.css'
import { useLoading } from '../contexts/LoadingContext'
import ConfirmModal from '../components/ConfirmModal'
import { useToasts } from '../contexts/ToastContext'

type HostEntry = { file: string; payload: { host: string; port: number | string; user?: string; password?: string } }

export default function SavedHostsPage({ onConnect }: { onConnect?: (host: string, port: number | string, user?: string, password?: string) => Promise<void> }) {
  const [entries, setEntries] = useState<HostEntry[]>([])
  const [loadingLocal, setLoadingLocal] = useState(false)
  const [loadingLabelLocal, setLoadingLabelLocal] = useState<string | null>(null)
  const { setLoading } = useLoading()
  const { push } = useToasts()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [toDeleteFile, setToDeleteFile] = useState<string | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    ;(async () => {
      try {
        const ents = await listHostEntries()
        if (mountedRef.current) setEntries(ents || [])
      } catch (_e) {
        // ignore
      }
    })()
    return () => { mountedRef.current = false }
  }, [])

  return (
    <div className="page-content saved-hosts-page">
      <h2 className="page-title">Hosts Guardados</h2>
      <div className="hosts-grid">
        {entries.map((it) => (
          <article 
            key={it.file} 
            className="host-card"
            role="button"
            tabIndex={0}
            aria-label={`Conectar a ${it.payload.host}`}
            onClick={async () => {
              if (loadingLocal) return
              try {
                setLoading(true, `Conectando ${it.payload.host}...`)
                setLoadingLocal(true)
                if (onConnect) {
                  await onConnect(it.payload.host, it.payload.port, it.payload.user, it.payload.password)
                }
              } catch (e: any) {
                alert('Error: ' + (e?.toString?.() ?? ''))
              } finally {
                setLoading(false, null)
                setLoadingLocal(false)
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                e.currentTarget.click()
              }
            }}
          >
            <div className="host-card-header">
              <div className="host-card-left">
                <div className="host-avatar" aria-hidden="true">🖥️</div>
              </div>
              <div className="host-card-body">
                {it.payload?.name && <span className="host-badge">{it.payload.name}</span>}
                <div className="host-title">{it.payload?.host}</div>
                <div className="host-sub">ssh, {it.payload?.user}@{it.payload?.port}</div>
              </div>
            </div>
            <div className="host-card-actions">
              <button 
                className="btn btn-connect" 
                disabled={loadingLocal}
                aria-label={`Conectar a ${it.payload.host}`}
                onClick={async (e) => { 
                  e.stopPropagation()
                  if (loadingLocal) return
                  try { 
                    setLoading(true, `Conectando ${it.payload.host}...`)
                    setLoadingLocal(true)
                    if (onConnect) await onConnect(it.payload.host, it.payload.port, it.payload.user, it.payload.password)
                  } catch (err: any) { 
                    alert('Error: ' + err?.toString?.())
                  } finally { 
                    setLoading(false, null)
                    setLoadingLocal(false)
                  }
                }}
              >
                Conectar
              </button>
              <button 
                className="btn btn-delete" 
                disabled={loadingLocal}
                aria-label={`Eliminar host ${it.payload.host}`}
                onClick={(e) => { 
                  e.stopPropagation()
                  if (loadingLocal) return
                  setToDeleteFile(it.file)
                  setConfirmOpen(true)
                }}
              >
                Eliminar
              </button>
            </div>
          </article>
        ))}
        {entries.length === 0 && (
          <div className="empty" role="status">
            <div className="empty-title">No hay hosts guardados</div>
            <div className="empty-message">
              Comienza agregando tu primer servidor SSH para acceder rápidamente.
            </div>
          </div>
        )}
      </div>
      <ConfirmModal 
        open={confirmOpen} 
        title="Eliminar host" 
        message="¿Estás seguro de que deseas eliminar este host guardado?" 
        onCancel={() => { 
          setConfirmOpen(false)
          setToDeleteFile(null)
        }} 
        onConfirm={async () => {
          if (!toDeleteFile) return setConfirmOpen(false)
          setConfirmOpen(false)
          setLoading(true, 'Eliminando...')
          try {
            await deleteHostFile(toDeleteFile)
            setEntries(prev => prev.filter(e2 => e2.file !== toDeleteFile))
            push({ type: 'success', message: 'Host eliminado correctamente' })
          } catch (err: any) {
            console.error('deleteHostFile', err)
            push({ type: 'error', message: 'Error al eliminar el host' })
          } finally {
            setLoading(false, null)
            setToDeleteFile(null)
          }
        }} 
      />
    </div>
  )
}
