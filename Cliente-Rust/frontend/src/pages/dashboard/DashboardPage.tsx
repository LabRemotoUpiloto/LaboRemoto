// pages/dashboard/DashboardPage.tsx — actividad del laboratorio para el
// personal de supervisión (jefe, coordinador, laboratorista, admin). Los datos
// salen del registro central de sesiones del broker (ver cmd::sesiones); en
// Fase 1 todos ven el laboratorio completo, sin filtro por curso/grupo.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActionIcon, Box, Group, Loader, Paper, SegmentedControl, SimpleGrid, Stack, Table, Text, TextInput, Title, Tooltip, UnstyledButton } from '@mantine/core';
import { Activity, RefreshCw, Search, X } from 'lucide-react';
import { sesionesService, type ResumenSesiones, type SesionPractica } from '../../services/sesiones.service';
import SesionesMapa from './SesionesMapa';
import {
  conteoPorPractica, detalleUbicacion, duracionMs, esActiva, formatoDuracion, formatoFecha, nombreEstudiante, nombrePractica,
  porEstudiante, porUbicacion, resumenGeneral, sesionesPorDia, ubicacion,
} from './dashboardStats';

const REFRESCO_MS = 30_000;
const PERIODOS = [
  { value: '7', label: '7 días' },
  { value: '30', label: '30 días' },
  { value: '90', label: '90 días' },
];

const panel: React.CSSProperties = { background: 'var(--background-secondary)', border: '1px solid var(--border-subtle)' };

const Seccion: React.FC<{ titulo: string; subtitulo?: string; children: React.ReactNode }> = ({ titulo, subtitulo, children }) => (
  <Paper radius="lg" p="lg" style={panel}>
    <Stack gap="md">
      <div>
        <Text fw={700}>{titulo}</Text>
        {subtitulo && <Text size="xs" c="dimmed">{subtitulo}</Text>}
      </div>
      {children}
    </Stack>
  </Paper>
);

const Dato: React.FC<{ etiqueta: string; valor: string | number; destacado?: boolean; texto?: boolean }> = ({ etiqueta, valor, destacado, texto }) => (
  <Paper radius="lg" p="md" style={panel}>
    <Text size="xs" c="dimmed" tt="uppercase" fw={600} style={{ letterSpacing: '.05em' }}>{etiqueta}</Text>
    <Text
      fw={800}
      lineClamp={texto ? 2 : 1}
      title={String(valor)}
      style={{ fontSize: texto ? 15 : 24, lineHeight: texto ? 1.3 : undefined, color: destacado ? 'var(--accent-primary)' : undefined }}
    >
      {valor}
    </Text>
  </Paper>
);

const Leyenda: React.FC<{ color: string; punteada?: boolean; children: React.ReactNode }> = ({ color, punteada, children }) => (
  <Group gap={6}>
    <Box
      style={punteada
        ? { width: 10, height: 10, borderRadius: 999, border: `2px dashed ${color}` }
        : { width: 10, height: 10, borderRadius: 999, background: color }}
      aria-hidden
    />
    <Text size="xs" c="dimmed">{children}</Text>
  </Group>
);

const Vacio: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Text size="sm" c="dimmed" ta="center" py="lg">{children}</Text>
);

const BarrasPorDia: React.FC<{ datos: { dia: string; total: number }[] }> = ({ datos }) => {
  const max = Math.max(1, ...datos.map((d) => d.total));
  const etiqueta = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
  return (
    <div>
      <Group gap={2} align="flex-end" wrap="nowrap" style={{ height: 140 }}>
        {datos.map((d) => (
          <Tooltip key={d.dia} label={`${etiqueta(d.dia)}: ${d.total} sesión(es)`} withArrow>
            <Box
              style={{
                flex: 1,
                minWidth: 2,
                height: `${Math.max(d.total ? 6 : 2, (d.total / max) * 100)}%`,
                background: d.total ? 'var(--accent-primary)' : 'var(--border-subtle)',
                borderRadius: '3px 3px 0 0',
              }}
            />
          </Tooltip>
        ))}
      </Group>
      <Group justify="space-between" mt={6}>
        <Text size="xs" c="dimmed">{datos.length ? etiqueta(datos[0].dia) : ''}</Text>
        <Text size="xs" c="dimmed">Hoy</Text>
      </Group>
    </div>
  );
};

const BarrasPracticas: React.FC<{ datos: { nombre: string; total: number }[] }> = ({ datos }) => {
  if (!datos.length) return <Vacio>Sin sesiones en el período.</Vacio>;
  const max = datos[0].total;
  return (
    <Stack gap={10}>
      {datos.slice(0, 8).map((d) => (
        <div key={d.nombre}>
          <Group justify="space-between" gap="xs" wrap="nowrap">
            <Text size="sm" truncate>{d.nombre}</Text>
            <Text size="sm" fw={600}>{d.total}</Text>
          </Group>
          <Box style={{ height: 6, borderRadius: 3, background: 'var(--border-subtle)', marginTop: 4 }}>
            <Box style={{ width: `${(d.total / max) * 100}%`, height: '100%', borderRadius: 3, background: 'var(--accent-primary)' }} />
          </Box>
        </div>
      ))}
    </Stack>
  );
};

const TablaSesiones: React.FC<{ sesiones: SesionPractica[]; ahora: number; conEstudiante?: boolean }> = ({ sesiones, ahora, conEstudiante = true }) => (
  <Box style={{ overflowX: 'auto' }}>
    <Table className="tabla-sesiones" verticalSpacing="sm" borderColor="var(--border-subtle)" miw={640}>
      <Table.Thead>
        <Table.Tr>
          {conEstudiante && <Table.Th>Estudiante</Table.Th>}
          <Table.Th>Práctica</Table.Th>
          <Table.Th>Inicio</Table.Th>
          <Table.Th>Duración</Table.Th>
          <Table.Th>Ubicación</Table.Th>
          <Table.Th>IP</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {sesiones.map((s) => (
          <Table.Tr key={s.id}>
            {conEstudiante && (
              <Table.Td>
                <Text size="sm" fw={600}>{nombreEstudiante(s)}</Text>
                <Text size="xs" c="dimmed">{s.usuario}</Text>
              </Table.Td>
            )}
            <Table.Td><Text size="sm">{nombrePractica(s)}</Text></Table.Td>
            <Table.Td><Text size="sm">{formatoFecha(s.inicio)}</Text></Table.Td>
            <Table.Td>
              <Text size="sm">{formatoDuracion(duracionMs(s, ahora))}</Text>
              {esActiva(s)
                ? <Text size="xs" style={{ color: 'var(--success)' }}>En curso</Text>
                : s.cierre === 'sin_latido' && <Text size="xs" c="dimmed">Se perdió la conexión</Text>}
            </Table.Td>
            <Table.Td>
              <Text size="sm">{ubicacion(s)}</Text>
              {detalleUbicacion(s) && <Text size="xs" c="dimmed">{detalleUbicacion(s)}</Text>}
            </Table.Td>
            <Table.Td><Text size="xs" c="dimmed" ff="monospace">{s.ip || '—'}</Text></Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  </Box>
);

export default function DashboardPage() {
  const [dias, setDias] = useState('30');
  const [datos, setDatos] = useState<ResumenSesiones | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());
  const [busqueda, setBusqueda] = useState('');
  const [seleccionado, setSeleccionado] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const r = await sesionesService.resumen(Number(dias));
      setDatos(r);
      setAhora(Date.now());
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setCargando(false);
    }
  }, [dias]);

  useEffect(() => {
    setCargando(true);
    void cargar();
    const t = setInterval(() => void cargar(), REFRESCO_MS);
    return () => clearInterval(t);
  }, [cargar]);

  const sesiones = datos?.sesiones ?? [];
  const general = useMemo(() => resumenGeneral(sesiones, ahora), [sesiones, ahora]);
  const activas = useMemo(() => sesiones.filter(esActiva), [sesiones]);
  const porDia = useMemo(() => sesionesPorDia(sesiones, Number(dias), ahora), [sesiones, dias, ahora]);
  const practicas = useMemo(() => conteoPorPractica(sesiones), [sesiones]);
  const puntos = useMemo(() => porUbicacion(sesiones), [sesiones]);
  const estudiantes = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return porEstudiante(sesiones, ahora).filter((e) => !q || e.nombre.toLowerCase().includes(q) || e.usuario.toLowerCase().includes(q));
  }, [sesiones, ahora, busqueda]);
  const historial = useMemo(() => sesiones.filter((s) => s.usuario === seleccionado), [sesiones, seleccionado]);

  return (
    <Box h="100%" style={{ overflow: 'auto' }}>
      <style>{`.tabla-sesiones tbody tr:hover { background: var(--background-tertiary, var(--background-secondary)); }`}</style>
      <Stack gap="lg" p="xl" maw={1200} mx="auto">
        <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
          <Group gap={12} wrap="nowrap">
            <Activity size={26} style={{ color: 'var(--accent-primary)' }} aria-hidden />
            <div>
              <Title order={1} style={{ fontSize: 26, letterSpacing: '-.02em' }}>Actividad del laboratorio</Title>
              <Text size="sm" c="dimmed">
                Prácticas reportadas por la app{datos ? ` · actualizado ${new Date(ahora).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}` : ''}
              </Text>
            </div>
          </Group>
          <Group gap="sm">
            <SegmentedControl data={PERIODOS} value={dias} onChange={(v) => setDias(String(v))} />
            <Tooltip label="Actualizar">
              <ActionIcon variant="subtle" size="lg" onClick={() => void cargar()} aria-label="Actualizar">
                <RefreshCw size={18} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>

        {cargando && !datos ? (
          <Group py={60} justify="center"><Loader size="sm" /><Text size="sm" c="dimmed">Cargando actividad…</Text></Group>
        ) : error && !datos ? (
          <Paper radius="lg" p="xl" style={panel}>
            <Text fw={600}>No se pudo cargar la actividad</Text>
            <Text size="sm" c="dimmed">{error}</Text>
          </Paper>
        ) : (
          <>
            {error && <Text size="xs" style={{ color: 'var(--danger)' }}>Último refresco falló: {error}</Text>}

            <SimpleGrid cols={{ base: 2, md: 5 }} spacing="md">
              <Dato etiqueta="Conectados ahora" valor={general.activas} destacado />
              <Dato etiqueta="Sesiones" valor={general.total} />
              <Dato etiqueta="Estudiantes" valor={general.estudiantes} />
              <Dato etiqueta="Duración promedio" valor={formatoDuracion(general.duracionPromedioMs)} />
              <Dato etiqueta="Práctica más usada" valor={general.practicaTop ?? '—'} texto={!!general.practicaTop} />
            </SimpleGrid>

            <Seccion titulo="En vivo" subtitulo="Quién está haciendo una práctica en este momento">
              {activas.length
                ? <TablaSesiones sesiones={activas} ahora={ahora} />
                : <Vacio>Nadie está haciendo prácticas en este momento.</Vacio>}
            </Seccion>

            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
              <Seccion titulo="Sesiones por día">
                <BarrasPorDia datos={porDia} />
              </Seccion>
              <Seccion titulo="Prácticas más usadas">
                <BarrasPracticas datos={practicas} />
              </Seccion>
            </SimpleGrid>

            <Seccion titulo="¿Desde dónde se conectan?" subtitulo="Ubicación del equipo del estudiante (≈110 m) cuando la permite; si no, aproximada por IP.">
              {puntos.length ? (
                <>
                  <Group gap="lg">
                    <Leyenda color="var(--success)">Sesión en curso</Leyenda>
                    <Leyenda color="var(--accent-primary)">Solo historial</Leyenda>
                    <Leyenda color="var(--accent-primary)" punteada>Aproximada por IP (centro de ciudad)</Leyenda>
                  </Group>
                  <SesionesMapa puntos={puntos} />
                </>
              ) : <Vacio>Todavía no hay sesiones con ubicación en el período.</Vacio>}
            </Seccion>

            <Seccion titulo="Por estudiante" subtitulo="Selecciona a alguien para ver su historial">
              <TextInput
                placeholder="Buscar por nombre o usuario…"
                aria-label="Buscar estudiante"
                value={busqueda}
                onChange={(e) => setBusqueda(e.currentTarget.value)}
                leftSection={<Search size={16} aria-hidden />}
                styles={{ input: { background: 'var(--background-secondary)', border: '1px solid var(--border-subtle)' } }}
                rightSection={busqueda && (
                  <ActionIcon variant="subtle" color="gray" onClick={() => setBusqueda('')} aria-label="Limpiar búsqueda"><X size={14} /></ActionIcon>
                )}
                maw={320}
              />
              {estudiantes.length ? (
                <Stack gap={0}>
                  {estudiantes.map((e) => (
                    <UnstyledButton
                      key={e.usuario}
                      onClick={() => setSeleccionado(seleccionado === e.usuario ? null : e.usuario)}
                      aria-expanded={seleccionado === e.usuario}
                      px="sm"
                      py="xs"
                      style={{
                        borderRadius: 8,
                        background: seleccionado === e.usuario ? 'var(--interactive-hover, var(--background-tertiary))' : undefined,
                      }}
                    >
                      <Group justify="space-between" wrap="nowrap">
                        <div style={{ minWidth: 0 }}>
                          <Text size="sm" fw={600} truncate>{e.nombre}{e.activa && <Text span size="xs" ml={6} style={{ color: 'var(--success)' }}>● en curso</Text>}</Text>
                          <Text size="xs" c="dimmed">{e.usuario}</Text>
                        </div>
                        <Group gap="lg" wrap="nowrap">
                          <Text size="sm" c="dimmed">{e.sesiones} sesión(es)</Text>
                          <Text size="sm" c="dimmed" visibleFrom="sm">{formatoDuracion(e.tiempoTotalMs)} en total</Text>
                          <Text size="sm" c="dimmed" visibleFrom="sm">Última: {formatoFecha(e.ultima)}</Text>
                        </Group>
                      </Group>
                    </UnstyledButton>
                  ))}
                </Stack>
              ) : (
                <Vacio>{busqueda.trim() ? 'No hay nadie con ese nombre en el período.' : 'Sin sesiones en el período.'}</Vacio>
              )}
              {seleccionado && historial.length > 0 && (
                <Box pt="sm" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                  <Text size="sm" fw={600} mb="xs">Historial de {nombreEstudiante(historial[0])}</Text>
                  <TablaSesiones sesiones={historial} ahora={ahora} conEstudiante={false} />
                </Box>
              )}
            </Seccion>
          </>
        )}
      </Stack>
    </Box>
  );
}
