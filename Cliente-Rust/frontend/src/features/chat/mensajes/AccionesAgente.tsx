// features/chat/mensajes/AccionesAgente.tsx — lo que el agente hizo y la persona tiene que ver o decidir: un comando que
// guardó (con «Ver en Comandos»), un archivo que está bajando (con «Mostrar en la carpeta»), y lo que propuso y nunca hace
// solo: un cambio de pin o una subida al servidor (con Aplicar y Cancelar).
import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Boton, BotonPrincipal } from '@/components/ui';
import { commandClient } from '@/lib/command.service';
import { setPinMode, setPinPull, writePinLevel } from '@/features/hardware/gpio.service';
import { abrir } from '@/features/sesion/herramientasSesion';
import type { AgentStep } from '../modos/types';

const TARJETA = 'mt-2 flex flex-col gap-2 rounded-[max(2px,calc(var(--radius-md,8px)-2px))] border-[length:var(--card-border-width,1px)] border-ui-borde bg-ui-superficie px-3 py-2.5 text-[13px] text-ui-tinta';

export interface CambioPin { gpio: number; modo?: 'entrada' | 'salida'; pull?: 'arriba' | 'abajo' | 'ninguno'; nivel?: 0 | 1 }

/** Los cambios de pin que el agente propuso (y el backend dejó pendientes) en esta respuesta. */
export function cambiosPropuestos(pasos: AgentStep[]): CambioPin[] {
  const cambios: CambioPin[] = [];
  pasos.forEach((p, i) => {
    if (p.kind !== 'tool_call' || p.name !== 'cambiar_pin') return;
    const resultado = pasos.slice(i + 1).find((r) => r.kind === 'tool_result' && r.name === 'cambiar_pin');
    if (!resultado?.output?.startsWith('PENDIENTE DE CONFIRMAR')) return;
    try {
      const d = JSON.parse(p.input ?? '{}');
      if (typeof d.gpio === 'number') cambios.push({ gpio: d.gpio, modo: d.modo, pull: d.pull, nivel: d.nivel });
    } catch { /* paso sin datos legibles: no se ofrece */ }
  });
  return cambios;
}

/** Los comandos que el agente guardó en esta respuesta («Guardado en Comandos: «Nombre» (…)»). */
export function comandosGuardados(pasos: AgentStep[]): string[] {
  return pasos
    .filter((p) => p.kind === 'tool_result' && p.name === 'guardar_comando' && p.output?.startsWith('Guardado en Comandos'))
    .map((p) => /«(.+?)»/.exec(p.output ?? '')?.[1] ?? 'el comando');
}

export interface Subida { local: string; remota: string }

const nombreDe = (ruta: string) => ruta.split(/[\\/]/).filter(Boolean).pop() ?? ruta;

/** Las subidas que el agente propuso y el backend dejó pendientes. Si la ruta remota termina en /, va con el mismo nombre. */
export function subidasPropuestas(pasos: AgentStep[]): Subida[] {
  const subidas: Subida[] = [];
  pasos.forEach((p, i) => {
    if (p.kind !== 'tool_call' || p.name !== 'subir_archivo') return;
    const resultado = pasos.slice(i + 1).find((r) => r.kind === 'tool_result' && r.name === 'subir_archivo');
    if (!resultado?.output?.startsWith('PENDIENTE DE CONFIRMAR')) return;
    try {
      const d = JSON.parse(p.input ?? '{}');
      if (typeof d.ruta_local !== 'string' || typeof d.ruta_remota !== 'string') return;
      subidas.push({ local: d.ruta_local, remota: d.ruta_remota.endsWith('/') ? `${d.ruta_remota}${nombreDe(d.ruta_local)}` : d.ruta_remota });
    } catch { /* paso sin datos legibles: no se ofrece */ }
  });
  return subidas;
}

/** Las descargas que el agente empezó: la ruta local donde queda cada una. */
export function descargasEmpezadas(pasos: AgentStep[]): string[] {
  return pasos
    .filter((p) => p.kind === 'tool_result' && p.name === 'descargar_archivo' && p.output?.startsWith('DESCARGANDO a '))
    .map((p) => p.output!.slice('DESCARGANDO a '.length).split(' (desde ')[0]);
}

export const textoCambio = (c: CambioPin) => [
  c.modo && `modo ${c.modo}`, c.pull && `pull ${c.pull}`, c.nivel != null && `nivel ${c.nivel ? 'alto' : 'bajo'}`,
].filter(Boolean).join(', ');

export default function AccionesAgente({ pasos, sessionId }: { pasos: AgentStep[]; sessionId?: string | null }) {
  const guardados = comandosGuardados(pasos);
  const cambios = cambiosPropuestos(pasos);
  const descargas = descargasEmpezadas(pasos);
  const subidas = subidasPropuestas(pasos);
  if (!guardados.length && !cambios.length && !descargas.length && !subidas.length) return null;
  return (
    <>
      {guardados.map((t, i) => (
        <div key={`g${i}`} className={`${TARJETA} !flex-row items-center justify-between`}>
          <span>Guardé «{t}» en Comandos.</span>
          {sessionId && <Boton className="!h-7 !px-2.5 !text-[12px]" onClick={() => abrir(sessionId, 'comandos')}>Ver en Comandos</Boton>}
        </div>
      ))}
      {descargas.map((ruta, i) => (
        <div key={`d${i}`} className={`${TARJETA} !flex-row items-center justify-between`}>
          <span className="min-w-0">Descargando «{nombreDe(ruta)}» a Descargas. El progreso se ve en Archivos.</span>
          <Boton className="!h-7 shrink-0 !px-2.5 !text-[12px]"
            onClick={() => invoke('local_reveal_in_explorer', { path: ruta }).catch(() => {})}>Mostrar en la carpeta</Boton>
        </div>
      ))}
      {sessionId && cambios.map((c, i) => <ConfirmarPin key={`p${i}`} cambio={c} sessionId={sessionId} />)}
      {sessionId && subidas.map((s, i) => <ConfirmarSubida key={`s${i}`} subida={s} sessionId={sessionId} />)}
    </>
  );
}

function ConfirmarPin({ cambio, sessionId }: { cambio: CambioPin; sessionId: string }) {
  const [estado, setEstado] = useState<'pendiente' | 'aplicando' | 'aplicado' | 'cancelado' | { error: string }>('pendiente');
  const aplicar = async () => {
    setEstado('aplicando');
    try {
      if (cambio.modo) await setPinMode(sessionId, cambio.gpio, cambio.modo === 'salida' ? 'output' : 'input');
      if (cambio.pull) await setPinPull(sessionId, cambio.gpio, cambio.pull === 'arriba' ? 'up' : cambio.pull === 'abajo' ? 'down' : 'none');
      if (cambio.nivel != null) await writePinLevel(sessionId, cambio.gpio, cambio.nivel);
      setEstado('aplicado');
    } catch (e) {
      setEstado({ error: String((e as any)?.message ?? e) });
    }
  };
  return (
    <div className={TARJETA} role="group" aria-label={`Cambio del GPIO ${cambio.gpio}`}>
      {estado === 'aplicado' ? (
        <span>Listo: GPIO {cambio.gpio} quedó con {textoCambio(cambio)}.</span>
      ) : estado === 'cancelado' ? (
        <span className="text-ui-tinta-2">Cancelado: el GPIO {cambio.gpio} no cambió.</span>
      ) : (
        <>
          <span>Voy a cambiar el GPIO {cambio.gpio}: {textoCambio(cambio)}.</span>
          {typeof estado === 'object' && <span className="text-ui-critico-texto">No se pudo aplicar: {estado.error}</span>}
          <span className="flex gap-2">
            <BotonPrincipal className="!h-7 !px-3 !text-[12px]" disabled={estado === 'aplicando'} onClick={() => void aplicar()}>
              {estado === 'aplicando' ? 'Aplicando…' : 'Aplicar'}
            </BotonPrincipal>
            <Boton className="!h-7 !px-3 !text-[12px]" disabled={estado === 'aplicando'} onClick={() => setEstado('cancelado')}>Cancelar</Boton>
          </span>
        </>
      )}
    </div>
  );
}

function ConfirmarSubida({ subida, sessionId }: { subida: Subida; sessionId: string }) {
  const [estado, setEstado] = useState<'pendiente' | 'subiendo' | 'enviada' | 'cancelada' | { error: string }>('pendiente');
  const aplicar = async () => {
    setEstado('subiendo');
    try {
      let esCarpeta = false;
      try { await invoke('local_list_dir', { path: subida.local }); esCarpeta = true; } catch { /* es un archivo */ }
      if (esCarpeta) await invoke('sftp_upload_dir_start', { id: sessionId, localPath: subida.local, remotePath: subida.remota });
      else await commandClient.invoke('sftp_upload_start', { id: sessionId, local_path: subida.local, remote_path: subida.remota });
      setEstado('enviada');
    } catch (e) {
      setEstado({ error: String((e as any)?.message ?? e) });
    }
  };
  return (
    <div className={TARJETA} role="group" aria-label={`Subir ${nombreDe(subida.local)}`}>
      {estado === 'enviada' ? (
        <span>Subiendo «{nombreDe(subida.local)}» a <span className="font-ui-num">{subida.remota}</span>. El progreso se ve en Archivos.</span>
      ) : estado === 'cancelada' ? (
        <span className="text-ui-tinta-2">Cancelado: no se subió nada.</span>
      ) : (
        <>
          <span>Voy a subir <span className="font-ui-num">{subida.local}</span> a <span className="font-ui-num">{subida.remota}</span>.</span>
          {typeof estado === 'object' && <span className="text-ui-critico-texto">No se pudo subir: {estado.error}</span>}
          <span className="flex gap-2">
            <BotonPrincipal className="!h-7 !px-3 !text-[12px]" disabled={estado === 'subiendo'} onClick={() => void aplicar()}>
              {estado === 'subiendo' ? 'Subiendo…' : 'Aplicar'}
            </BotonPrincipal>
            <Boton className="!h-7 !px-3 !text-[12px]" disabled={estado === 'subiendo'} onClick={() => setEstado('cancelada')}>Cancelar</Boton>
          </span>
        </>
      )}
    </div>
  );
}
