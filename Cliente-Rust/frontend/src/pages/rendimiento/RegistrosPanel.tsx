// pages/rendimiento/RegistrosPanel.tsx — registros en vivo de la Pi para el panel de Rendimiento:
// cada petición a la API de prácticas y cada evento de SSH (quién entró, contraseñas fallidas,
// conexiones rechazadas por exceso o cortadas). Sirve para ver qué pasa justo cuando algo falla.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Group, Paper, SegmentedControl, Switch, Table, Text } from '@mantine/core';
import { Pause, Play } from 'lucide-react';
import { rendimientoLogs, type EventoSsh, type RegistroApi } from '../../services/rendimiento.service';
import {
  EVENTOS_SSH, claveApi, claveSsh, contarEventos, eventoConProblema, peticionConProblema, unirRegistros,
  type Gravedad,
} from './registros';

const SONDEO_MS = 3000;
const FILAS_A_LA_VISTA = 200;

const COLOR_GRAVEDAD: Record<Gravedad, string> = {
  bueno: 'text-[#0ca30c]',
  neutro: 'text-[var(--text-secondary)]',
  alerta: 'text-[#b07700] [[data-mantine-color-scheme=dark]_&]:text-[#fab219]',
  critico: 'text-[#d03b3b]',
};

const hora = (t: number) => new Date(t * 1000).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const tamano = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : b >= 1024 ? `${Math.round(b / 1024)} KB` : `${b} B`);

function estadoPeticion(r: RegistroApi): Gravedad {
  if (r.estado === 0 || r.estado >= 500) return 'critico';
  if (r.estado >= 400 || r.ms > 1000) return 'alerta';
  return 'bueno';
}

const RegistrosPanel: React.FC = () => {
  const [api, setApi] = useState<RegistroApi[]>([]);
  const [ssh, setSsh] = useState<EventoSsh[]>([]);
  const [sinAuthLog, setSinAuthLog] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pestana, setPestana] = useState<'api' | 'ssh'>('ssh');
  const [soloProblemas, setSoloProblemas] = useState(false);
  const [pausado, setPausado] = useState(false);
  const ultimos = useRef<{ api?: number; ssh?: number }>({});

  useEffect(() => {
    if (pausado) return;
    let vivo = true;
    let enVuelo = false;
    const pedir = async () => {
      if (enVuelo) return;
      enVuelo = true;
      try {
        // SSH: desde un segundo antes (el auth.log no trae fracciones); los repetidos se descartan.
        const desdeSsh = ultimos.current.ssh != null ? ultimos.current.ssh - 1 : undefined;
        const r = await rendimientoLogs(ultimos.current.api, desdeSsh);
        if (!vivo) return;
        if (r.api.length) {
          ultimos.current.api = r.api[r.api.length - 1].t;
          setApi((prev) => unirRegistros(prev, r.api, claveApi));
        }
        if (r.ssh === null) setSinAuthLog(true);
        else if (r.ssh.length) {
          ultimos.current.ssh = r.ssh[r.ssh.length - 1].t;
          setSsh((prev) => unirRegistros(prev, r.ssh!, claveSsh));
        }
        setError(null);
      } catch (e: any) {
        if (vivo) setError(e?.message ?? String(e));
      } finally {
        enVuelo = false;
      }
    };
    pedir();
    const id = window.setInterval(pedir, SONDEO_MS);
    return () => { vivo = false; window.clearInterval(id); };
  }, [pausado]);

  const cincoMin = Date.now() / 1000 - 300;
  const cuenta = useMemo(() => contarEventos(ssh, cincoMin), [ssh, Math.floor(cincoMin / 30)]); // eslint-disable-line react-hooks/exhaustive-deps
  const filasApi = useMemo(
    () => (soloProblemas ? api.filter(peticionConProblema) : api).slice(-FILAS_A_LA_VISTA).reverse(),
    [api, soloProblemas],
  );
  const filasSsh = useMemo(
    () => (soloProblemas ? ssh.filter(eventoConProblema) : ssh).slice(-FILAS_A_LA_VISTA).reverse(),
    [ssh, soloProblemas],
  );
  const problemasApi = useMemo(() => api.filter((r) => r.t >= cincoMin && peticionConProblema(r)).length, [api, Math.floor(cincoMin / 30)]); // eslint-disable-line react-hooks/exhaustive-deps

  const resumen: { texto: string; n: number; gravedad: Gravedad }[] = [
    { texto: 'entradas', n: cuenta.entrada ?? 0, gravedad: 'bueno' },
    { texto: 'contraseñas incorrectas', n: (cuenta.clave_incorrecta ?? 0) + (cuenta.usuario_inexistente ?? 0), gravedad: 'alerta' },
    { texto: 'rechazadas por exceso', n: cuenta.rechazada_por_exceso ?? 0, gravedad: 'critico' },
    { texto: 'cortadas o sin terminar', n: (cuenta.cortada ?? 0) + (cuenta.tiempo_agotado ?? 0) + (cuenta.cerrada_sin_entrar ?? 0), gravedad: 'critico' },
    { texto: 'peticiones con problema', n: problemasApi, gravedad: 'alerta' },
  ];

  return (
    <Paper withBorder radius="md" p="sm">
      <Group justify="space-between" mb="xs" wrap="wrap" gap="sm">
        <div>
          <Text fw={600}>Registros</Text>
          <Text fz="xs" c="dimmed">Lo que está pasando en la Pi, evento por evento. Se actualiza cada 3 s.</Text>
        </div>
        <Group gap="sm">
          <SegmentedControl size="xs" value={pestana} onChange={(v) => setPestana(v as 'api' | 'ssh')}
            data={[{ value: 'ssh', label: 'Conexiones SSH' }, { value: 'api', label: 'Peticiones a la API' }]} aria-label="Tipo de registro" />
          <Switch size="xs" label="Solo problemas" checked={soloProblemas} onChange={(e) => setSoloProblemas(e.currentTarget.checked)} />
          <Button size="xs" variant="default" leftSection={pausado ? <Play size={13} /> : <Pause size={13} />} onClick={() => setPausado((p) => !p)}>
            {pausado ? 'Seguir' : 'Pausar'}
          </Button>
        </Group>
      </Group>

      <Group gap="md" mb="sm" wrap="wrap">
        <Text fz="xs" c="dimmed">Últimos 5 min:</Text>
        {resumen.map((r) => (
          <Text key={r.texto} fz="xs" className={r.n > 0 ? COLOR_GRAVEDAD[r.gravedad] : 'text-[var(--text-secondary)]'}>
            <span className="font-semibold tabular-nums">{r.n}</span> {r.texto}
          </Text>
        ))}
      </Group>

      {error && <Text fz="xs" className="mb-2 text-[#d03b3b]">No se pudieron leer los registros: {error}</Text>}

      <div className="overflow-hidden rounded-md border border-[var(--border-subtle)]">
        {pestana === 'ssh' ? (
          sinAuthLog ? (
            <Text fz="sm" c="dimmed" p="sm">La API no puede leer el auth.log de la Pi: el usuario del servicio necesita permiso de lectura (grupo adm).</Text>
          ) : (
            <Table stickyHeader verticalSpacing={4} fz="xs" className="[&_td]:tabular-nums">
              <Table.Thead>
                <Table.Tr><Table.Th>Hora</Table.Th><Table.Th>Qué pasó</Table.Th><Table.Th>Usuario</Table.Th><Table.Th>Desde</Table.Th><Table.Th>Mensaje de sshd</Table.Th></Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filasSsh.map((e) => {
                  const info = EVENTOS_SSH[e.tipo] ?? { texto: e.tipo, gravedad: 'neutro' as Gravedad };
                  return (
                    <Table.Tr key={claveSsh(e)}>
                      <Table.Td className="whitespace-nowrap">{hora(e.t)}</Table.Td>
                      <Table.Td className={`whitespace-nowrap font-semibold ${COLOR_GRAVEDAD[info.gravedad]}`}>{info.texto}</Table.Td>
                      <Table.Td>{e.usuario ?? '—'}</Table.Td>
                      <Table.Td className="whitespace-nowrap">{e.ip ?? '—'}</Table.Td>
                      <Table.Td className="max-w-[360px] truncate text-[var(--text-secondary)]" title={e.mensaje}>{e.mensaje}</Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          )
        ) : (
          <Table stickyHeader verticalSpacing={4} fz="xs" className="[&_td]:tabular-nums">
            <Table.Thead>
              <Table.Tr><Table.Th>Hora</Table.Th><Table.Th>Petición</Table.Th><Table.Th>Estado</Table.Th><Table.Th>Tiempo</Table.Th><Table.Th>Tamaño</Table.Th></Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filasApi.map((r) => {
                const g = estadoPeticion(r);
                return (
                  <Table.Tr key={claveApi(r)}>
                    <Table.Td className="whitespace-nowrap">{hora(r.t)}</Table.Td>
                    <Table.Td className="max-w-[360px] truncate" title={r.ruta ?? ''}>
                      <Badge size="xs" variant="light" color="gray" mr={6}>{r.tipo}</Badge>
                      <span className="font-mono">{r.metodo} {r.ruta}</span>
                    </Table.Td>
                    <Table.Td className={`font-semibold ${COLOR_GRAVEDAD[g]}`}>{r.estado === 0 ? 'falló' : r.estado}</Table.Td>
                    <Table.Td className={r.ms > 1000 ? COLOR_GRAVEDAD.alerta : undefined}>{Math.round(r.ms)} ms</Table.Td>
                    <Table.Td>{tamano(r.bytes)}</Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        )}
        {((pestana === 'ssh' && !sinAuthLog && filasSsh.length === 0) || (pestana === 'api' && filasApi.length === 0)) && (
          <Text fz="sm" c="dimmed" p="sm">{soloProblemas ? 'Sin problemas registrados.' : 'Todavía no hay registros.'}</Text>
        )}
      </div>
    </Paper>
  );
};

export default RegistrosPanel;
