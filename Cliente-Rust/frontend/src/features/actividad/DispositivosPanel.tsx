// features/actividad/DispositivosPanel.tsx — pestaña «Dispositivos» de Actividad: quién entra por SSH a cada Pi, con su ubicación.
// Aparte de las prácticas. Los datos salen del agente de cada dispositivo (cmd::dispositivos) y solo cuentan las conexiones
// nuevas, desde que el agente se activó: no hay historial anterior.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActionIcon, Box, Collapse, Group, Loader, Paper, SegmentedControl, SimpleGrid, Stack, Table, Text, TextInput, Tooltip, UnstyledButton } from '@mantine/core';
import { AlertTriangle, ChevronDown, ChevronRight, RefreshCw, Search, Server, X } from 'lucide-react';
import { dispositivosService, type DispositivoActividad, type ResumenDispositivos } from './dispositivos.service';
import SesionesMapa from './SesionesMapa';
import { formatoDuracion } from './dashboardStats';
import {
  duracionConexion, estadoDispositivo, fechaExcel, haceTiempo, nombreConexion, porUsuario, puntosDeConexiones, ubicacionConexion,
} from './dispositivosStats';

const REFRESCO_MS = 15_000;
const MAX_FILAS = 100;
const PERIODOS = [
  { value: '7', label: '7 días' },
  { value: '30', label: '30 días' },
  { value: '90', label: '90 días' },
];

const panel: React.CSSProperties = { background: 'var(--background-secondary)', border: '1px solid var(--border-subtle)' };

const Punto: React.FC<{ ok: boolean | null }> = ({ ok }) => (
  <span aria-hidden style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 999, flexShrink: 0, background: ok === true ? 'var(--success)' : ok === false ? '#ef4444' : '#9ca3af' }} />
);

const Seccion: React.FC<{ titulo: string; subtitulo?: string; children: React.ReactNode }> = ({ titulo, subtitulo, children }) => (
  <Box>
    <Text fw={700} size="sm">{titulo}</Text>
    {subtitulo && <Text size="xs" c="dimmed" mb="xs">{subtitulo}</Text>}
    <Box mt={subtitulo ? 0 : 'xs'}>{children}</Box>
  </Box>
);

const Dato: React.FC<{ etiqueta: string; valor: string | number; destacado?: boolean; pequeno?: boolean }> = ({ etiqueta, valor, destacado, pequeno }) => (
  <Paper radius="lg" p="md" style={panel}>
    <Text size="xs" c="dimmed" tt="uppercase" fw={600} style={{ letterSpacing: '.05em' }}>{etiqueta}</Text>
    <Text fw={800} style={{ fontSize: pequeno ? 16 : 24, color: destacado ? 'var(--accent-primary)' : undefined }}>{valor}</Text>
  </Paper>
);

const TarjetaDispositivo: React.FC<{ d: DispositivoActividad; ahora: number }> = ({ d, ahora }) => {
  const estado = estadoDispositivo(d, ahora);
  const puntos = useMemo(() => puntosDeConexiones(d.conexiones), [d.conexiones]);
  const nr = d.noReconocidas;
  const [abierto, setAbierto] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const usuarios = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return porUsuario(d.conexiones, ahora).filter((u) => !q || u.nombre.toLowerCase().includes(q) || u.usuario.toLowerCase().includes(q));
  }, [d.conexiones, ahora, busqueda]);

  return (
    <Paper radius="lg" p="lg" style={panel}>
      <Stack gap="lg">
        <Group gap="sm" wrap="nowrap">
          <Server size={22} style={{ color: 'var(--accent-primary)' }} aria-hidden />
          <div>
            <Text fw={800} style={{ fontSize: 18 }}>{d.nombre}</Text>
            <Group gap={6} wrap="nowrap"><Punto ok={estado.ok} /><Text size="xs" c="dimmed">{estado.texto}</Text></Group>
          </div>
        </Group>

        <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
          <Dato etiqueta="Conectados ahora" valor={d.conectados.length} destacado />
          <Dato etiqueta="Conexiones" valor={d.totalConexiones} />
          <Dato etiqueta="Personas distintas" valor={d.personasDistintas} />
          <Dato etiqueta={`Cuenta compartida «${d.cuentaCompartida.nombre}»`} valor={`${d.cuentaCompartida.conexiones} (${d.cuentaCompartida.activas} ahora)`} pequeno />
        </SimpleGrid>

        {nr.conexiones > 0 && (
          <Paper radius="md" p="sm" style={{ border: '1px solid #f59e0b', background: 'color-mix(in srgb, #f59e0b 10%, transparent)' }}>
            <Group gap={8} wrap="nowrap" align="flex-start">
              <AlertTriangle size={16} color="#f59e0b" style={{ marginTop: 2, flexShrink: 0 }} aria-hidden />
              <div style={{ minWidth: 0 }}>
                <Text size="sm" fw={600}>{nr.conexiones} entrada(s) con cuentas no reconocidas{nr.activas ? ` · ${nr.activas} abierta(s) ahora` : ''}</Text>
                <Text size="xs" c="dimmed">No son del LDAP ni la cuenta compartida. Última: {nr.ultimas[0].usuario} desde {nr.ultimas[0].ip}{nr.ultimas[0].pais ? ` (${nr.ultimas[0].pais})` : ''}, {haceTiempo(nr.ultimas[0].inicio, ahora)}.</Text>
              </div>
            </Group>
          </Paper>
        )}

        <Seccion titulo="Conectados ahora">
          {d.conectados.length ? (
            <Stack gap={6}>
              {d.conectados.map((c) => (
                <Group key={c.id} justify="space-between" wrap="nowrap" style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: 6 }}>
                  <div style={{ minWidth: 0 }}>
                    <Text size="sm" fw={600} truncate>{nombreConexion(c)}</Text>
                    {c.nombre && <Text size="xs" c="dimmed" truncate>{c.usuario}</Text>}
                  </div>
                  <Text size="xs" c="dimmed" ta="right">desde {fechaExcel(c.inicio)} · {c.ip} · {ubicacionConexion(c)}</Text>
                </Group>
              ))}
            </Stack>
          ) : (
            <Text size="sm" c="dimmed">Nadie conectado ahora.</Text>
          )}
        </Seccion>

        {puntos.length > 0 && (
          <Seccion titulo="¿Desde dónde se conectan?" subtitulo="Ubicación aproximada por IP (nivel ciudad).">
            <Box style={{ height: 320, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
              <SesionesMapa puntos={puntos} />
            </Box>
          </Seccion>
        )}

        <Seccion titulo={`Por usuario · ${d.nombre}`} subtitulo={d.totalConexiones > d.conexiones.length ? `Las ${d.conexiones.length} conexiones más recientes de ${d.totalConexiones}. Selecciona a alguien para ver su historial.` : 'Selecciona a alguien para ver su historial.'}>
          <Stack gap="xs">
            <TextInput
              placeholder="Buscar por nombre o usuario…"
              aria-label={`Buscar usuario en ${d.nombre}`}
              value={busqueda}
              onChange={(e) => setBusqueda(e.currentTarget.value)}
              leftSection={<Search size={16} aria-hidden />}
              styles={{ input: { background: 'var(--background-secondary)', border: '1px solid var(--border-subtle)' } }}
              rightSection={busqueda && (
                <ActionIcon variant="subtle" color="gray" onClick={() => setBusqueda('')} aria-label="Limpiar búsqueda"><X size={14} /></ActionIcon>
              )}
              maw={320}
            />
            {usuarios.length ? (
              <Stack gap={0}>
                {usuarios.map((u) => {
                  const abierta = abierto === u.usuario;
                  return (
                    <Box key={u.usuario}>
                      <UnstyledButton
                        onClick={() => setAbierto(abierta ? null : u.usuario)}
                        aria-expanded={abierta}
                        px="sm"
                        py="xs"
                        w="100%"
                        style={{ borderRadius: 8, background: abierta ? 'var(--interactive-hover, var(--background-tertiary))' : undefined }}
                      >
                        <Group justify="space-between" wrap="nowrap">
                          <Group gap={8} wrap="nowrap" style={{ minWidth: 0 }}>
                            {abierta ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
                            <div style={{ minWidth: 0 }}>
                              <Text size="sm" fw={600} truncate>{u.nombre}{u.activa && <Text span size="xs" ml={6} style={{ color: 'var(--success)' }}>● conectado</Text>}</Text>
                              {u.nombre !== u.usuario && <Text size="xs" c="dimmed" truncate>{u.usuario}</Text>}
                            </div>
                          </Group>
                          <Group gap="lg" wrap="nowrap">
                            <Text size="sm" c="dimmed">{u.conexiones.length} conexión(es)</Text>
                            <Text size="sm" c="dimmed" visibleFrom="sm">{formatoDuracion(u.tiempoTotalMs)} en total</Text>
                            <Text size="sm" c="dimmed" visibleFrom="sm">Última: {fechaExcel(u.ultima)}</Text>
                          </Group>
                        </Group>
                      </UnstyledButton>
                      <Collapse expanded={abierta}>
                        <Box px="sm" pb="sm" style={{ overflowX: 'auto' }}>
                          <Table className="tabla-sesiones" verticalSpacing="xs" horizontalSpacing="md" highlightOnHover={false}>
                            <Table.Thead>
                              <Table.Tr>
                                <Table.Th>Conexión</Table.Th><Table.Th>Desconexión</Table.Th><Table.Th>IP</Table.Th><Table.Th>Ubicación</Table.Th>
                              </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                              {u.conexiones.slice(0, MAX_FILAS).map((c) => (
                                <Table.Tr key={c.id}>
                                  <Table.Td><Text size="sm">{fechaExcel(c.inicio)}</Text></Table.Td>
                                  <Table.Td>
                                    {c.activa
                                      ? <Text size="sm" fw={600} style={{ color: 'var(--success)' }}>● Conectado · {duracionConexion(c, ahora)}</Text>
                                      : <Text size="sm">{fechaExcel(c.fin)}{c.cierre === 'sin_cierre' && <Text span size="xs" c="dimmed"> (sin cierre)</Text>}</Text>}
                                  </Table.Td>
                                  <Table.Td><Text size="sm">{c.ip}</Text></Table.Td>
                                  <Table.Td><Text size="sm">{ubicacionConexion(c)}</Text></Table.Td>
                                </Table.Tr>
                              ))}
                            </Table.Tbody>
                          </Table>
                        </Box>
                      </Collapse>
                    </Box>
                  );
                })}
              </Stack>
            ) : (
              <Text size="sm" c="dimmed">
                {busqueda.trim() ? 'No hay nadie con ese nombre en el período.' : 'Todavía no hay conexiones registradas. Aparecerán aquí a medida que las personas entren por SSH.'}
              </Text>
            )}
          </Stack>
        </Seccion>
      </Stack>
    </Paper>
  );
};

export default function DispositivosPanel() {
  const [dias, setDias] = useState('30');
  const [datos, setDatos] = useState<ResumenDispositivos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());

  const cargar = useCallback(async () => {
    try {
      setDatos(await dispositivosService.resumen(Number(dias)));
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

  return (
    <Box h="100%" style={{ overflow: 'auto' }}>
      <Stack gap="lg" p="xl" maw={1200} mx="auto">
        <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
          <div>
            <Text fw={800} style={{ fontSize: 20 }}>Dispositivos</Text>
            <Text size="sm" c="dimmed">
              Quién entra por SSH a cada Pi, desde que se activó el registro{datos ? ` · actualizado ${new Date(ahora).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}` : ''}
            </Text>
          </div>
          <Group gap="sm">
            <SegmentedControl data={PERIODOS} value={dias} onChange={(v) => setDias(String(v))} />
            <Tooltip label="Actualizar">
              <ActionIcon variant="subtle" size="lg" onClick={() => void cargar()} aria-label="Actualizar dispositivos"><RefreshCw size={18} /></ActionIcon>
            </Tooltip>
          </Group>
        </Group>

        {cargando && !datos ? (
          <Group py={48} justify="center"><Loader size="sm" /><Text size="sm" c="dimmed">Cargando dispositivos…</Text></Group>
        ) : error ? (
          <Paper p="lg" radius="lg" style={panel}>
            <Text fw={600}>No se pudo cargar la actividad de los dispositivos</Text>
            <Text size="sm" c="dimmed" mt={4}>{error}</Text>
          </Paper>
        ) : datos && datos.dispositivos.length === 0 ? (
          <Text size="sm" c="dimmed" ta="center" py={48}>No hay dispositivos configurados.</Text>
        ) : (
          datos?.dispositivos.map((d) => <TarjetaDispositivo key={d.id} d={d} ahora={ahora} />)
        )}
      </Stack>
    </Box>
  );
}
