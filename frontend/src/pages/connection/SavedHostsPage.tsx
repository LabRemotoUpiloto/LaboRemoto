import React, { useEffect, useRef, useState } from 'react'
import { listHostEntries, deleteHostFile } from '../../api/storage'
import { useLoading } from '../../contexts/LoadingContext'
import { useToasts } from '../../contexts/ToastContext'
import { Card, Text, Badge, ActionIcon, Menu, Button, Center, Stack } from '@mantine/core'
import { modals } from '@mantine/modals'
import DotsVerticalIcon from '../../components/icons/DotsVerticalIcon'
import { sshConnect } from '../../services/ssh.service'
import { isRaspberryPi4, getDeviceLabel } from '../../constants/devices'

type HostEntry = { file: string; payload: { host: string; port: number | string; user?: string; password?: string; name?: string } }

interface SavedHostsPageProps {
  onConnected?: (sessionId: string, label: string) => void;
  onEdit?: (hostData: HostEntry['payload'], originalFile: string) => void;
}

export default function SavedHostsPage({ onConnected, onEdit }: SavedHostsPageProps) {
  const [entries, setEntries] = useState<HostEntry[]>([])
  const [loadingLocal, setLoadingLocal] = useState(false)
  const { setLoading } = useLoading()
  const { push } = useToasts()
  const [connectionAbortController, setConnectionAbortController] = useState<AbortController | null>(null)
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

  const connectToHost = async (host: string, port: number | string, user?: string, password?: string) => {
    if (loadingLocal) return
    const portNum = Number(port)
    const userName = user || ''
    const pwd = password || ''
    const displayName = getDeviceLabel(host, portNum)
    const loadingMessage = `Conectando a ${displayName}...`

    const { listen } = await import('@tauri-apps/api/event')
    let unlistenSuccess: any = null
    let unlistenError: any = null
    const abortController = new AbortController()
    setConnectionAbortController(abortController)

    const connectionPromise = new Promise<string>((resolve, reject) => {
      listen<any>('ssh_connected', (event) => {
        if (event.payload?.id && !abortController.signal.aborted) resolve(event.payload.id)
      }).then(u => { unlistenSuccess = u }).catch(reject)
      listen<any>('ssh_connect_error', (event) => {
        if (event.payload?.id && !abortController.signal.aborted) reject(new Error(event.payload.error || 'Error conectando'))
      }).then(u => { unlistenError = u }).catch(reject)
    })

    const cancelConnection = () => {
      abortController.abort()
      unlistenSuccess?.(); unlistenError?.()
      setLoading(false, null, null)
      setLoadingLocal(false)
      setConnectionAbortController(null)
      push({ type: 'info', message: 'Conexión cancelada' })
    }

    try {
      setLoading(true, loadingMessage, cancelConnection)
      setLoadingLocal(true)
      const timeoutId = setTimeout(() => {
        if (!abortController.signal.aborted) { cancelConnection(); push({ type: 'error', message: 'Tiempo de espera agotado (30s)' }) }
      }, 30000)
      await new Promise(r => setTimeout(r, 100))
      await sshConnect({ host, port: portNum, user: userName, password: pwd, cols: 80, rows: 24 })
      if (abortController.signal.aborted) { clearTimeout(timeoutId); unlistenSuccess?.(); unlistenError?.(); return }
      const sessionId = await connectionPromise
      clearTimeout(timeoutId); unlistenSuccess?.(); unlistenError?.()
      const label = `${userName}@${displayName}`
      onConnected?.(sessionId, label)
      push({ type: 'success', message: `Conectado a ${displayName}` })
      setLoading(false, null, null)
      setLoadingLocal(false)
      setConnectionAbortController(null)
    } catch (e: any) {
      push({ type: 'error', message: e?.message || 'Error conectando' })
      setLoading(false, null, null)
      setLoadingLocal(false)
      setConnectionAbortController(null)
    }
  }

  const handleDelete = (file: string, hostLabel: string) => {
    modals.openConfirmModal({
      title: '¿Eliminar host?',
      centered: true,
      overlayProps: { blur: 3 },
      children: (
        <Text size="sm" c="dimmed">
          ¿Estás seguro de que deseas eliminar <strong>{hostLabel}</strong>? Esta acción no se puede deshacer.
        </Text>
      ),
      labels: { confirm: 'Eliminar', cancel: 'Cancelar' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        setLoading(true, 'Eliminando...')
        try {
          await deleteHostFile(file)
          setEntries(prev => prev.filter(e => e.file !== file))
          push({ type: 'success', message: 'Host eliminado correctamente' })
        } catch {
          push({ type: 'error', message: 'Error al eliminar el host' })
        } finally {
          setLoading(false, null)
        }
      },
    })
  }

  return (
    <div className="flex flex-col h-full">
      <header className="page-header-integrated">
        <h2 className="page-header-title">Hosts Guardados</h2>
        <div className="page-header-content">
          <p className="page-header-description">Gestiona y accede rápidamente a tus conexiones SSH guardadas.</p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        {entries.length === 0 ? (
          <Center h={300}>
            <Stack align="center" gap="md">
              <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" opacity={0.3}>
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
              <Text c="dimmed" size="sm">No hay hosts guardados</Text>
              <Button
                size="xs" variant="light" color="teal"
                onClick={() => window.dispatchEvent(new CustomEvent('app:open-panel', { detail: 'connect' }))}
              >
                Añadir primer host
              </Button>
            </Stack>
          </Center>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
            {entries.map(it => {
              const displayName = getDeviceLabel(it.payload.host, Number(it.payload.port))
              const hostLabel = `${it.payload.user ?? ''}@${displayName}`
              return (
                <Card
                  key={it.file}
                  withBorder
                  padding="md"
                  radius="md"
                  className="cursor-pointer hover:border-teal-500/40 transition-colors"
                  onClick={() => connectToHost(it.payload.host, it.payload.port, it.payload.user, it.payload.password)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-teal-500/10 border border-teal-500/20 flex items-center justify-center flex-shrink-0">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-teal-400">
                          <rect x="2" y="3" width="20" height="14" rx="2" />
                          <line x1="8" y1="21" x2="16" y2="21" />
                          <line x1="12" y1="17" x2="12" y2="21" />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        {it.payload.name && (
                          <Badge size="xs" variant="light" color="teal" mb={4}>{it.payload.name}</Badge>
                        )}
                        <Text size="sm" fw={600} truncate>{displayName}</Text>
                        <Text size="xs" c="dimmed" truncate>{hostLabel}</Text>
                      </div>
                    </div>

                    <Menu shadow="md" width={160} position="bottom-end" withinPortal>
                      <Menu.Target>
                        <ActionIcon
                          variant="subtle" color="gray" size="sm"
                          onClick={e => e.stopPropagation()}
                          aria-label="Más opciones"
                        >
                          <DotsVerticalIcon size={16} />
                        </ActionIcon>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Item
                          leftSection={
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          }
                          onClick={e => { e.stopPropagation(); onEdit?.(it.payload, it.file) }}
                        >
                          Editar
                        </Menu.Item>
                        <Menu.Item
                          color="red"
                          leftSection={
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                          }
                          onClick={e => { e.stopPropagation(); handleDelete(it.file, hostLabel) }}
                        >
                          Eliminar
                        </Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  </div>

                  <Button
                    mt="md" size="xs" variant="light" color="teal" fullWidth
                    disabled={loadingLocal}
                    onClick={e => { e.stopPropagation(); connectToHost(it.payload.host, it.payload.port, it.payload.user, it.payload.password) }}
                  >
                    Conectar
                  </Button>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
