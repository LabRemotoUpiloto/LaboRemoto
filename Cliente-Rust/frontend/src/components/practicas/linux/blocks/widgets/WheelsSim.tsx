import React, { useEffect, useRef, useState } from 'react';
import { Button, Group, Paper, Slider, Stack, Text } from '@mantine/core';
import type { LinuxBlock } from '../../../../../services/linuxPractice.service';

const LIMITE_PX = 60; // hasta dónde llega el robot antes de reaparecer del otro lado

/** Qué le pasa al robot dado un par de potencias, en palabras simples. */
export function describirMovimiento(izq: number, der: number): string {
  if (izq === 0 && der === 0) return 'El robot está detenido: ningún motor recibe potencia.';
  if (izq === der) {
    return izq > 0
      ? 'Las dos ruedas giran igual, hacia adelante: el robot avanza en línea recta.'
      : 'Las dos ruedas giran igual, hacia atrás: el robot retrocede en línea recta.';
  }
  if (izq === -der) {
    return der > 0
      ? 'Las ruedas giran en sentidos opuestos con la misma fuerza: el robot gira sobre su propio eje, hacia la izquierda.'
      : 'Las ruedas giran en sentidos opuestos con la misma fuerza: el robot gira sobre su propio eje, hacia la derecha.';
  }
  if (Math.sign(izq) !== Math.sign(der) && izq !== 0 && der !== 0) {
    return 'Las ruedas giran en sentidos opuestos y con distinta fuerza: el robot gira sobre sí mismo, más rápido hacia un lado que hacia el otro.';
  }
  const adelante = izq + der > 0;
  return izq > der
    ? `El motor izquierdo gira más fuerte que el derecho: el robot ${adelante ? 'avanza' : 'retrocede'} trazando una curva hacia la derecha.`
    : `El motor derecho gira más fuerte que el izquierdo: el robot ${adelante ? 'avanza' : 'retrocede'} trazando una curva hacia la izquierda.`;
}

/**
 * Simulador de movimientos básicos: dos potencias (una por rueda) y un robot
 * de juguete que se mueve en consecuencia. Solo ilustra, no habla con el robot.
 */
export function WheelsSimBlock({ block }: { block: Extract<LinuxBlock, { type: 'wheels_sim' }> }) {
  const [izq, setIzq] = useState(50);
  const [der, setDer] = useState(50);
  const [pose, setPose] = useState({ x: 0, y: 0, th: -90 });

  // Las potencias viven también en un ref para que el bucle de animación lea
  // siempre el valor más reciente sin reiniciarse con cada movimiento del slider.
  const potRef = useRef({ izq, der });
  potRef.current = { izq, der };

  useEffect(() => {
    let frame = 0;
    let ultimo = performance.now();
    const tick = (ahora: number) => {
      const dt = Math.min((ahora - ultimo) / 1000, 0.1);
      ultimo = ahora;
      const { izq: l, der: r } = potRef.current;
      setPose(p => {
        const v = ((l + r) / 2) * 0.25; // px/s, solo para que se vea bien: no es físico
        const w = ((r - l) / 40) * 60; // °/s
        const rad = (p.th * Math.PI) / 180;
        let x = p.x + v * dt * Math.cos(rad);
        let y = p.y + v * dt * Math.sin(rad);
        if (x > LIMITE_PX) x = -LIMITE_PX;
        if (x < -LIMITE_PX) x = LIMITE_PX;
        if (y > LIMITE_PX) y = -LIMITE_PX;
        if (y < -LIMITE_PX) y = LIMITE_PX;
        return { x, y, th: p.th + w * dt };
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  const preset = (l: number, r: number) => { setIzq(l); setDer(r); };

  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap="xs">
        <Text fw={600} fz="sm">{block.title ?? 'Simulador de ruedas'}</Text>
        <Group justify="space-between"><Text fz="xs">Rueda izquierda</Text><Text fz="xs" ff="monospace">{izq}%</Text></Group>
        <Slider min={-100} max={100} value={izq} onChange={setIzq} label={null} />
        <Group justify="space-between"><Text fz="xs">Rueda derecha</Text><Text fz="xs" ff="monospace">{der}%</Text></Group>
        <Slider min={-100} max={100} value={der} onChange={setDer} label={null} />
        <Group gap={6}>
          <Button size="compact-xs" variant="light" onClick={() => preset(50, 50)}>Adelante</Button>
          <Button size="compact-xs" variant="light" onClick={() => preset(-50, 50)}>Girar izq.</Button>
          <Button size="compact-xs" variant="light" onClick={() => preset(50, -50)}>Girar der.</Button>
          <Button size="compact-xs" variant="light" color="gray" onClick={() => preset(0, 0)}>Detener</Button>
        </Group>
        <svg viewBox="0 0 150 150" width="100%" style={{ maxHeight: 150, background: 'rgba(127,127,127,0.1)', borderRadius: 8 }}>
          <g transform={`translate(${75 + pose.x} ${75 + pose.y}) rotate(${pose.th + 90})`}>
            <rect x="-10" y="-14" width="20" height="28" rx="4" fill="#007acc" />
            <polygon points="0,-20 -6,-12 6,-12" fill="#4ec94e" />
          </g>
        </svg>
        <Text fz="sm" style={{ lineHeight: 1.5 }}>{describirMovimiento(izq, der)}</Text>
      </Stack>
    </Paper>
  );
}

export default WheelsSimBlock;
