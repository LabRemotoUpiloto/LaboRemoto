// features/circuitos/PracticaCircuitoVista.tsx — una práctica de circuitos abierta, como las demás: el chat la entrega (bienvenida y un
// paso a la vez, con la barra «Ahora» arriba) y al lado está el simulador del laboratorio en un iframe (servicio aparte, ver
// simulador.ts). El tutor del chat recibe en cada respuesta la práctica, el paso y el circuito del estudiante (contextoCircuito.ts).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import { Aviso, Boton, ETIQUETA } from '@/components/ui';
import ChatPane from '@/features/chat/ChatPane';
import { evaluar, type Resultado } from './comprobaciones';
import { contextoTutorCircuito } from './contextoCircuito';
import {
  PracticaEnCursoContext, comprobacionesCumplidas, guardarLogrados, leerLogrados, marcarCompletada, pasoActual, reiniciarSiNoTermino,
  type PracticaEnCurso,
} from './practicaEnCurso';
import { circuitoInicial, type PracticaCircuito } from './practicas';
import { URL_SIMULADOR, useSimulador, type EstadoSimulador } from './simulador';
import { useTourPracticaCircuito } from './tour/useTourPracticaCircuito';

export default function PracticaCircuitoVista({ practica, onVolver }: { practica: PracticaCircuito; onVolver: () => void }) {
  const { marco, src, conexion, estado, error, cargar } = useSimulador(circuitoInicial(practica));
  const resultados = useMemo(
    () => Object.fromEntries(practica.checks.map((c) => [c.id, evaluar(c, estado)])) as Record<string, Resultado>,
    [practica, estado],
  );

  // Pasos logrados. Una práctica sin terminar empieza de cero al abrirla (pasos y chat); una terminada se ve como quedó.
  // Solo se logra el paso en curso: van en orden.
  const [logrados, setLogrados] = useState<Set<string>>(() => {
    reiniciarSiNoTermino(practica.id);
    return leerLogrados(practica.id);
  });
  const actual = pasoActual(practica, logrados);
  const lograr = useCallback((pasoId: string) => {
    setLogrados((prev) => {
      if (prev.has(pasoId)) return prev;
      const nuevo = new Set(prev).add(pasoId);
      guardarLogrados(practica.id, nuevo);
      return nuevo;
    });
  }, [practica.id]);
  useEffect(() => {
    if (actual && comprobacionesCumplidas(resultados, actual)) lograr(actual.id);
  }, [actual, resultados, lograr]);
  useEffect(() => {
    if (!actual) marcarCompletada(practica.id);
  }, [actual, practica.id]);

  const enCurso: PracticaEnCurso = {
    practica, estado, resultados, logrados,
    pulsar: (pasoId) => { if (actual?.id === pasoId) lograr(pasoId); },
  };

  // el tutor lee el circuito y el paso en el momento de responder, no los de cuando se armó la función
  const vivo = useRef<{ estado: EstadoSimulador | null; logrados: Set<string> }>({ estado, logrados });
  vivo.current = { estado, logrados };
  const contexto = useCallback(() => contextoTutorCircuito(practica, vivo.current.estado, vivo.current.logrados), [practica]);
  const pasos = useMemo(() => practica.steps.map((s) => s.id), [practica]);
  useTourPracticaCircuito(conexion === 'listo');

  return (
    <PracticaEnCursoContext.Provider value={enCurso}>
      <div className="flex h-full min-h-0 bg-ui-fondo">
        <section className="flex min-w-0 flex-1 flex-col" aria-label="Simulador de circuitos">
          <header className="flex shrink-0 items-center gap-3 border-b border-ui-borde bg-ui-superficie px-4 py-2">
            <Boton onClick={onVolver}><ArrowLeft size={14} aria-hidden /> Prácticas de circuitos</Boton>
            <h1 className="m-0 min-w-0 flex-1 truncate font-ui-titulo text-[15px] font-bold text-ui-tinta" title={practica.title}>{practica.title}</h1>
            <Boton data-tour="circuito-reiniciar" onClick={cargar} disabled={conexion !== 'listo'} title="Vuelve a poner las piezas como al principio (el avance de la práctica se mantiene)">
              <RotateCcw size={14} aria-hidden /> Empezar el circuito de nuevo
            </Boton>
          </header>
          <div className="relative min-h-0 flex-1" data-tour="circuito-simulador">
            <iframe ref={marco} src={src} title="Simulador de circuitos" className="h-full w-full border-0 bg-ui-superficie" />
            {conexion !== 'listo' && (
              <div className="absolute inset-0 flex items-center justify-center bg-ui-fondo p-8">
                {conexion === 'cargando'
                  ? <p className="m-0 text-[13px] text-ui-apagado" role="status">Abriendo el simulador…</p>
                  : <div className="w-full max-w-[460px]"><Aviso nivel="critico" titulo="No se pudo abrir el simulador"
                      detalle={<>No responde el servicio de circuitos en <span className="font-ui-num">{URL_SIMULADOR}</span>. Revisa que esté corriendo.</>} /></div>}
              </div>
            )}
            {error && <p className={`${ETIQUETA} absolute bottom-3 left-3 text-ui-critico-texto`} role="alert">{error}</p>}
          </div>
        </section>

        <section className="flex w-[420px] shrink-0 flex-col border-l border-ui-borde" aria-label="Práctica y tutor" data-tour="practica-chat">
          <ChatPane circuito={{ id: practica.id, contexto, intro: practica.intro, outro: practica.outro, pasos, logrados }} />
        </section>
      </div>
    </PracticaEnCursoContext.Provider>
  );
}
