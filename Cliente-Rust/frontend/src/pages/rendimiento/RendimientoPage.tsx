// pages/rendimiento/RendimientoPage.tsx — Monitoreo del laboratorio (solo admin_lab).
//
// Primero «Equipos del laboratorio» (Pi 4 y cámaras con datos; Pi 5, Jetson y domótica todavía no
// envían). Desde la Pi 4 se abre su detalle en cuatro pestañas: Estado, Gráficas, Registros y Procesos.
// «Iniciar prueba» marca el comienzo de una prueba de carga; al terminar se ve con cuántos estudiantes
// algo llegó a crítico y se puede guardar en Excel. Los datos salen de metrics_svc.py en la Pi.
import React, { useMemo, useState } from 'react';
import { iniciarPrueba, terminarPrueba, usePrueba } from '../../services/pruebaRendimiento';
import RegistrosPanel from './RegistrosPanel';
import EquiposVista from './EquiposVista';
import EstadoPestana from './EstadoPestana';
import GraficasPestana from './GraficasPestana';
import ProcesosPestana from './ProcesosPestana';
import { guardarExcelDePrueba } from './exportarPrueba';
import { resumirPrueba, unirMuestras } from './rendimientoStats';
import { duracion, estadoPi, hora24 } from './monitoreo';
import { ETIQUETA, Punto } from './Piezas';
import { useCamaras, useInformePi } from './useDatosLab';

type Vista = 'equipos' | 'pi4';
type Pestana = 'estado' | 'graficas' | 'registros' | 'procesos';
const PESTANAS: { valor: Pestana; etiqueta: string }[] = [
  { valor: 'estado', etiqueta: 'Estado' },
  { valor: 'graficas', etiqueta: 'Gráficas' },
  { valor: 'registros', etiqueta: 'Registros' },
  { valor: 'procesos', etiqueta: 'Procesos' },
];
// Comodidades del equipo: si no hay almacenamiento, se abre en Equipos / Estado.
const CLAVE_VISTA = 'labo:monitoreo:vista';
const CLAVE_PESTANA = 'labo:rendimiento:pestana';

function leer<T extends string>(clave: string, validos: readonly T[], porDefecto: T): T {
  try {
    const v = localStorage.getItem(clave) as T | null;
    return v && validos.includes(v) ? v : porDefecto;
  } catch { return porDefecto; }
}
function recordar(clave: string, valor: string) {
  try { localStorage.setItem(clave, valor); } catch { /* sin almacenamiento: no pasa nada */ }
}

const RendimientoPage: React.FC<{ onOpenPanel?: (id: string) => void }> = ({ onOpenPanel }) => {
  const pi = useInformePi();
  const camaras = useCamaras();
  const { informe, muestras, ultima, error } = pi;
  // La prueba vive en el equipo (pruebaRendimiento.ts): sobrevive a cambiar de sección o cerrar la app.
  const prueba = usePrueba();
  const [vista, setVista] = useState<Vista>(() => leer(CLAVE_VISTA, ['equipos', 'pi4'] as const, 'equipos'));
  const [pestana, setPestana] = useState<Pestana>(() => leer(CLAVE_PESTANA, ['estado', 'graficas', 'registros', 'procesos'] as const, 'estado'));
  const [errorExcel, setErrorExcel] = useState<string | null>(null);
  const irA = (v: Vista) => { setVista(v); recordar(CLAVE_VISTA, v); };
  const elegirPestana = (p: Pestana) => { setPestana(p); recordar(CLAVE_PESTANA, p); };

  // Lo grabado en segundo plano más lo que esta página acaba de recibir (lo más fresco).
  const muestrasPrueba = useMemo(() => {
    if (!prueba) return [];
    const enTramo = muestras.filter((m) => m.t >= prueba.inicio && (prueba.fin == null || m.t <= prueba.fin));
    return unirMuestras(prueba.muestras, enTramo, Number.MAX_SAFE_INTEGER);
  }, [muestras, prueba]);
  const resumen = useMemo(() => (prueba?.fin ? resumirPrueba(muestrasPrueba) : null), [prueba, muestrasPrueba]);

  const guardarExcel = async () => {
    if (!resumen) return;
    try {
      await guardarExcelDePrueba(muestrasPrueba, resumen);
      setErrorExcel(null);
    } catch (e: any) {
      setErrorExcel(`No se pudo guardar el Excel: ${e?.message ?? String(e)}`);
    }
  };

  if (vista === 'equipos') {
    return (
      <div className="flex h-full flex-col overflow-y-auto bg-mon-fondo text-mon-tinta">
        <EquiposVista pi={pi} camaras={camaras} onAbrirPi4={() => irA('pi4')} onAbrirVigilancia={() => onOpenPanel?.('vigilancia')} />
      </div>
    );
  }

  const estado = estadoPi(ultima, informe?.servicios, error);
  const pruebaEnCurso = !!prueba && prueba.fin == null;
  const encendida = informe?.info.encendida_desde;
  const resto = [
    estado.resto,
    pruebaEnCurso && 'prueba en curso',
    encendida && !error && `encendida hace ${duracion(Date.now() / 1000 - encendida)}`,
    ultima && `actualizado ${hora24(ultima.t)}`,
  ].filter(Boolean).join(' · ');

  return (
    // Arriba lo fijo (migas, título, estado y pestañas); abajo la pestaña con su propio scroll.
    <div className="flex h-full flex-col bg-mon-fondo text-mon-tinta">
      <header className="shrink-0">
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-2 px-6 pt-8">
          <nav aria-label="Ruta" className={ETIQUETA}>
            <button type="button" onClick={() => irA('equipos')} className="cursor-pointer border-none bg-transparent p-0 font-bold uppercase tracking-[0.08em] text-mon-apagado hover:text-mon-tinta-2">
              Equipos
            </button>
            <span aria-hidden>  /  </span>
            <span>Raspberry Pi 4</span>
          </nav>
          <h1 className="m-0 font-mon-titulo text-2xl font-bold text-mon-tinta">Raspberry Pi 4</h1>
          <Punto nivel={estado.nivel} fuerte={estado.fuerte} resto={resto && `· ${resto}`} />
          <div role="tablist" aria-label="Secciones de la Pi 4" className="mt-4 flex gap-2 border-b border-mon-pista">
            {PESTANAS.map((p) => (
              <button key={p.valor} type="button" role="tab" aria-selected={pestana === p.valor} onClick={() => elegirPestana(p.valor)}
                className="relative cursor-pointer border-none bg-transparent px-3 pb-3 pt-2.5 text-sm text-mon-tinta-2 aria-selected:font-bold aria-selected:text-mon-tinta aria-selected:after:absolute aria-selected:after:inset-x-0 aria-selected:after:-bottom-px aria-selected:after:h-0.5 aria-selected:after:bg-mon-acento aria-selected:after:content-['']">
                {p.etiqueta}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1200px] px-6 pb-10 pt-6">
          {errorExcel && <p className="m-0 mb-4 text-xs text-mon-critico-texto">{errorExcel}</p>}
          {!ultima && pestana !== 'registros' && (
            <p className="m-0 text-[13px] text-mon-tinta-2">{error ? `No se pudo leer la Pi: ${error}. Se reintenta cada 2 s.` : 'Conectando con la Pi…'}</p>
          )}
          {pestana === 'estado' && (
            <EstadoPestana pi={pi} prueba={prueba} resumen={resumen} onGuardarExcel={guardarExcel}
              onIniciar={() => ultima && iniciarPrueba(ultima.t, muestras)}
              onTerminar={() => terminarPrueba(ultima?.t ?? Date.now() / 1000)} />
          )}
          {pestana === 'graficas' && ultima && <GraficasPestana muestras={muestras} prueba={prueba} muestrasPrueba={muestrasPrueba} resumen={resumen} />}
          {/* Registros siempre montado: no se pierde lo recibido al cambiar de pestaña. */}
          <div className={pestana === 'registros' ? '' : 'hidden'}><RegistrosPanel /></div>
          {pestana === 'procesos' && <ProcesosPestana informe={informe} ultima={ultima} />}
        </div>
      </div>
    </div>
  );
};

export default RendimientoPage;
