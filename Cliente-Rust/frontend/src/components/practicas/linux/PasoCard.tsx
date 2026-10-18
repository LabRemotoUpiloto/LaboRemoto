// components/practicas/linux/PasoCard.tsx — un paso de la práctica en el chat.
//
// Cada paso dice con palabras qué hacer con una sola guía: la lista de
// acciones (hechas, la actual y las que faltan) donde la fila de la acción
// actual se actualiza sola con la instrucción puntual («Ahora: ...»), y el
// botón o la caja que hay que usar late suave. Cuando el paso se completa
// queda resumido en una línea, que se puede volver a abrir.

import React, { useEffect, useMemo, useState } from 'react';
import { Button, Group, Paper, Stack, Text, UnstyledButton } from '@mantine/core';
import { ArrowRight, Check, ChevronDown, ChevronUp, Circle, Pointer, Terminal } from 'lucide-react';
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

/**
 * Guía del paso en un solo bloque: la lista de acciones (hechas con visto
 * bueno, las que faltan en gris) donde la fila de la acción actual no se
 * queda con su etiqueta genérica («Abre la imagen») sino que se actualiza con
 * la instrucción puntual de qué hacer con ella. Evita repetir la explicación
 * que ya se mostró arriba en una franja aparte.
 */
export function GuiaPaso({ acciones, hechas, actual, ahora, extra }: {
  acciones: { id: string; texto: string }[];
  hechas: Set<string>;
  actual: string | null;
  /** Instrucción puntual de la acción actual; si falta, se usa su etiqueta genérica. */
  ahora?: React.ReactNode | null;
  extra?: React.ReactNode;
}) {
  return (
    <div className="paso-guia" data-tour="practica-guia">
      <Stack gap={6}>
        {acciones.map((a) => {
          const hecha = hechas.has(a.id);
          const esActual = a.id === actual;
          return (
            <Group key={a.id} gap={8} wrap="nowrap" align="flex-start">
              {hecha
                ? <Check size={15} color="var(--success, #22C55E)" style={{ flexShrink: 0, marginTop: 2 }} />
                : esActual
                  ? <Pointer size={15} style={{ flexShrink: 0, marginTop: 2 }} />
                  : <Circle size={13} style={{ flexShrink: 0, opacity: 0.5, margin: '0 1px', marginTop: 3 }} />}
              <Text fz="sm" fw={esActual ? 600 : 400} c={hecha ? 'teal' : esActual ? undefined : 'dimmed'} style={{ minWidth: 0 }}>
                {esActual && ahora ? ahora : a.texto}
              </Text>
            </Group>
          );
        })}
      </Stack>
      {extra}
    </div>
  );
}

interface PasoCardProps {
  paso: PasoPractica;
  total: number;
  rules: LinuxValidationRule[];
  result: LinuxValidationResult | null;
  practiceId: string;
  /** Sesión SSH de la práctica: para marcar su terminal y darle el foco. */
  sessionId?: string | null;
}

export function PasoCard({ paso, total, rules, result, practiceId, sessionId }: PasoCardProps) {
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

  // Mientras toque escribir en la terminal, se marca la terminal real (ver TerminalView).
  const pendiente = completo ? null : accionActual(acciones, hechas).resaltada;
  const pideTerminal = pendiente?.tipo === 'comando' || pendiente?.tipo === 'reto';
  useEffect(() => {
    if (!sessionId) return;
    guiarTerminal({ sessionId, origen: paso.id, resaltar: pideTerminal });
    return () => guiarTerminal({ sessionId, origen: paso.id, resaltar: false });
  }, [sessionId, paso.id, pideTerminal]);

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

  const { actual, resaltada } = completo ? { actual: null, resaltada: null } : accionActual(acciones, hechas);
  const textoAhora = (a: AccionPaso | null, r: AccionPaso | null) => {
    if (!a) return null;
    if (a.tipo === 'leer' && r) return `lee la explicación de arriba. Cuando termines, ${instruccion(r, etiquetaBoton)}`;
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
            size="xs"
            variant="white"
            leftSection={<Terminal size={14} />}
            onClick={() => guiarTerminal({ sessionId, origen: paso.id, enfocar: true })}
          >
            Ir a la terminal
          </Button>
        </Group>
      )}
    </>
  );

  // La guía va después del primer texto, antes del material y del comando:
  // primero se lee de qué se trata y enseguida qué hacer.
  const corte = paso.bloques.findIndex((b) => b.type !== 'text');
  const antes = corte === -1 ? paso.bloques : paso.bloques.slice(0, corte);
  const despues = corte === -1 ? [] : paso.bloques.slice(corte);

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
    <Paper withBorder radius="md" p="md" style={{ width: '100%' }}>
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
        {antes.map(bloque)}
        {!completo && (
          <GuiaPaso acciones={acciones} hechas={hechas} actual={actual?.id ?? null} ahora={ahora} extra={ayudaTerminal || undefined} />
        )}
        {despues.map(bloque)}
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
    </Paper>
  );
}
