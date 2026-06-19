import React, { useEffect, useRef, useState } from 'react'
import { listHostEntries, deleteHostFile } from '../../services/storage.service'
import { useLoading } from '../../contexts/LoadingContext'
import { useToasts } from '../../contexts/ToastContext'
import { Card, Text, Badge, ActionIcon, Menu, Button, Box, Container, SimpleGrid, Stack, Title, Loader, Tooltip } from '@mantine/core'
import { modals } from '@mantine/modals'
import { Monitor, MoreVertical, Pencil, Trash2, Plus, Server, Cpu, ArrowRight } from 'lucide-react'
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

    const unlistenRef = { success: null as (() => void) | null, error: null as (() => void) | null }
    const abortController = new AbortController()

    const cleanup = () => {
      unlistenRef.success?.()
      unlistenRef.error?.()
      unlistenRef.success = null
      unlistenRef.error = null
    }

    const cancelConnection = () => {
      abortController.abort()
      cleanup()
      setLoading(false, null, null)
      setLoadingLocal(false)
      push({ type: 'info', message: 'Conexión cancelada' })
    }

    const connectionPromise = new Promise<string>((resolve, reject) => {
      listen<any>('ssh_connected', (event) => {
        if (event.payload?.id && !abortController.signal.aborted) resolve(event.payload.id)
      }).then(u => { unlistenRef.success = u }).catch(reject)
      listen<any>('ssh_connect_error', (event) => {
        if (!abortController.signal.aborted) reject(new Error(event.payload?.error || 'Error conectando'))
      }).then(u => { unlistenRef.error = u }).catch(reject)
    })

    let timeoutId: ReturnType<typeof setTimeout> | null = null

    try {
      setLoading(true, loadingMessage, cancelConnection)
      setLoadingLocal(true)

      timeoutId = setTimeout(() => {
        if (!abortController.signal.aborted) {
          cancelConnection()
          push({ type: 'error', message: 'Tiempo de espera agotado (30s)' })
        }
      }, 30000)

      await new Promise(r => setTimeout(r, 100))
      await sshConnect({ host, port: portNum, user: userName, password: pwd, cols: 80, rows: 24 })

      if (abortController.signal.aborted) {
        if (timeoutId) clearTimeout(timeoutId)
        cleanup()
        return
      }

      const sessionId = await connectionPromise
      if (timeoutId) clearTimeout(timeoutId)
      cleanup()
      const label = `${userName}@${displayName}`
      onConnected?.(sessionId, label)
      push({ type: 'success', message: `Conectado a ${displayName}` })
      setLoading(false, null, null)
      setLoadingLocal(false)
    } catch (e: any) {
      if (timeoutId) clearTimeout(timeoutId)
      cleanup()
      if (!abortController.signal.aborted) {
        push({ type: 'error', message: e?.message || 'Error conectando' })
        setLoading(false, null, null)
        setLoadingLocal(false)
      }
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

  const getHostIcon = (host: string, port: number | string) => {
    if (isRaspberryPi4(host, Number(port))) return Cpu
    return Server
  }

  return (
    <Box w="100%" h="100%" style={{ overflow: 'auto' }}>
      <Container size="lg" py="xl" px="xl">
        <Stack gap="xl">
          <Stack gap="sm">
            <Title order={1}>Hosts Guardados</Title>
            <Text size="md" c="dimmed" maw={580}>
              Gestiona y accede rápidamente a tus conexiones SSH guardadas.
            </Text>
          </Stack>

          {entries.length === 0 ? (
            <Box py={80}>
              <Stack align="center" gap="md">
                <div
                  className="flex items-center justify-center w-16 h-16 rounded-2xl"
                  style={{ backgroundColor: 'color-mix(in srgb, var(--accent-primary) 10%, transparent)' }}
                >
                  <Monitor size={32} style={{ color: 'var(--accent-primary)', opacity: 0.5 }} />
                </div>
                <Stack align="center" gap={4}>
                  <Text fw={500}>No hay hosts guardados</Text>
                  <Text c="dimmed" size="sm">Guarda un host desde la página de conexión para verlo aquí</Text>
                </Stack>
                <Button
                  size="sm" variant="light"
                  leftSection={<Plus size={16} />}
                  onClick={() => window.dispatchEvent(new CustomEvent('app:open-panel', { detail: 'connect' }))}
                >
                  Añadir primer host
                </Button>
              </Stack>
            </Box>
          ) : (
            <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
              {entries.map(it => {
                const portNum = Number(it.payload.port)
                const displayName = getDeviceLabel(it.payload.host, portNum)
                const hostLabel = `${it.payload.user ?? ''}@${displayName}`
                const isKnown = isRaspberryPi4(it.payload.host, portNum)
                const IconComponent = getHostIcon(it.payload.host, it.payload.port)

                return (
                  <Card
                    key={it.file}
                    withBorder
                    padding="lg"
                    radius="md"
                    className="group cursor-pointer"
                    style={{ transition: 'all 0.2s ease' }}
                    onClick={() => connectToHost(it.payload.host, it.payload.port, it.payload.user, it.payload.password)}
                  >
                    <Stack gap="md">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className="flex items-center justify-center w-10 h-10 rounded-lg shrink-0"
                            style={{
                              backgroundColor: 'color-mix(in srgb, var(--accent-primary) 10%, transparent)',
                              color: 'var(--accent-primary)',
                            }}
                          >
                            <IconComponent size={20} />
                          </div>
                          <div className="min-w-0">
                            <Text size="sm" fw={600} truncate>{it.payload.name || displayName}</Text>
                            {it.payload.name && (
                              <Text size="xs" c="dimmed" fw={500} style={{ marginTop: -2 }}>{displayName}</Text>
                            )}
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <Text size="xs" c="dimmed" truncate>
                                {it.payload.user && (
                                  <span style={{ color: 'var(--accent-primary)' }}>{it.payload.user}@</span>
                                )}
                                {it.payload.host}
                                {portNum !== 22 && `:${portNum}`}
                              </Text>
                            </div>
                          </div>
                        </div>

                        <Menu shadow="md" width={160} position="bottom-end" withinPortal>
                          <Menu.Target>
                            <ActionIcon
                              variant="subtle" color="gray" size="sm"
                              onClick={e => e.stopPropagation()}
                              aria-label="Más opciones"
                            >
                              <MoreVertical size={16} />
                            </ActionIcon>
                          </Menu.Target>
                          <Menu.Dropdown>
                            <Menu.Item
                              leftSection={<Pencil size={14} />}
                              onClick={e => { e.stopPropagation(); onEdit?.(it.payload, it.file) }}
                            >
                              Editar
                            </Menu.Item>
                            <Menu.Item
                              color="red"
                              leftSection={<Trash2 size={14} />}
                              onClick={e => { e.stopPropagation(); handleDelete(it.file, hostLabel) }}
                            >
                              Eliminar
                            </Menu.Item>
                          </Menu.Dropdown>
                        </Menu>
                      </div>

                      <Button
                        size="xs" variant="light" fullWidth
                        disabled={loadingLocal}
                        rightSection={<ArrowRight size={14} />}
                        onClick={e => { e.stopPropagation(); connectToHost(it.payload.host, it.payload.port, it.payload.user, it.payload.password) }}
                      >
                        Conectar
                      </Button>
                    </Stack>
                  </Card>
                )
              })}
            </SimpleGrid>
          )}
        </Stack>
      </Container>
    </Box>
  )
}
