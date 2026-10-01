import React, { useState } from 'react';
import { Badge, Button, Group, Paper, Slider, Stack, Text } from '@mantine/core';
import type { LinuxBlock, SensorZone } from '../../../../../services/linuxPractice.service';
import { useEv3Status } from '../../../../../services/hardware/ev3Telemetry';
import { fillTemplate } from '../../../../../utils/mathExpr';

type Props = { block: Extract<LinuxBlock, { type: 'sensor_demo' }> };

const SURFACES = [
  { name: 'Blanco', value: 90, bg: '#f0f0f0', fg: '#111' },
  { name: 'Gris claro', value: 55, bg: '#aaaaaa', fg: '#111' },
  { name: 'Gris oscuro', value: 25, bg: '#555555', fg: '#eee' },
  { name: 'Negro', value: 5, bg: '#161616', fg: '#eee' },
];

const REAL_TYPE = { touch: 'Touch', ultrasonic: 'Ultrasonic', color: 'Color' } as const;
const LEGIBLE = { touch: 'sensor de contacto', ultrasonic: 'sensor ultrasónico', color: 'sensor de color' } as const;
const ATTR = { touch: 'touch.is_pressed', ultrasonic: 'ultrasonico.distance_centimeters', color: 'color.reflected_light_intensity' } as const;

function zoneFor(cm: number, zones: SensorZone[]): SensorZone | null {
  const sorted = [...zones].sort((a, b) => (a.max_cm ?? Infinity) - (b.max_cm ?? Infinity));
  return sorted.find(z => cm < (z.max_cm ?? Infinity)) ?? sorted[sorted.length - 1] ?? null;
}

/** Valor real del sensor (si el Panel EV3 está abierto y hay uno de ese tipo conectado). */
function LiveSensor({ kind }: { kind: Props['block']['sensor'] }) {
  const status = useEv3Status();
  const real = status?.connected ? status.sensors.find(s => s.sensor_type === REAL_TYPE[kind]) : undefined;
  if (!real) {
    return (
      <Text fz="xs" c="dimmed">
        {status?.connected
          ? `No hay un ${LEGIBLE[kind]} conectado ahora mismo: lo de arriba es una simulación.`
          : 'Abre el Panel EV3 para ver aquí el valor del sensor real; lo de arriba es una simulación.'}
      </Text>
    );
  }
  return (
    <Group gap={6}>
      <Badge color="green" variant="light" size="sm">Real</Badge>
      <Text fz="xs">{LEGIBLE[kind]} en {real.port}: valor actual <b>{real.value}</b></Text>
    </Group>
  );
}

/** Simulación de un sensor (contacto, ultrasónico o color) con el valor real al lado. */
export function SensorDemoBlock({ block }: Props) {
  const [pressed, setPressed] = useState(false);
  const [cm, setCm] = useState(50);
  const [surface, setSurface] = useState(SURFACES[0]);

  const threshold = block.threshold_cm ?? 10;
  const zone = block.zones?.length ? zoneFor(cm, block.zones) : null;
  const danger = zone ? false : cm < threshold;

  const value =
    block.sensor === 'touch' ? (pressed ? 'True' : 'False')
    : block.sensor === 'ultrasonic' ? `${cm} cm`
    : String(surface.value);

  const code = block.code_template
    ? fillTemplate(block.code_template, { value, threshold: String(threshold) })
    : null;

  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap="xs">
        <Text fw={600} fz="sm">{block.title ?? `Simulación: ${LEGIBLE[block.sensor]}`}</Text>

        {block.sensor === 'touch' && (
          <Button
            variant={pressed ? 'filled' : 'light'}
            color={pressed ? 'red' : 'gray'}
            onMouseDown={() => setPressed(true)}
            onMouseUp={() => setPressed(false)}
            onMouseLeave={() => setPressed(false)}
            onTouchStart={() => setPressed(true)}
            onTouchEnd={() => setPressed(false)}
          >
            {pressed ? 'PRESIONADO' : 'Mantén el clic aquí'}
          </Button>
        )}

        {block.sensor === 'ultrasonic' && (
          <>
            <Slider min={0} max={100} value={cm} onChange={setCm} label={null} />
            <svg viewBox="0 0 300 50" width="100%" style={{ background: 'rgba(127,127,127,0.1)', borderRadius: 8 }}>
              <rect x="0" y="5" width="10" height="40" fill="#555" />
              <rect x={10 + (260 - 34) * (cm / 100)} y="15" width="24" height="20" rx="4" fill={danger || zone?.label === 'PELIGRO' ? '#e05252' : '#007acc'} />
            </svg>
          </>
        )}

        {block.sensor === 'color' && (
          <Group gap={6}>
            {SURFACES.map(s => (
              <Button
                key={s.name}
                size="compact-xs"
                onClick={() => setSurface(s)}
                style={{ background: s.bg, color: s.fg, outline: surface.name === s.name ? '2px solid #007acc' : 'none' }}
              >
                {s.name}
              </Button>
            ))}
          </Group>
        )}

        <Group justify="space-between" wrap="nowrap" style={{ background: 'rgba(127,127,127,0.1)', borderRadius: 6, padding: '6px 10px' }}>
          <Text fz="xs" ff="monospace">{ATTR[block.sensor]}</Text>
          <Text fz="sm" fw={700} ff="monospace">{value}</Text>
        </Group>

        {zone && (
          <Group gap={6}>
            <Badge variant="light" color={zone.label === 'PELIGRO' ? 'red' : zone.label === 'LIBRE' ? 'green' : 'yellow'}>{zone.label}</Badge>
            <Text fz="xs">{zone.action}</Text>
          </Group>
        )}
        {!zone && block.sensor === 'ultrasonic' && (
          <Text fz="xs" c={danger ? 'red' : undefined}>
            {danger
              ? `A ${cm} cm el programa frenaría (umbral: ${threshold} cm).`
              : `A ${cm} cm todavía hay margen: el robot seguiría avanzando.`}
          </Text>
        )}

        {code && (
          <Text component="pre" ff="monospace" fz="xs" m={0} p="xs" style={{ background: '#14150F', color: '#E5E9DE', borderRadius: 6, whiteSpace: 'pre-wrap' }}>
            {code}
          </Text>
        )}

        <LiveSensor kind={block.sensor} />
      </Stack>
    </Paper>
  );
}

export default SensorDemoBlock;
