// components/practicas/linux/PasoCard.tsx — un paso de la práctica en el chat.
//
// La guía (qué toca ahora + cuántas acciones del paso van listas) ya NO vive
// aquí dentro: era una caja a mitad del mensaje y, apenas el estudiante bajaba
// a ver el video o la imagen, quedaba fuera de pantalla. Este componente solo
// reporta su estado (ver `onGuia`) y la muestra GuiaPractica, una fila fija de
// la columna del chat. Acá queda el material del paso y el botón o la caja que
// hay que usar, que late suave. Cuando el paso se completa queda resumido en
// una línea, que se puede volver a abrir.

import React, { useEffect, useMemo, useState } from 'react';
import { Button, Group, Stack, Text, UnstyledButton } from '@mantine/core';
import { ArrowRight, Check, ChevronDown, ChevronUp, Terminal } from 'lucide-react';
import type { LinuxBlock, LinuxValidationResult, LinuxValidationRule } from '../../../services/linuxPractice.service';
import { BlockView, CLASE_RESALTADA, STEP_GATE_EVENT } from './blocks/BlockRenderer';
import { accionActual, accionesDelPaso, guiarTerminal, instruccion, tituloDelPaso, type AccionPaso, type PasoPractica } from './ritmo';
import './pasos.css';

const EJERCICIOS = new Set<LinuxBlock['type']>([
  'wheels_sim', 'calculator', 'sensor_demo', 'state_machine', 'checklist', 'permissions_calculator',
]);

function comandoAprobado(block: Extract<LinuxBlock, { type: 'command_step' }>, rules: LinuxValidationRule[], result: LinuxValidationResult | null) {
  const rule = rules.find((r) => r.id === block.rule_id) ?? rules.find((r) => r.target === block.command);
  return !!rule && !!result?.results.find((r) => r.rule_id === rule.id)?.passed;
}

/** «Paso 3 de 8» con su barra de avance. Lo comparten los pasos y la evaluación final. */
export function EncabezadoPaso({ numero, total, titulo, derecha }: { numero: number; total: number; titulo: string; derecha?: React.ReactNode }) {
  return (
    <Stack gap={6} mb="sm">
      <Group justify="space-between" wrap="nowrap">
        <Text fz="xs" c="dimmed">Paso {numero} de {total}</Text>
        {derecha}
      </Group>
      <div className="paso-barra" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={numero}>
        <span style={{ width: `${Math.round((numero / Math.max(total, 1)) * 100)}%` }} />
      </div>
      <Text fz="md" fw={600} mt={2}>{titulo}</Text>
    </Stack>
  );
}

/** Primera letra en mayúscula: las instrucciones se escriben pensadas para ir después de «Ahora:». */
export function mayuscula(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Lo que reporta cada guía (de un paso o de la evaluación final) hacia la barra GuiaPractica. */
export interface DatosGuia {
  /** `tipo` elige el ícono de la barra (ver GuiaPractica). */
  acciones: { id: string; texto: string; tipo?: string }[];
  hechas: Set<string>;
  actual: string | null;
  ahora: React.ReactNode | null;
  /** «Paso 3 de 17», «Evaluación final»... */
  etiqueta?: string;
  extra?: React.ReactNode;
}

interface PasoCardProps {
  paso: PasoPractica;
  total: number;
  rules: LinuxValidationRule[];
  result: LinuxValidationResult | null;
  practiceId: string;
  /** Sesión SSH de la práctica: para marcar su terminal y darle el foco. */
  sessionId?: string | null;
  /** Reporta el estado de la guía hacia el header fijo del chat; `null` cuando no hay nada pendiente (completo o escondido). */
  onGuia?: (datos: DatosGuia | null) => void;
}

export function PasoCard({ paso, total, rules, result, practiceId, sessionId, onGuia }: PasoCardProps) {
  const acciones = useMemo(() => accionesDelPaso(paso), [paso]);
  // Lo que el estudiante hizo con el mouse (abrir media, tocar un ejercicio, «Siguiente paso»).
  const [hechasLocal, setHechasLocal] = useState<Set<string>>(() => new Set());
  // `null`: abierto mientras esté pendiente y resumido al completarse.
  const [abierto, setAbierto] = useState<boolean | null>(null);

  const marcar = (id: string) => setHechasLocal((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));

  const hechas = new Set(hechasLocal);
  for (const b of paso.bloques) {
    if (b.type === 'command_step' && comandoAprobado(b, rules, result)) hechas.add(b.id);
  }
  // Leer no tiene botón: cuenta como hecho apenas hace cualquier otra cosa del paso.
  if (acciones.some((a) => a.tipo !== 'leer' && hechas.has(a.id))) hechas.add('leer');

  const completo = paso.conBoton
    ? hechas.has('siguiente')
    : paso.bloques.every((b) => b.type !== 'command_step' || hechas.has(b.id));
  if (completo) hechas.add('leer');

  const titulo = tituloDelPaso(paso);
  const etiquetaBoton = paso.etiquetaBoton ?? 'Siguiente paso';

  // Todo esto va antes del `return` del resumen colapsado: los hooks de abajo
  // (guiar la terminal, reportar la guía) tienen que llamarse siempre, en el
  // mismo orden, sin importar si el paso ya está completo.
  const { actual, resaltada } = completo ? { actual: null, resaltada: null } : accionActual(acciones, hechas);
  const pideTerminal = resaltada?.tipo === 'comando' || resaltada?.tipo === 'reto';
  useEffect(() => {
    if (!sessionId) return;
    guiarTerminal({ sessionId, origen: paso.id, resaltar: pideTerminal });
    return () => guiarTerminal({ sessionId, origen: paso.id, resaltar: false });
  }, [sessionId, paso.id, pideTerminal]);

  const textoAhora = (a: AccionPaso | null, r: AccionPaso | null) => {
    if (!a) return null;
    if (a.tipo === 'leer' && r) return `lee la explicación del paso. Cuando termines, ${instruccion(r, etiquetaBoton)}`;
    return instruccion(a, etiquetaBoton);
  };
  const textoAhoraCrudo = textoAhora(actual, resaltada);
  const ahora = textoAhoraCrudo ? mayuscula(textoAhoraCrudo) : null;

  // «La terminal» no le dice nada a quien nunca la usó: en el primer comando
  // del módulo se explica qué es y dónde está; siempre se ofrece llevarlo ahí.
  const ayudaTerminal = pideTerminal && (
    <>
      {paso.primerComando && (
        <span>
          La <strong>terminal</strong> es un recuadro donde le das órdenes al computador escribiéndolas, en vez de usar el mouse.
          Es el recuadro grande a la izquierda de este chat: ahí verás el aviso «Escribe aquí» junto al cursor.
        </span>
      )}
      {sessionId && (
        <Group>
          <Button
            size="compact-xs"
            variant="light"
            leftSection={<Terminal size={13} />}
            onClick={() => guiarTerminal({ sessionId, origen: paso.id, enfocar: true })}
          >
            Ir a la terminal
          </Button>
        </Group>
      )}
    </>
  );

  useEffect(() => {
    onGuia?.(completo ? null : {
      acciones,
      hechas,
      actual: actual?.id ?? null,
      ahora,
      etiqueta: `Paso ${paso.numero} de ${total}`,
      extra: ayudaTerminal || undefined,
    });
  }, [onGuia, completo, acciones, hechas, actual, ahora, paso.numero, total, ayudaTerminal]);

  if (completo && abierto !== true) {
    return (
      <UnstyledButton onClick={() => setAbierto(true)} style={{ width: '100%' }} aria-label={`Ver de nuevo el paso ${paso.numero}`}>
        <Group gap={8} wrap="nowrap" py={4}>
          <Check size={16} color="var(--success, #22C55E)" style={{ flexShrink: 0 }} />
          <Text fz="sm" c="dimmed" style={{ flex: 1 }}>Paso {paso.numero} · {titulo}</Text>
          <Text fz="xs" c="dimmed">Ver de nuevo</Text>
          <ChevronDown size={14} />
        </Group>
      </UnstyledButton>
    );
  }

  const bloque = (b: LinuxBlock) => {
    const vista = (
      <BlockView
        key={b.id}
        block={b}
        rules={rules}
        result={result}
        practiceId={practiceId}
        resaltar={resaltada?.id === b.id}
        onAbierto={() => marcar(b.id)}
      />
    );
    if (!EJERCICIOS.has(b.type)) return vista;
    return (
      <div key={b.id} onPointerDown={() => marcar(b.id)} className={resaltada?.id === b.id ? CLASE_RESALTADA : undefined} style={{ borderRadius: 8 }}>
        {vista}
      </div>
    );
  };

  return (
    // Sin tarjeta propia: el paso ya vive dentro de la burbuja del mensaje (caja dentro de caja era ruido).
    <div style={{ width: '100%' }}>
      <EncabezadoPaso
        numero={paso.numero}
        total={total}
        titulo={titulo}
        derecha={completo && (
          <UnstyledButton onClick={() => setAbierto(false)}>
            <Group gap={4}><Text fz="xs" c="dimmed">Ocultar</Text><ChevronUp size={14} /></Group>
          </UnstyledButton>
        )}
      />
      <Stack gap="sm">
        {paso.bloques.map(bloque)}
        {paso.conBoton && !completo && (
          <Group>
            <Button
              rightSection={<ArrowRight size={15} />}
              className={resaltada?.tipo === 'siguiente' ? CLASE_RESALTADA : undefined}
              disabled={actual?.tipo !== 'siguiente'}
              onClick={() => {
                marcar('siguiente');
                document.dispatchEvent(new CustomEvent(STEP_GATE_EVENT, { detail: { id: paso.id } }));
              }}
            >
              {etiquetaBoton}
            </Button>
          </Group>
        )}
      </Stack>
    </div>
  );
}
