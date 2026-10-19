// components/practicas/EncuestaPracticaModal.tsx — encuesta al terminar una práctica completa (todos sus módulos): cómo le
// fue aprendiendo y cómo funcionó la plataforma. Las respuestas llegan anónimas al personal del laboratorio (Actividad → Encuestas).
import { useEffect, useState } from 'react';
import { Button, Chip, Divider, Group, Modal, SegmentedControl, Stack, Text, Textarea } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  BORRADOR_VACIO, DIFICULTADES, PROBLEMAS, alternarProblema, encuestasService, respuestasDe, type BorradorEncuesta,
} from '../../services/encuestas.service';

const ESCALA = ['1', '2', '3', '4', '5'].map((v) => ({ value: v, label: v }));
const mensajeDe = (e: any) => e?.message ?? String(e);

/** Pregunta de 1 a 5 con sus extremos explicados. */
function Escala({ etiqueta, bajo, alto, valor, onChange, extra }: {
  etiqueta: string; bajo: string; alto: string; valor: number | 'no_uso' | null; onChange: (v: number | 'no_uso') => void;
  extra?: { value: string; label: string };
}) {
  const data = extra ? [...ESCALA, extra] : ESCALA;
  return (
    <Stack gap={4}>
      <Text size="sm" fw={600}>{etiqueta}</Text>
      <SegmentedControl
        fullWidth
        data={data}
        value={valor == null ? '' : String(valor)}
        onChange={(v) => onChange(v === 'no_uso' ? 'no_uso' : Number(v))}
        aria-label={etiqueta}
      />
      <Group justify="space-between">
        <Text size="xs" c="dimmed">1 = {bajo}</Text>
        <Text size="xs" c="dimmed">5 = {alto}</Text>
      </Group>
    </Stack>
  );
}

export default function EncuestaPracticaModal({ opened, practica, nombre, onClose, onEnviada }: {
  opened: boolean;
  /** Id de la práctica (tema), p. ej. «linux». */
  practica: string;
  nombre: string;
  onClose: () => void;
  onEnviada?: () => void;
}) {
  const [b, setB] = useState<BorradorEncuesta>(BORRADOR_VACIO);
  const [enviando, setEnviando] = useState(false);
  useEffect(() => { if (opened) setB(BORRADOR_VACIO); }, [opened, practica]);
  const set = <K extends keyof BorradorEncuesta>(k: K, v: BorradorEncuesta[K]) => setB((x) => ({ ...x, [k]: v }));
  const respuestas = respuestasDe(b);

  const enviar = async () => {
    if (!respuestas) return;
    setEnviando(true);
    try {
      await encuestasService.enviar(practica, respuestas);
      notifications.show({ title: '¡Gracias por tu opinión!', message: 'Nos ayuda a mejorar las prácticas del laboratorio.', color: 'green' });
      onEnviada?.();
      onClose();
    } catch (e) {
      notifications.show({ title: 'No se pudo enviar la encuesta', message: mensajeDe(e), color: 'red' });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} centered size="lg" radius="lg" title={<Text fw={800}>¿Cómo te fue en la práctica de {nombre}?</Text>}>
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Terminaste todos los módulos. Tus respuestas son anónimas: el laboratorio solo ve los resultados juntos, sin tu nombre.
          Toma un minuto.
        </Text>

        <Divider label="Aprendizaje" labelPosition="left" />
        <Escala etiqueta="¿Cuánto aprendiste con esta práctica?" bajo="nada" alto="muchísimo" valor={b.aprendizaje} onChange={(v) => set('aprendizaje', v as number)} />
        <Escala etiqueta="¿Qué tan claras fueron las explicaciones y los pasos?" bajo="nada claras" alto="muy claras" valor={b.claridad} onChange={(v) => set('claridad', v as number)} />
        <Stack gap={4}>
          <Text size="sm" fw={600}>La dificultad te pareció…</Text>
          <SegmentedControl fullWidth data={[...DIFICULTADES]} value={b.dificultad ?? ''} onChange={(v) => set('dificultad', v)} aria-label="Dificultad" />
        </Stack>
        <Escala
          etiqueta="¿Te ayudó el asistente del chat?" bajo="no me ayudó" alto="me ayudó mucho"
          valor={b.asistente} onChange={(v) => set('asistente', v)} extra={{ value: 'no_uso', label: 'No lo usé' }}
        />

        <Divider label="Funcionamiento" labelPosition="left" />
        <Escala etiqueta="¿Qué tan bien funcionó la conexión y la terminal?" bajo="muy mal" alto="perfecto" valor={b.funcionamiento} onChange={(v) => set('funcionamiento', v as number)} />
        <Stack gap={6}>
          <Text size="sm" fw={600}>¿Tuviste algún problema? <Text span size="xs" c="dimmed" fw={400}>(puedes marcar varios)</Text></Text>
          <Group gap={6}>
            {PROBLEMAS.map((p) => (
              <Chip key={p.value} size="sm" checked={b.problemas.includes(p.value)} onChange={() => set('problemas', alternarProblema(b.problemas, p.value))}>
                {p.label}
              </Chip>
            ))}
          </Group>
        </Stack>

        <Divider label="En general" labelPosition="left" />
        <Escala etiqueta="¿Qué tan satisfecho quedaste con la práctica?" bajo="nada" alto="muy satisfecho" valor={b.satisfaccion} onChange={(v) => set('satisfaccion', v as number)} />
        <Textarea label="¿Qué fue lo que más te gustó?" placeholder="Opcional" autosize minRows={2} maxLength={1000} value={b.gusto} onChange={(e) => set('gusto', e.currentTarget.value)} />
        <Textarea label="¿Qué mejorarías?" placeholder="Opcional" autosize minRows={2} maxLength={1000} value={b.mejorar} onChange={(e) => set('mejorar', e.currentTarget.value)} />

        <Group justify="space-between" mt="xs">
          <Text size="xs" c="dimmed">{respuestas ? 'Listo para enviar.' : 'Responde las preguntas de opción; los comentarios son opcionales.'}</Text>
          <Group gap="xs">
            <Button variant="subtle" color="gray" onClick={onClose}>Ahora no</Button>
            <Button onClick={() => void enviar()} disabled={!respuestas} loading={enviando}>Enviar</Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
