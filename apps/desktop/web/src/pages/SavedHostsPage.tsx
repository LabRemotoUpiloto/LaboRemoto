import React, { useEffect, useRef, useState } from 'react'
import { listHostEntries, deleteHostFile } from '../api/storage'
import './SavedHostsPage.css'
import { useLoading } from '../contexts/LoadingContext'
import SweetAlert from '../components/modals/SweetAlert'
import { useToasts } from '../contexts/ToastContext'
import DotsVerticalIcon from '../components/icons/DotsVerticalIcon'

type HostEntry = { file: string; payload: { host: string; port: number | string; user?: string; password?: string; name?: string } }

interface SavedHostsPageProps {
  onConnect?: (host: string, port: number | string, user?: string, password?: string) => Promise<void>;
  onEdit?: (hostData: HostEntry['payload'], originalFile: string) => void;
}

export default function SavedHostsPage({ onConnect, onEdit }: SavedHostsPageProps) {
  const [entries, setEntries] = useState<HostEntry[]>([])
  const [loadingLocal, setLoadingLocal] = useState(false)
  const [loadingLabelLocal, setLoadingLabelLocal] = useState<string | null>(null)
  const { setLoading } = useLoading()
  const { push } = useToasts()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [toDeleteFile, setToDeleteFile] = useState<string | null>(null)
  const [activeMenu, setActiveMenu] = useState<string | null>(null)
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

  // Cerrar menú al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (activeMenu && !(e.target as HTMLElement).closest('.host-card-menu')) {
        setActiveMenu(null)
      }
    }
    
    if (activeMenu) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [activeMenu])

  return (
    <div className="page-content saved-hosts-page">
      {/* Header con título y descripción */}
      <div className="saved-hosts-page__header">
        <h2 className="page-title">Hosts Guardados</h2>
        <span className="page-separator">•</span>
        <p className="page-description">
          Gestiona y accede rápidamente a tus conexiones SSH guardadas.
        </p>
      </div>

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
              
              {/* Botón de menú de tres puntos */}
              <div className="host-card-menu">
                <button 
                  className="host-menu-btn"
                  onClick={(e) => {
                    e.stopPropagation()
                    setActiveMenu(activeMenu === it.file ? null : it.file)
                  }}
                  aria-label="Más opciones"
                  aria-expanded={activeMenu === it.file}
                >
                  <DotsVerticalIcon size={18} />
                </button>
                
                {activeMenu === it.file && (
                  <div className="host-dropdown-menu">
                    <button 
                      className="host-dropdown-item host-dropdown-item-edit"
                      onClick={(e) => {
                        e.stopPropagation()
                        setActiveMenu(null)
                        if (onEdit) {
                          onEdit(it.payload, it.file)
                        } else {
                          push({ type: 'info', message: 'Función de edición no disponible' })
                        }
                      }}
                    >
                      <span className="host-dropdown-icon">✏️</span>
                      <span>Editar</span>
                    </button>
                    <button 
                      className="host-dropdown-item host-dropdown-item-delete"
                      onClick={(e) => {
                        e.stopPropagation()
                        setActiveMenu(null)
                        setToDeleteFile(it.file)
                        setConfirmOpen(true)
                      }}
                    >
                      <span className="host-dropdown-icon">🗑️</span>
                      <span>Eliminar</span>
                    </button>
                  </div>
                )}
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
      <SweetAlert 
        open={confirmOpen}
        type="warning"
        title="¿Eliminar host?" 
        message="¿Estás seguro de que deseas eliminar este host guardado? Esta acción no se puede deshacer." 
        confirmText="Eliminar"
        cancelText="Cancelar"
        showCancel={true}
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
