// pages/dashboard/EncuestasPanel.tsx — pestaña «Encuestas» de Actividad: lo que respondieron los estudiantes al terminar cada
// práctica (aprendizaje y funcionamiento). Anónimo: el servidor nunca manda quién respondió.
import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ActionIcon, Badge, Box, Group, Loader, Paper, Progress, SegmentedControl, SimpleGrid, Stack, Text, Tooltip } from '@mantine/core';
import { RefreshCw } from 'lucide-react';
import { encuestasService, type ResumenEncuestas, type ResumenPracticaEncuesta } from '@/features/practicas/encuestas.service';
import { colorNota5, nota5, problemasOrdenados, repartoDificultad } from './encuestasStats';

const PERIODOS = [
  { value: '30', label: '30 días' },
  { value: '90', label: '90 días' },
  { value: '365', label: '1 año' },
];

const panel: React.CSSProperties = { background: 'var(--background-secondary)', border: '1px solid var(--border-subtle)' };
const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });

const PREGUNTAS: { clave: keyof ResumenPracticaEncuesta['promedios']; etiqueta: string }[] = [
  { clave: 'aprendizaje', etiqueta: 'Aprendizaje' },
  { clave: 'claridad', etiqueta: 'Claridad de los pasos' },
  { clave: 'funcionamiento', etiqueta: 'Funcionamiento (conexión y terminal)' },
  { clave: 'asistente', etiqueta: 'Ayuda del asistente' },
  { clave: 'satisfaccion', etiqueta: 'Satisfacción general' },
];

function TarjetaPractica({ p, nombre }: { p: ResumenPracticaEncuesta; nombre: string }) {
  const problemas = problemasOrdenados(p.problemas);
  const dificultad = repartoDificultad(p.dificultad, p.respuestas);
  const sinProblemas = p.problemas.ninguno ?? 0;
  return (
    <Paper radius="lg" p="lg" style={panel}>
      <Stack gap="lg">
        <Group justify="space-between">
          <Text fw={800} style={{ fontSize: 18 }}>{nombre}</Text>
          <Badge variant="light" size="lg">{p.respuestas} respuesta{p.respuestas !== 1 ? 's' : ''}</Badge>
        </Group>

        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl">
          <Stack gap="sm">
            <Text fw={700} size="sm">Promedios (de 1 a 5)</Text>
            {PREGUNTAS.map(({ clave, etiqueta }) => {
              const v = p.promedios[clave];
              return (
                <Box key={clave}>
                  <Group justify="space-between" mb={2}>
                    <Text size="sm">{etiqueta}</Text>
                    <Text size="sm" fw={700} c={colorNota5(v)}>{nota5(v)}</Text>
                  </Group>
                  <Progress value={v == null ? 0 : (v / 5) * 100} color={colorNota5(v)} size="sm" radius="xl" aria-label={etiqueta} />
                </Box>
              );
            })}
            {p.asistenteNoUso > 0 && <Text size="xs" c="dimmed">{p.asistenteNoUso} no usaron el asistente.</Text>}
          </Stack>

          <Stack gap="md">
            <Box>
              <Text fw={700} size="sm" mb={6}>Dificultad</Text>
              <Group gap={2} wrap="nowrap" style={{ height: 14, borderRadius: 7, overflow: 'hidden' }}>
                {dificultad.filter((d) => d.veces > 0).map((d, i) => (
                  <Tooltip key={d.valor} label={`${d.etiqueta}: ${d.veces}`} withArrow>
                    <Box style={{ flex: d.veces, height: '100%', background: `var(--mantine-color-${['teal', 'green', 'blue', 'orange', 'red'][DIF_IDX[d.valor] ?? i]}-6)` }} />
                  </Tooltip>
                ))}
              </Group>
              <Group gap="sm" mt={6}>
                {dificultad.filter((d) => d.veces > 0).map((d) => (
                  <Text key={d.valor} size="xs" c="dimmed">{d.etiqueta} {d.pct} %</Text>
                ))}
              </Group>
            </Box>
            <Box>
              <Text fw={700} size="sm" mb={6}>Problemas reportados</Text>
              {problemas.length ? (
                <Stack gap={4}>
                  {problemas.map((x) => (
                    <Group key={x.valor} justify="space-between">
                      <Text size="sm">{x.etiqueta}</Text>
                      <Text size="sm" fw={600}>{x.veces}</Text>
                    </Group>
                  ))}
                </Stack>
              ) : (
                <Text size="sm" c="dimmed">Nadie reportó problemas.</Text>
              )}
              {sinProblemas > 0 && problemas.length > 0 && <Text size="xs" c="dimmed" mt={4}>{sinProblemas} sin ningún problema.</Text>}
            </Box>
          </Stack>
        </SimpleGrid>

        <Box>
          <Text fw={700} size="sm" mb={6}>Comentarios</Text>
          {p.comentarios.length ? (
            <Stack gap={8} style={{ maxHeight: 320, overflow: 'auto' }}>
              {p.comentarios.map((c, i) => (
                <Paper key={i} radius="md" p="sm" style={{ background: 'var(--background-tertiary, transparent)', border: '1px solid var(--border-subtle)' }}>
                  <Text size="xs" c="dimmed" mb={4}>{fecha(c.fecha)}</Text>
                  {c.gusto && <Text size="sm"><Text span fw={600} c="green">Le gustó: </Text>{c.gusto}</Text>}
                  {c.mejorar && <Text size="sm"><Text span fw={600} c="orange">Mejoraría: </Text>{c.mejorar}</Text>}
                </Paper>
              ))}
            </Stack>
          ) : (
            <Text size="sm" c="dimmed">Sin comentarios escritos.</Text>
          )}
        </Box>
      </Stack>
    </Paper>
  );
}

const DIF_IDX: Record<string, number> = { muy_facil: 0, facil: 1, adecuada: 2, dificil: 3, muy_dificil: 4 };

export default function EncuestasPanel() {
  const [dias, setDias] = useState('90');
  const [datos, setDatos] = useState<ResumenEncuestas | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nombres, setNombres] = useState<Record<string, string>>({});

  const cargar = useCallback(async () => {
    try {
      setDatos(await encuestasService.resumen(Number(dias)));
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  }, [dias]);

  useEffect(() => { void cargar(); }, [cargar]);

  // Nombre de cada práctica (las encuestas llegan con el id, p. ej. «linux»).
  useEffect(() => {
    invoke<{ id: string; name: string }[]>('practicas_list_categories')
      .then((cats) => setNombres(Object.fromEntries(cats.map((c) => [c.id, c.name]))))
      .catch(() => {});
  }, []);

  return (
    <Box h="100%" style={{ overflow: 'auto' }}>
      <Stack gap="lg" p="xl" maw={1200} mx="auto">
        <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
          <div>
            <Text fw={800} style={{ fontSize: 20 }}>Encuestas</Text>
            <Text size="sm" c="dimmed">Lo que opinan los estudiantes al terminar cada práctica. Anónimo: no se muestra quién respondió.</Text>
          </div>
          <Group gap="sm">
            <SegmentedControl data={PERIODOS} value={dias} onChange={(v) => setDias(String(v))} />
            <Tooltip label="Actualizar">
              <ActionIcon variant="subtle" size="lg" onClick={() => void cargar()} aria-label="Actualizar encuestas"><RefreshCw size={18} /></ActionIcon>
            </Tooltip>
          </Group>
        </Group>

        {error ? (
          <Paper p="lg" radius="lg" style={panel}>
            <Text fw={600}>No se pudieron cargar las encuestas</Text>
            <Text size="sm" c="dimmed" mt={4}>{error}</Text>
          </Paper>
        ) : !datos ? (
          <Group py={48} justify="center"><Loader size="sm" /><Text size="sm" c="dimmed">Cargando encuestas…</Text></Group>
        ) : datos.practicas.length === 0 ? (
          <Text size="sm" c="dimmed" ta="center" py={48}>
            Todavía no hay encuestas en este período. Aparecen cuando un estudiante termina todos los módulos de una práctica.
          </Text>
        ) : (
          datos.practicas.map((p) => <TarjetaPractica key={p.practica} p={p} nombre={nombres[p.practica] ?? p.practica} />)
        )}
      </Stack>
    </Box>
  );
}
