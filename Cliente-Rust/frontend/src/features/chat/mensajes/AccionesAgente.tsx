// features/chat/mensajes/AccionesAgente.tsx — lo que el agente hizo y la persona tiene que ver o decidir: un comando que
// guardó (con «Ver en Comandos»), un archivo que está bajando (con «Mostrar en la carpeta»), y lo que propuso y nunca hace
// solo: un cambio de pin o una subida al servidor (con Aplicar y Cancelar). Cada paso trae su `accion` desde el backend
// (AccionAgente): aquí no se lee el texto que va para el modelo.
import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Boton, BotonPrincipal } from '@/components/ui';
import type { AccionAgente } from '@/bindings/AccionAgente';
import { setPinMode, setPinPull, writePinLevel } from '@/features/hardware/gpio.service';
import { abrir } from '@/features/sesion/herramientasSesion';
import type { AgentStep } from '../modos/types';

const TARJETA = 'mt-2 flex flex-col gap-2 rounded-[max(2px,calc(var(--radius-md,8px)-2px))] border-[length:var(--card-border-width,1px)] border-ui-borde bg-ui-superficie px-3 py-2.5 text-[13px] text-ui-tinta';

type De<T extends AccionAgente['tipo']> = Extract<AccionAgente, { tipo: T }>;

/** Las acciones de un tipo que trajeron los pasos de una respuesta. */
export const accionesDe = <T extends AccionAgente['tipo']>(pasos: AgentStep[], tipo: T): De<T>[] =>
  pasos.map((p) => p.accion).filter((a): a is De<T> => a?.tipo === tipo);

const nombreDe = (ruta: string) => ruta.split(/[\\/]/).filter(Boolean).pop() ?? ruta;

export const textoCambio = (c: De<'cambioPin'>) => [
  c.modo && `modo ${c.modo}`, c.pull && `pull ${c.pull}`, c.nivel != null && `nivel ${c.nivel ? 'alto' : 'bajo'}`,
].filter(Boolean).join(', ');

export default function AccionesAgente({ pasos, sessionId }: { pasos: AgentStep[]; sessionId?: string | null }) {
  const guardados = accionesDe(pasos, 'comandoGuardado');
  const descargas = accionesDe(pasos, 'descarga');
  const cambios = accionesDe(pasos, 'cambioPin');
  const subidas = accionesDe(pasos, 'subida');
  if (!guardados.length && !descargas.length && !cambios.length && !subidas.length) return null;
  return (
    <>
      {guardados.map((g, i) => (
        <div key={`g${i}`} className={`${TARJETA} !flex-row items-center justify-between`}>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span>Guardé «{g.titulo}» en Comandos.</span>
            {g.descripcion && <span className="text-[12px] text-ui-tinta-2">{g.descripcion}</span>}
          </span>
          {sessionId && <Boton className="!h-7 !px-2.5 !text-[12px]" onClick={() => abrir(sessionId, 'comandos')}>Ver en Comandos</Boton>}
        </div>
      ))}
      {descargas.map((d, i) => (
        <div key={`d${i}`} className={`${TARJETA} !flex-row items-center justify-between`}>
          <span className="min-w-0">Descargando «{nombreDe(d.rutaLocal)}» a Descargas. El progreso se ve en Archivos.</span>
          <Boton className="!h-7 shrink-0 !px-2.5 !text-[12px]"
            onClick={() => invoke('local_reveal_in_explorer', { path: d.rutaLocal }).catch(() => {})}>Mostrar en la carpeta</Boton>
        </div>
      ))}
      {sessionId && cambios.map((c, i) => <ConfirmarPin key={`p${i}`} cambio={c} sessionId={sessionId} />)}
      {sessionId && subidas.map((s, i) => <ConfirmarSubida key={`s${i}`} subida={s} sessionId={sessionId} />)}
    </>
  );
}

type Estado = 'pendiente' | 'aplicando' | 'hecho' | 'cancelado' | { error: string };

/** Aplicar y Cancelar: lo que el agente propuso solo pasa cuando la persona lo aplica. */
function Confirmar({ texto, hecho, cancelado, nombre, aplicar }: {
  texto: React.ReactNode; hecho: React.ReactNode; cancelado: string; nombre: string; aplicar: () => Promise<void>;
}) {
  const [estado, setEstado] = useState<Estado>('pendiente');
  const pulsar = async () => {
    setEstado('aplicando');
    try {
      await aplicar();
      setEstado('hecho');
    } catch (e) {
      setEstado({ error: String((e as any)?.message ?? e) });
    }
  };
  return (
    <div className={TARJETA} role="group" aria-label={nombre}>
      {estado === 'hecho' ? <span>{hecho}</span>
        : estado === 'cancelado' ? <span className="text-ui-tinta-2">{cancelado}</span>
        : (
          <>
            <span>{texto}</span>
            {typeof estado === 'object' && <span className="text-ui-critico-texto">No se pudo: {estado.error}</span>}
            <span className="flex gap-2">
              <BotonPrincipal className="!h-7 !px-3 !text-[12px]" disabled={estado === 'aplicando'} onClick={() => void pulsar()}>
                {estado === 'aplicando' ? 'Aplicando…' : 'Aplicar'}
              </BotonPrincipal>
              <Boton className="!h-7 !px-3 !text-[12px]" disabled={estado === 'aplicando'} onClick={() => setEstado('cancelado')}>Cancelar</Boton>
            </span>
          </>
        )}
    </div>
  );
}

function ConfirmarPin({ cambio, sessionId }: { cambio: De<'cambioPin'>; sessionId: string }) {
  return (
    <Confirmar nombre={`Cambio del GPIO ${cambio.gpio}`}
      texto={<>Voy a cambiar el GPIO {cambio.gpio}: {textoCambio(cambio)}.</>}
      hecho={<>Listo: GPIO {cambio.gpio} quedó con {textoCambio(cambio)}.</>}
      cancelado={`Cancelado: el GPIO ${cambio.gpio} no cambió.`}
      aplicar={async () => {
        if (cambio.modo) await setPinMode(sessionId, cambio.gpio, cambio.modo === 'salida' ? 'output' : 'input');
        if (cambio.pull) await setPinPull(sessionId, cambio.gpio, cambio.pull === 'arriba' ? 'up' : cambio.pull === 'abajo' ? 'down' : 'none');
        if (cambio.nivel != null) await writePinLevel(sessionId, cambio.gpio, cambio.nivel ? 1 : 0);
      }} />
  );
}

function ConfirmarSubida({ subida, sessionId }: { subida: De<'subida'>; sessionId: string }) {
  return (
    <Confirmar nombre={`Subir ${nombreDe(subida.rutaLocal)}`}
      texto={<>Voy a subir {subida.esCarpeta ? 'la carpeta' : 'el archivo'} <span className="font-ui-num">{subida.rutaLocal}</span> a <span className="font-ui-num">{subida.rutaRemota}</span>.</>}
      hecho={<>Subiendo «{nombreDe(subida.rutaLocal)}» a <span className="font-ui-num">{subida.rutaRemota}</span>. El progreso se ve en Archivos.</>}
      cancelado="Cancelado: no se subió nada."
      // El backend decide archivo o carpeta (sftp_subir); la ruta remota ya viene con el nombre
      aplicar={() => invoke('sftp_subir', { id: sessionId, rutaLocal: subida.rutaLocal, rutaRemota: subida.rutaRemota })} />
  );
}
