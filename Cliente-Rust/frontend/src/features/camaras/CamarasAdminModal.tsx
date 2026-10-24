// features/camaras/CamarasAdminModal.tsx — administración de cámaras (solo admin_lab): lista, alta, edición y baja,
// con «Probar conexión» antes de guardar. El broker aplica el cambio en Shinobi, MediaMTX y su registro.
import React, { useCallback, useEffect, useState } from 'react'
import { Modal, Stack, Group, Button, Text, TextInput, PasswordInput, NumberInput, Select, Switch, Loader, Paper, ActionIcon, Box } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { Plus, Pencil, Trash2, Check, X, AlertTriangle } from 'lucide-react'
import {
  camarasAdminService, describirPrueba, etiquetaCamara, soloCambios, textoErrores, RUTAS_RTSP,
  type CamaraAdmin, type CamaraEntrada, type PruebaCamara,
} from './camarasAdmin.service'

const mensajeDe = (e: any) => e?.message ?? String(e)

interface Props {
  opened: boolean
  onClose: () => void
  /** Se llama tras crear/editar/eliminar para que la grilla refresque sin esperar al siguiente sondeo. */
  onCambio?: () => void
}

interface Formulario {
  nombre: string
  host: string
  puerto: number
  usuario: string
  password: string
  rutaTipo: string // preset de RUTAS_RTSP o 'otra'
  rutaOtra: string
  ptz: boolean
  habilitada: boolean
}

const VACIO: Formulario = { nombre: '', host: '', puerto: 554, usuario: 'admin', password: '', rutaTipo: '/h264Preview_01_sub', rutaOtra: '', ptz: false, habilitada: true }

function formDe(c: CamaraAdmin): Formulario {
  const preset = RUTAS_RTSP.find((r) => r.value === c.rtspPath)
  return {
    nombre: c.nombre, host: c.host, puerto: c.puerto, usuario: c.usuario, password: '',
    rutaTipo: preset ? preset.value : 'otra', rutaOtra: preset ? '' : c.rtspPath, ptz: c.ptz, habilitada: c.habilitada,
  }
}

const rutaDe = (f: Formulario) => (f.rutaTipo === 'otra' ? f.rutaOtra.trim() : f.rutaTipo)

function entradaDe(f: Formulario): CamaraEntrada {
  return {
    nombre: f.nombre.trim(), host: f.host.trim(), puerto: f.puerto, usuario: f.usuario.trim(),
    password: f.password || undefined, rtspPath: rutaDe(f), ptz: f.ptz, habilitada: f.habilitada,
  }
}

function Punto({ ok }: { ok: boolean | null }) {
  const color = ok === true ? '#22c55e' : ok === false ? '#ef4444' : '#9ca3af'
  return <span aria-hidden style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 999, background: color, marginRight: 8, flexShrink: 0 }} />
}

function ResultadoPrueba({ prueba }: { prueba: PruebaCamara }) {
  return (
    <Paper p="sm" radius="md" style={{ border: '1px solid var(--border-subtle)', background: 'var(--background-tertiary, var(--background-secondary))' }}>
      <Stack gap={4}>
        {describirPrueba(prueba).map((l, i) => (
          <Group key={i} gap={6} wrap="nowrap" align="flex-start">
            {l.ok === true ? <Check size={14} color="#22c55e" style={{ marginTop: 3, flexShrink: 0 }} aria-hidden /> : l.ok === false ? <X size={14} color="#ef4444" style={{ marginTop: 3, flexShrink: 0 }} aria-hidden /> : <AlertTriangle size={14} color="#9ca3af" style={{ marginTop: 3, flexShrink: 0 }} aria-hidden />}
            <Text size="sm">{l.texto}</Text>
          </Group>
        ))}
      </Stack>
    </Paper>
  )
}

const CamarasAdminModal: React.FC<Props> = ({ opened, onClose, onCambio }) => {
  const [camaras, setCamaras] = useState<CamaraAdmin[]>([])
  const [cargando, setCargando] = useState(false)
  const [errorLista, setErrorLista] = useState<string | null>(null)
  const [editando, setEditando] = useState<CamaraAdmin | 'nueva' | null>(null)
  const [aEliminar, setAEliminar] = useState<CamaraAdmin | null>(null)
  const [eliminando, setEliminando] = useState(false)

  const cargar = useCallback(async () => {
    setCargando(true)
    setErrorLista(null)
    try {
      setCamaras((await camarasAdminService.listar()).camaras)
    } catch (e) {
      setErrorLista(mensajeDe(e))
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    if (opened) { setEditando(null); setAEliminar(null); void cargar() }
  }, [opened, cargar])

  const cerrarForm = (huboCambio: boolean) => {
    setEditando(null)
    if (huboCambio) { void cargar(); onCambio?.() }
  }

  const eliminar = async () => {
    if (!aEliminar) return
    setEliminando(true)
    try {
      await camarasAdminService.eliminar(aEliminar.id)
      notifications.show({ title: 'Cámara eliminada', message: `${aEliminar.nombre} se quitó de Shinobi, MediaMTX y el registro.`, color: 'green' })
      setAEliminar(null)
      void cargar(); onCambio?.()
    } catch (e) {
      notifications.show({ title: 'No se pudo eliminar', message: mensajeDe(e), color: 'red' })
    } finally {
      setEliminando(false)
    }
  }

  return (
    <Modal opened={opened} onClose={onClose} size="xl" title={editando ? (editando === 'nueva' ? 'Nueva cámara' : `Editar ${editando.nombre}`) : 'Administrar cámaras'} centered>
      {editando ? (
        <FormularioCamara
          key={editando === 'nueva' ? 'nueva' : editando.id}
          original={editando === 'nueva' ? null : editando}
          onCancelar={() => cerrarForm(false)}
          onGuardado={() => cerrarForm(true)}
        />
      ) : aEliminar ? (
        <Stack gap="md">
          <Text size="sm">¿Eliminar «{aEliminar.nombre}» ({aEliminar.host})? Se quita de Shinobi, de MediaMTX y del registro. Esta acción no se puede deshacer.</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setAEliminar(null)} disabled={eliminando}>Cancelar</Button>
            <Button color="red" onClick={() => void eliminar()} loading={eliminando}>Eliminar</Button>
          </Group>
        </Stack>
      ) : (
        <Stack gap="md">
          <Group justify="space-between" wrap="nowrap">
            <Text size="sm" c="dimmed">Solo administradores. Las claves se guardan en el servidor y no se pueden volver a ver.</Text>
            <Button leftSection={<Plus size={16} aria-hidden />} onClick={() => setEditando('nueva')}>Nueva cámara</Button>
          </Group>
          {cargando && camaras.length === 0 ? (
            <Group py="xl" justify="center"><Loader size="sm" /><Text size="sm" c="dimmed">Cargando cámaras…</Text></Group>
          ) : errorLista ? (
            <Paper p="md" radius="md" style={{ border: '1px solid var(--border-subtle)' }}>
              <Text size="sm" fw={600}>No se pudieron cargar las cámaras</Text>
              <Text size="sm" c="dimmed" mt={4}>{errorLista}</Text>
              <Button mt="sm" size="xs" variant="default" onClick={() => void cargar()}>Reintentar</Button>
            </Paper>
          ) : camaras.length === 0 ? (
            <Text size="sm" c="dimmed" ta="center" py="xl">Aún no hay cámaras registradas.</Text>
          ) : (
            <Box style={{ border: '1px solid var(--border-subtle)', borderRadius: 12, overflow: 'hidden' }}>
              {camaras.map((c, i) => {
                const et = etiquetaCamara(c)
                return (
                  <Group key={c.id} wrap="nowrap" px="md" py="sm" style={{ borderBottom: i === camaras.length - 1 ? 'none' : '1px solid var(--border-subtle)' }}>
                    <div style={{ flex: 2, minWidth: 0 }}>
                      <Text size="sm" fw={600} truncate>{c.nombre}</Text>
                      <Text size="xs" c="dimmed" truncate>{c.usuario}@{c.host}:{c.puerto}{c.ptz ? ', con PTZ' : ''}</Text>
                    </div>
                    <Group gap={0} wrap="nowrap" style={{ flex: 1.4, minWidth: 0 }}>
                      <Punto ok={et.ok} /><Text size="sm" truncate>{et.texto}</Text>
                    </Group>
                    <Group gap={4} wrap="nowrap">
                      <ActionIcon variant="subtle" aria-label={`Editar ${c.nombre}`} onClick={() => setEditando(c)}><Pencil size={16} /></ActionIcon>
                      <ActionIcon variant="subtle" color="red" aria-label={`Eliminar ${c.nombre}`} onClick={() => setAEliminar(c)}><Trash2 size={16} /></ActionIcon>
                    </Group>
                  </Group>
                )
              })}
            </Box>
          )}
        </Stack>
      )}
    </Modal>
  )
}

// ─── Formulario (alta y edición) ──────────────────────────────────────────────

interface FormProps {
  original: CamaraAdmin | null
  onCancelar: () => void
  onGuardado: () => void
}

function FormularioCamara({ original, onCancelar, onGuardado }: FormProps) {
  const [f, setF] = useState<Formulario>(original ? formDe(original) : VACIO)
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [prueba, setPrueba] = useState<PruebaCamara | null>(null)
  const [probando, setProbando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [pruebaFallida, setPruebaFallida] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  const set = <K extends keyof Formulario>(k: K, v: Formulario[K]) => { setF((p) => ({ ...p, [k]: v })); setPrueba(null); setPruebaFallida(false); setAviso(null) }

  const probar = async () => {
    setProbando(true); setErrores({}); setAviso(null)
    try {
      const r = await camarasAdminService.probar(entradaDe(f), original?.id)
      if (r.resultado === 'invalido') { setErrores(r.errores ?? {}); setPrueba(null) }
      else if (r.prueba) {
        setPrueba(r.prueba)
        // Al dar de alta, si la cámara tiene PTZ se deja marcado (se puede quitar).
        if (!original && r.prueba.ptz === true) setF((p) => ({ ...p, ptz: true }))
      }
    } catch (e) {
      setAviso(mensajeDe(e))
    } finally {
      setProbando(false)
    }
  }

  const guardar = async (forzar = false) => {
    setGuardando(true); setErrores({}); setAviso(null)
    try {
      const entrada: CamaraEntrada = original ? soloCambios(original, { ...entradaDe(f), forzar }) : { ...entradaDe(f), forzar }
      const r = original ? await camarasAdminService.actualizar(original.id, entrada) : await camarasAdminService.crear(entrada)
      if (r.resultado === 'ok') {
        notifications.show({ title: original ? 'Cámara actualizada' : 'Cámara creada', message: `${r.camara?.nombre ?? f.nombre} quedó aplicada en Shinobi y MediaMTX.`, color: 'green' })
        onGuardado()
      } else if (r.resultado === 'invalido' || r.resultado === 'duplicada') {
        setErrores(r.errores ?? {})
        setAviso(textoErrores(r.errores) || 'Revisa los datos')
      } else if (r.resultado === 'prueba_fallida') {
        setPrueba(r.prueba ?? null); setPruebaFallida(true)
      } else {
        setAviso(r.mensaje ?? 'No se pudo guardar')
      }
    } catch (e) {
      setAviso(mensajeDe(e))
    } finally {
      setGuardando(false)
    }
  }

  const listo = f.nombre.trim() && f.host.trim() && f.usuario.trim() && (original || f.password) && (f.rutaTipo !== 'otra' || f.rutaOtra.trim())

  return (
    <Stack gap="sm">
      <TextInput label="Nombre" description="Como se verá en la vigilancia" value={f.nombre} onChange={(e) => set('nombre', e.currentTarget.value)} error={errores.nombre} data-autofocus required />
      <Group grow align="flex-start" wrap="nowrap">
        <TextInput label="Dirección IP" placeholder="172.16.34.20" value={f.host} onChange={(e) => set('host', e.currentTarget.value)} error={errores.host} description="Solo redes privadas del laboratorio" required />
        <NumberInput label="Puerto RTSP" value={f.puerto} onChange={(v) => set('puerto', Number(v) || 554)} min={1} max={65535} error={errores.puerto} allowDecimal={false} clampBehavior="strict" />
      </Group>
      <Group grow align="flex-start" wrap="nowrap">
        <TextInput label="Usuario" value={f.usuario} onChange={(e) => set('usuario', e.currentTarget.value)} error={errores.usuario} required />
        <PasswordInput
          label="Contraseña"
          description={original ? 'Déjala vacía para conservar la actual' : 'Se guarda en el servidor'}
          placeholder={original ? '•••••••• (sin cambios)' : ''}
          value={f.password} onChange={(e) => set('password', e.currentTarget.value)} error={errores.password}
          autoComplete="new-password" required={!original}
        />
      </Group>
      <Select label="Ruta de video" data={RUTAS_RTSP.map((r) => ({ value: r.value, label: r.label }))} value={f.rutaTipo} onChange={(v) => set('rutaTipo', v ?? '/h264Preview_01_sub')} allowDeselect={false} comboboxProps={{ withinPortal: true }} />
      {f.rutaTipo === '/h264Preview_01_main' && (
        <Text size="xs" c="orange">La alta resolución mueve mucho más video por el túnel de internet: puede entrecortar la vista en vivo, sobre todo con varias cámaras. Para la grilla conviene la baja resolución.</Text>
      )}
      {f.rutaTipo === 'otra' && <TextInput label="Ruta RTSP" placeholder="/stream1" value={f.rutaOtra} onChange={(e) => set('rutaOtra', e.currentTarget.value)} error={errores.rtspPath} />}
      <Group gap="xl">
        <Switch label="Control PTZ (mover la cámara)" checked={f.ptz} onChange={(e) => set('ptz', e.currentTarget.checked)} />
        <Switch label="Habilitada" checked={f.habilitada} onChange={(e) => set('habilitada', e.currentTarget.checked)} />
      </Group>

      {prueba && <ResultadoPrueba prueba={prueba} />}
      {pruebaFallida && <Text size="sm" c="red">La prueba de conexión falló. Puedes corregir los datos, o guardarla de todos modos si sabes que es correcta (por ejemplo, si la cámara está apagada ahora).</Text>}
      {aviso && <Text size="sm" c="red">{aviso}</Text>}

      <Group justify="space-between" mt="xs">
        <Button variant="default" onClick={() => void probar()} loading={probando} disabled={!listo || guardando}>Probar conexión</Button>
        <Group gap="sm">
          <Button variant="subtle" onClick={onCancelar} disabled={guardando}>Cancelar</Button>
          {pruebaFallida && <Button variant="default" color="red" onClick={() => void guardar(true)} loading={guardando}>Guardar de todos modos</Button>}
          <Button onClick={() => void guardar(false)} loading={guardando} disabled={!listo || probando}>{original ? 'Guardar cambios' : 'Crear cámara'}</Button>
        </Group>
      </Group>
    </Stack>
  )
}

export default CamarasAdminModal
