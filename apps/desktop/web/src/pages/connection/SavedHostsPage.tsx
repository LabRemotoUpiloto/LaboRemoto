import React, { useEffect, useRef, useState } from 'react'
import { listHostEntries, deleteHostFile } from '../../api/storage'
import './SavedHostsPage.css'
import { useLoading } from '../../contexts/LoadingContext'
import SweetAlert from '../../components/modals/SweetAlert'
import { useToasts } from '../../contexts/ToastContext'
import DotsVerticalIcon from '../../components/icons/DotsVerticalIcon'

type HostEntry = { file: string; payload: { host: string; port: number | string; user?: string; password?: string; name?: string } }

interface SavedHostsPageProps {
  onConnected?: (sessionId: string, label: string) => void;
  onEdit?: (hostData: HostEntry['payload'], originalFile: string) => void;
}

export default function SavedHostsPage({ onConnected, onEdit }: SavedHostsPageProps) {
  const [entries, setEntries] = useState<HostEntry[]>([])
  const [loadingLocal, setLoadingLocal] = useState(false)
  const [loadingLabelLocal, setLoadingLabelLocal] = useState<string | null>(null)
  const { setLoading } = useLoading()
  const { push } = useToasts()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [toDeleteFile, setToDeleteFile] = useState<string | null>(null)
  const [activeMenu, setActiveMenu] = useState<string | null>(null)
  const mountedRef = useRef(true)
  const [connectionAbortController, setConnectionAbortController] = useState<AbortController | null>(null)

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

  // Función para conectar con soporte de eventos
  const connectToHost = async (host: string, port: number | string, user?: string, password?: string) => {
    if (loadingLocal) return;
    
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const { listen } = await import('@tauri-apps/api/event');
      
      const portNum = Number(port);
      const userName = user || '';
      const pwd = password || '';
      
      // Mensaje personalizado para Raspberry Pi
      const isRaspberryPi = host === '200.115.181.211' && portNum === 9000;
      const displayName = isRaspberryPi ? 'Raspberry Pi 4' : host;
      const loadingMessage = isRaspberryPi ? 'Conectando a Raspberry Pi 4...' : `Conectando a ${host}...`;
      
      let unlistenSuccess: any = null;
      let unlistenError: any = null;
      const abortController = new AbortController();
      setConnectionAbortController(abortController);
      
      // Configurar listeners
      const connectionPromise = new Promise<string>((resolve, reject) => {
        listen<any>('ssh_connected', (event) => {
          if (event.payload?.id && !abortController.signal.aborted) {
            resolve(event.payload.id);
          }
        }).then((unlisten) => {
          unlistenSuccess = unlisten;
        }).catch(reject);
        
        listen<any>('ssh_connect_error', (event) => {
          if (event.payload?.id && !abortController.signal.aborted) {
            reject(new Error(event.payload.error || 'Error conectando'));
          }
        }).then((unlisten) => {
          unlistenError = unlisten;
        }).catch(reject);
      });
      
      // Función para cancelar
      const cancelConnection = () => {
        abortController.abort();
        if (unlistenSuccess) unlistenSuccess();
        if (unlistenError) unlistenError();
        setLoading(false, null, null);
        setLoadingLocal(false);
        setConnectionAbortController(null);
        push({ type: 'info', message: 'Conexión cancelada' });
      };
      
      // Activar loader con botón de cancelar
      setLoading(true, loadingMessage, cancelConnection);
      setLoadingLocal(true);
      
      // Timeout
      const timeoutId = setTimeout(() => {
        if (!abortController.signal.aborted) {
          cancelConnection();
          push({ type: 'error', message: 'Tiempo de espera agotado (30s)' });
        }
      }, 30000);
      
      // Delay para listeners
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Invocar conexión
      await invoke<string>('ssh_connect', {
        host,
        port: portNum,
        user: userName,
        password: pwd,
        cols: 80,
        rows: 24,
      });
      
      // Verificar si fue cancelado
      if (abortController.signal.aborted) {
        clearTimeout(timeoutId);
        if (unlistenSuccess) unlistenSuccess();
        if (unlistenError) unlistenError();
        return;
      }
      
      // Esperar resultado
      const sessionId = await connectionPromise;
      
      // Limpiar
      clearTimeout(timeoutId);
      if (unlistenSuccess) unlistenSuccess();
      if (unlistenError) unlistenError();
      
      // Notificar éxito
      const label = isRaspberryPi ? `${userName}@Raspberry Pi 4` : `${userName}@${host}`;
      if (onConnected) {
        onConnected(sessionId, label);
      }
      
      push({ type: 'success', message: `Conectado a ${displayName}` });
      setLoading(false, null, null);
      setLoadingLocal(false);
      setConnectionAbortController(null);
      
    } catch (e: any) {
      const errorMsg = e?.message || e?.toString?.() || 'Error conectando';
      push({ type: 'error', message: errorMsg });
      setLoading(false, null, null);
      setLoadingLocal(false);
      setConnectionAbortController(null);
    }
  };

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
    <div className="saved-hosts-page">
      {/* Header con título y descripción - Doble Header Minimalista */}
      <header className="page-header-integrated">
        <h2 className="page-header-title">Hosts Guardados</h2>
        <div className="page-header-content">
          <p className="page-header-description">
            Gestiona y accede rápidamente a tus conexiones SSH guardadas.
          </p>
        </div>
      </header>

      <div className="hosts-grid">
        {entries.map((it) => (
          <article 
            key={it.file} 
            className={`host-card ${activeMenu === it.file ? 'host-card-active' : ''}`}
            role="button"
            tabIndex={0}
            aria-label={`Conectar a ${it.payload.host}`}
            onClick={async () => {
              await connectToHost(it.payload.host, it.payload.port, it.payload.user, it.payload.password);
            }}
          >
            <div className="host-card-header">
              <div className="host-card-left">
                <div className="host-avatar" aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="3" width="20" height="14" rx="2" />
                    <line x1="8" y1="21" x2="16" y2="21" />
                    <line x1="12" y1="17" x2="12" y2="21" />
                  </svg>
                </div>
              </div>
              <div className="host-card-body">
                {it.payload?.name && <span className="host-badge">{it.payload.name}</span>}
                <div className="host-title">{it.payload?.host}</div>
                <div className="host-sub">{it.payload?.user}@{it.payload?.host}:{it.payload?.port}</div>
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
                      <span className="host-dropdown-icon">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </span>
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
                      <span className="host-dropdown-icon">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          <line x1="10" y1="11" x2="10" y2="17" />
                          <line x1="14" y1="11" x2="14" y2="17" />
                        </svg>
                      </span>
                      <span>Eliminar</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="host-card-divider" />
            <div className="host-card-actions">
              <button 
                className="btn-connect" 
                disabled={loadingLocal}
                aria-label={`Conectar a ${it.payload.host}`}
                onClick={async (e) => { 
                  e.stopPropagation();
                  await connectToHost(it.payload.host, it.payload.port, it.payload.user, it.payload.password);
                }}
              >
                Conectar
              </button>
            </div>
          </article>
        ))}
        {entries.length === 0 && (
          <div className="hosts-empty-state" role="status">
            <div className="hosts-empty-icon" aria-hidden="true">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
                <path d="M12 7v6M9 10h6" opacity="0.5" />
              </svg>
            </div>
            <h3 className="hosts-empty-title">No hay hosts guardados</h3>
            <p className="hosts-empty-message">
              Comienza agregando tu primer servidor SSH para acceder rápidamente a tus equipos desde cualquier lugar.
            </p>
            <button 
              className="btn-add-first-host"
              onClick={() => {
                const event = new CustomEvent('app:open-panel', { detail: 'connect' });
                window.dispatchEvent(event);
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Añadir host
            </button>
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
          } catch {
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
