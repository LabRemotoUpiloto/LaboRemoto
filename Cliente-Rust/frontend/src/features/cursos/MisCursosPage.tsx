import { useCallback, useEffect, useState } from 'react';
import { Container, Title, Text, Stack, Group, Paper, Button, Loader, Box, Table, Tooltip } from '@mantine/core';
import { BarChart3, BookOpen, ChevronDown, ChevronRight, Link2, RefreshCw, Users } from 'lucide-react';
import { notifications } from '@mantine/notifications';
import {
  moodleCursosService, etiquetaEstado,
  type EntregasPractica, type MisCursos, type MoodlePractica, type PracticasCurso,
} from './moodleCursos.service';
import { etiquetaEstadoDocente, resumenEntregas, textoNota, yaEntrego } from './entregasStats';
import ResumenGeneralPanel from './ResumenGeneralPanel';

const mensajeDe = (e: any) => e?.message ?? String(e);

/** Cursos del usuario en Moodle y sus prácticas. Docente y estudiante ven lo mismo con distinto detalle. */
export default function MisCursosPage() {
  const [datos, setDatos] = useState<MisCursos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<number | null>(null);
  /** Curso cuya vista general (todas las prácticas × todos los estudiantes) está abierta. */
  const [general, setGeneral] = useState<number | null>(null);
  const [practicas, setPracticas] = useState<Record<number, PracticasCurso | 'cargando' | string>>({});

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      setDatos(await moodleCursosService.misCursos());
    } catch (e: any) {
      setError(mensajeDe(e));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  const alternar = async (cursoId: number) => {
    if (abierto === cursoId) { setAbierto(null); return; }
    setAbierto(cursoId);
    setPracticas((p) => ({ ...p, [cursoId]: 'cargando' }));
    try {
      const r = await moodleCursosService.practicasDeCurso(cursoId);
      setPracticas((p) => ({ ...p, [cursoId]: r }));
    } catch (e: any) {
      setPracticas((p) => ({ ...p, [cursoId]: mensajeDe(e) }));
      notifications.show({ title: 'No se pudieron cargar las prácticas', message: mensajeDe(e), color: 'red' });
    }
  };

  return (
    <Container size="md" py="xl" px="xl" h="100%" style={{ overflow: 'auto' }}>
      <Stack gap="lg">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Group gap={12} align="center" wrap="nowrap">
            <BookOpen size={26} style={{ color: 'var(--accent-primary)' }} aria-hidden />
            <div>
              <Title order={1} style={{ fontSize: 26, letterSpacing: '-.02em' }}>Mis cursos</Title>
              <Text size="sm" c="dimmed">Tus cursos de Moodle y las prácticas de laboratorio de cada uno.</Text>
            </div>
          </Group>
          <Button variant="default" size="xs" leftSection={<RefreshCw size={14} aria-hidden />} onClick={() => void cargar()} disabled={cargando}>
            Actualizar
          </Button>
        </Group>

        {cargando ? (
          <Group py={48} justify="center"><Loader size="sm" /><Text size="sm" c="dimmed">Cargando cursos…</Text></Group>
        ) : error ? (
          <Paper p="lg" radius="lg" style={{ border: '1px solid var(--border-subtle)', background: 'var(--background-secondary)' }}>
            <Text size="sm" fw={600}>No se pudieron cargar tus cursos</Text>
            <Text size="sm" c="dimmed" mt={4}>{error}</Text>
          </Paper>
        ) : datos && !datos.enMoodle ? (
          <Paper p="lg" radius="lg" style={{ border: '1px solid var(--border-subtle)', background: 'var(--background-secondary)' }}>
            <Text size="sm" fw={600}>Aún no tienes cuenta en Moodle</Text>
            <Text size="sm" c="dimmed" mt={4}>Tu usuario institucional todavía no aparece en Moodle, por eso no hay cursos para mostrar.</Text>
          </Paper>
        ) : datos && datos.cursos.length === 0 ? (
          <Text size="sm" c="dimmed" ta="center" py={48}>No estás matriculado en ningún curso.</Text>
        ) : (
          <Stack gap="sm">
            {datos?.cursos.map((c) => {
              const estado = practicas[c.id];
              return (
                <Paper key={c.id} radius="lg" style={{ border: '1px solid var(--border-subtle)', background: 'var(--background-secondary)', overflow: 'hidden' }}>
                  <Group justify="space-between" wrap="nowrap" px="lg" py="md">
                    <div style={{ minWidth: 0 }}>
                      <Text size="sm" fw={600} truncate>{c.nombre}</Text>
                      <Text size="xs" c="dimmed">{c.corto} · {c.rol === 'docente' ? 'Docente' : 'Estudiante'}</Text>
                    </div>
                    <Group gap="xs" wrap="nowrap">
                      {c.rol === 'docente' && (
                        <Button
                          variant="light"
                          size="xs"
                          leftSection={<BarChart3 size={14} aria-hidden />}
                          aria-expanded={general === c.id}
                          onClick={() => setGeneral(general === c.id ? null : c.id)}
                        >
                          {general === c.id ? 'Ocultar general' : 'General'}
                        </Button>
                      )}
                      <Button variant="subtle" size="xs" onClick={() => void alternar(c.id)} aria-expanded={abierto === c.id}>
                        {abierto === c.id ? 'Ocultar prácticas' : 'Ver prácticas'}
                      </Button>
                    </Group>
                  </Group>
                  {c.rol === 'docente' && general === c.id && (
                    <Box px="lg" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                      <ResumenGeneralPanel cursoId={c.id} />
                    </Box>
                  )}
                  {abierto === c.id && (
                    <Box px="lg" pb="md" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                      {estado === 'cargando' || estado === undefined ? (
                        <Group py="md"><Loader size="xs" /><Text size="sm" c="dimmed">Cargando prácticas…</Text></Group>
                      ) : typeof estado === 'string' ? (
                        <Text size="sm" c="dimmed" py="md">{estado}</Text>
                      ) : estado.practicas.length === 0 ? (
                        <Text size="sm" c="dimmed" py="md">
                          Este curso aún no tiene prácticas de laboratorio.
                          {estado.curso.rol === 'docente' && ' Crea una tarea en Moodle y escribe `labo:` seguido del id de la práctica en su «ID number».'}
                        </Text>
                      ) : (
                        <Stack gap={0}>
                          {estado.practicas.map((p, i) => (
                            <FilaPractica key={p.cmid} p={p} cursoId={c.id} docente={estado.curso.rol === 'docente'} ultima={i === estado.practicas.length - 1} />
                          ))}
                        </Stack>
                      )}
                    </Box>
                  )}
                </Paper>
              );
            })}
          </Stack>
        )}
      </Stack>
    </Container>
  );
}

async function copiarEnlace(practica: string) {
  try {
    const enlace = await moodleCursosService.enlacePractica(practica);
    await navigator.clipboard.writeText(enlace);
    notifications.show({ title: 'Enlace copiado', message: 'Pégalo en la descripción de la tarea de Moodle (como enlace o en el texto).', color: 'green' });
  } catch (e) {
    notifications.show({ title: 'No se pudo copiar el enlace', message: mensajeDe(e), color: 'red' });
  }
}

function fechaCorta(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('es-CO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/** Lo que ve el docente de una práctica: quién la entregó, en qué estado está y con qué nota. Se carga al abrirla. */
function EntregasPanel({ cursoId, cmid, refrescar }: { cursoId: number; cmid: number; refrescar: number }) {
  const [datos, setDatos] = useState<EntregasPractica | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let activo = true;
    setError(null);
    moodleCursosService.entregasPractica(cursoId, cmid)
      .then((r) => { if (activo) setDatos(r); })
      .catch((e: any) => { if (activo) setError(mensajeDe(e)); });
    return () => { activo = false; };
  }, [cursoId, cmid, refrescar]);

  if (error) return <Text size="sm" c="dimmed" py="xs">{error}</Text>;
  if (!datos) return <Group py="xs"><Loader size="xs" /><Text size="sm" c="dimmed">Cargando estudiantes…</Text></Group>;
  if (datos.estudiantes.length === 0) return <Text size="sm" c="dimmed" py="xs">Este curso no tiene estudiantes matriculados.</Text>;

  const r = resumenEntregas(datos.estudiantes);
  return (
    <Box pb="sm">
      <Text size="xs" c="dimmed" mb={6}>
        {r.enviadas} de {r.total} enviaron{r.porRevisar > 0 ? ` · ${r.porRevisar} por revisar en Moodle` : ''}. La nota final la decides tú en Moodle.
      </Text>
      <Box style={{ overflowX: 'auto' }}>
        {/* Anchos fijos para que las columnas queden alineadas entre las tablas de distintas prácticas. */}
        <Table verticalSpacing="xs" horizontalSpacing="md" highlightOnHover={false} style={{ tableLayout: 'fixed', minWidth: 560 }}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th style={{ width: '36%' }}>Estudiante</Table.Th>
              <Table.Th style={{ width: '24%' }}>Estado</Table.Th>
              <Table.Th style={{ width: '12%' }}>Nota</Table.Th>
              <Table.Th style={{ width: '28%' }}>Última actualización</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {datos.estudiantes.map((e) => (
              <Table.Tr key={e.usuario}>
                <Table.Td>
                  <Text size="sm" fw={500}>{e.nombre}</Text>
                  {e.nombre !== e.usuario && <Text size="xs" c="dimmed">{e.usuario}</Text>}
                </Table.Td>
                <Table.Td>
                  <Text size="sm" c={yaEntrego(e) ? undefined : 'dimmed'}>{etiquetaEstadoDocente(e)}</Text>
                </Table.Td>
                <Table.Td><Text size="sm">{textoNota(e.nota)}</Text></Table.Td>
                <Table.Td><Text size="sm" c="dimmed">{fechaCorta(e.fecha)}</Text></Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Box>
    </Box>
  );
}

function FilaPractica({ p, cursoId, docente, ultima }: { p: MoodlePractica; cursoId: number; docente: boolean; ultima: boolean }) {
  const [verEstudiantes, setVerEstudiantes] = useState(false);
  const [refrescar, setRefrescar] = useState(0);
  return (
    <Box style={{ borderBottom: ultima ? 'none' : '1px solid var(--border-subtle)' }}>
      <Group justify="space-between" wrap="nowrap" py="sm">
        <div style={{ minWidth: 0 }}>
          <Text size="sm" fw={500} truncate>{p.nombre}</Text>
          <Text size="xs" c="dimmed">Práctica {p.practica}</Text>
        </div>
        {docente ? (
          <Group gap="sm" wrap="nowrap">
            {!p.flujoRevision && (
              <Text size="xs" c="dimmed" ta="right" maw={220}>
                Activa el «flujo de calificación» en la tarea de Moodle para recibir resultados.
              </Text>
            )}
            <Button
              size="xs"
              variant="subtle"
              leftSection={<Users size={14} />}
              rightSection={verEstudiantes ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              aria-expanded={verEstudiantes}
              onClick={() => { setVerEstudiantes((v) => !v); setRefrescar((n) => n + 1); }}
            >
              Estudiantes
            </Button>
            <Tooltip label="Copiar el enlace para pegarlo en la tarea de Moodle: abre la práctica en la app" withArrow>
              <Button size="xs" variant="light" leftSection={<Link2 size={14} />} onClick={() => void copiarEnlace(p.practica)}>Copiar enlace</Button>
            </Tooltip>
          </Group>
        ) : (
          <Text size="sm" c="dimmed" style={{ whiteSpace: 'nowrap' }}>{etiquetaEstado(p.estado)}</Text>
        )}
      </Group>
      {docente && verEstudiantes && <EntregasPanel cursoId={cursoId} cmid={p.cmid} refrescar={refrescar} />}
    </Box>
  );
}
