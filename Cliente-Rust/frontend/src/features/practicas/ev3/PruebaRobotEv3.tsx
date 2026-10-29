// features/practicas/ev3/PruebaRobotEv3.tsx — «Probar con mi robot»: el panel del EV3 contra un robot físico de la red
// local, sin el laboratorio (sin Raspberry, sin sesión SSH y sin chat). Solo para pruebas del equipo técnico.
//
// La persona escribe la IP del robot (o ev3dev.local) y la app le habla directo a `api_simulador` en el ladrillo
// (backend: cmd::hardware::ev3_directo). La dirección se recuerda en este computador. Más adelante podrá venir
// embebida al compilar: si se define VITE_EV3_ROBOT, el campo ya viene lleno con ese valor.
//
// Mismas piezas que la vista guiada de la práctica: gemelo 3D en el escenario, riel de herramientas y cajón.
// La consola de Python no está: necesita la sesión SSH del laboratorio para subir el programa al robot.
// El escenario alterna entre el gemelo 3D y el editor de trayectorias (trayectorias/EditorTrayectorias).
import React, { Suspense, useEffect, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Aviso, Boton, BotonPrincipal, Campo, NOTA, Selector, type Opcion } from '@/components/ui';
import { Ev3Twin } from '@/app/diferidos';
import { getEv3Status, stopEv3Motors } from '@/features/hardware/ev3.service';
import { useEv3Estado } from '@/features/hardware/ev3/useEv3Estado';
import { necesidadesDe, type HerramientaEv3 } from './necesidadesEv3';
import { RielHerramientas } from './RielHerramientas';
import { CajonEv3 } from './CajonEv3';
import { BotonDetener, EstadoRobot } from './BarraMisionEv3';
import { EditorTrayectorias } from './trayectorias/EditorTrayectorias';

const CLAVE_ROBOT = 'labremoto.ev3.robotDirecto';
/** Identificador de la «sesión»: en conexión directa el backend no lo usa, solo sirve de etiqueta. */
const ID_DIRECTO = 'robot-directo';
const ROBOT_EMBEBIDO = String(import.meta.env.VITE_EV3_ROBOT ?? '').trim();
/** Todo disponible menos la consola (necesita el laboratorio). */
const NECESIDADES = necesidadesDe('prueba-robot', { consola: 'oculta', abierta: 'motores' });

type VistaEscenarioPrueba = 'gemelo' | 'trayectorias';
const OPCIONES_ESCENARIO: Opcion<VistaEscenarioPrueba>[] = [
  { valor: 'gemelo', etiqueta: 'Gemelo 3D' },
  { valor: 'trayectorias', etiqueta: 'Trayectorias' },
];
/** Mientras se graba la trayectoria real se lee el robot más seguido: la odometría mejora con más muestras. */
const LECTURA_GRABANDO_MS = 300;

function leerRobot(): string {
  try { return localStorage.getItem(CLAVE_ROBOT) ?? ROBOT_EMBEBIDO; } catch { return ROBOT_EMBEBIDO; }
}

function guardarRobot(valor: string) {
  try { localStorage.setItem(CLAVE_ROBOT, valor); } catch { /* sin almacenamiento: se vuelve a escribir la próxima vez */ }
}

const mensajeDe = (e: unknown) => (e as { message?: string } | null)?.message ?? String(e);

export const PruebaRobotEv3: React.FC<{ onVolver: () => void }> = ({ onVolver }) => {
  const [entrada, setEntrada] = useState(leerRobot);
  const [robot, setRobot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conectando, setConectando] = useState(false);

  const conectar = async (e: React.FormEvent) => {
    e.preventDefault();
    const direccion = entrada.trim();
    if (!direccion) { setError('Escribe la dirección IP del robot.'); return; }
    setConectando(true);
    setError(null);
    try {
      // Primera consulta: el backend rechaza lo que no sea de la red local y dice por qué.
      await getEv3Status(ID_DIRECTO, direccion);
      guardarRobot(direccion);
      setRobot(direccion);
    } catch (err) {
      setError(mensajeDe(err));
    } finally {
      setConectando(false);
    }
  };

  return (
    <div className="flex h-full w-full min-h-0 flex-col bg-ui-fondo">
      <header className="flex shrink-0 flex-wrap items-end gap-x-4 gap-y-3 border-b border-ui-borde bg-ui-superficie px-4 py-3">
        <Boton onClick={onVolver}>
          <ArrowLeft size={14} aria-hidden />
          Volver
        </Boton>
        <div className="mr-auto min-w-0">
          <h1 className="m-0 text-[15px] font-semibold text-ui-tinta">Probar con mi robot</h1>
          <p className="m-0 text-[12px] text-ui-tinta-2">Conexión directa con un EV3 de tu red, sin el laboratorio. Solo para pruebas.</p>
        </div>
        <form onSubmit={(e) => void conectar(e)} className="flex items-end gap-2" noValidate>
          <Campo
            etiqueta="Dirección del robot"
            mono
            className="w-56"
            placeholder="ev3dev.local"
            value={entrada}
            onChange={(e) => { setEntrada(e.target.value); setError(null); }}
            disabled={!!robot}
            aria-invalid={!!error}
            aria-describedby={error ? 'robot-directo-error' : undefined}
            autoComplete="off"
            spellCheck={false}
          />
          {robot
            ? <Boton onClick={() => setRobot(null)}>Desconectar</Boton>
            : <BotonPrincipal type="submit" disabled={conectando}>{conectando ? 'Conectando…' : 'Conectar'}</BotonPrincipal>}
        </form>
      </header>

      {error && (
        <p id="robot-directo-error" role="alert" className="m-0 shrink-0 border-b border-ui-borde bg-ui-superficie px-4 py-2 text-[13px] text-ui-critico-texto">
          {error}
        </p>
      )}

      {robot ? <PanelDirecto robot={robot} /> : <Instrucciones />}
    </div>
  );
};

/** Antes de conectar: qué tiene que estar listo del lado del robot. */
const Instrucciones: React.FC = () => (
  <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4 px-8 pb-12 pt-7">
    <Aviso
      titulo="Conecta tu robot"
      detalle={(
        <ol className="m-0 flex flex-col gap-1.5 pl-5">
          <li>Enciende el EV3 con ev3dev y conéctalo a la misma red Wi‑Fi que este computador, o por cable USB.</li>
          <li>En el ladrillo, corre el servidor del robot: <code className="font-ui-num">python3 main.py</code> (carpeta <code className="font-ui-num">api_simulador</code>). Escucha en el puerto 8080.</li>
          <li>Escribe arriba la IP que muestra la pantalla del ladrillo, o <code className="font-ui-num">ev3dev.local</code>, y pulsa «Conectar».</li>
        </ol>
      )}
    />
    <p className="m-0 text-[12px] text-ui-tinta-2">
      Solo se aceptan direcciones de tu red local. Si el robot usa otro puerto, escríbelo así: <code className="font-ui-num">dirección:puerto</code>.
    </p>
  </div>
);

/** Conectado: escenario con el gemelo 3D, cajón y riel, como en la práctica. */
const PanelDirecto: React.FC<{ robot: string }> = ({ robot }) => {
  const [escenario, setEscenario] = useState<VistaEscenarioPrueba>('gemelo');
  const [grabando, setGrabando] = useState(false);
  const { status, setSpeed, stopAll } = useEv3Estado(ID_DIRECTO, robot, grabando ? LECTURA_GRABANDO_MS : undefined);
  const [abierta, setAbierta] = useState<HerramientaEv3 | null>(NECESIDADES.abierta);
  const alternar = (h: HerramientaEv3) => setAbierta((actual) => (actual === h ? null : h));

  // Al salir (Volver o Desconectar) los motores quedan quietos: el robot está en una mesa, no en el laboratorio.
  const robotRef = useRef(robot);
  robotRef.current = robot;
  useEffect(() => () => {
    void stopEv3Motors(ID_DIRECTO, undefined, robotRef.current).catch(() => { /* si no responde, ya está quieto o apagado */ });
  }, []);

  const sinRespuesta = !!status && !status.reachable;

  return (
    <>
      <div className="flex h-11 shrink-0 items-center justify-end gap-4 border-b border-ui-borde bg-ui-superficie px-4">
        <span className={`${NOTA} mr-auto`}>Robot: {status?.ip || robot}</span>
        <EstadoRobot conectado={!!status?.connected} />
        <BotonDetener onDetener={stopAll} />
      </div>

      {sinRespuesta && (
        <div className="shrink-0 px-4 pt-3">
          <Aviso nivel="alerta" titulo="El robot no responde" detalle={status.alerts[0]} />
        </div>
      )}

      <div className="relative flex min-h-0 flex-1">
        <section aria-label="Escenario del robot" className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 items-center px-3 pt-3">
            <Selector opciones={OPCIONES_ESCENARIO} valor={escenario} onCambio={(v) => setEscenario(v)} nombre="Vista del escenario" />
          </div>
          <div className="relative mx-3 mb-3 mt-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-ui border border-ui-borde bg-ui-superficie">
            {escenario === 'gemelo' && (
              <Suspense fallback={<p className="m-0 p-4 text-[13px] text-ui-apagado" role="status">Cargando el modelo 3D…</p>}>
                <Ev3Twin status={status} />
              </Suspense>
            )}
            {/* El editor queda montado aunque se vea el gemelo: la ruta y la grabación no se pierden al cambiar. */}
            <div className={escenario === 'trayectorias' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}>
              <EditorTrayectorias status={status} onGrabandoCambio={setGrabando} />
            </div>
          </div>
        </section>
        <CajonEv3
          sessionId={ID_DIRECTO}
          abierta={abierta}
          estado={abierta ? NECESIDADES.herramientas[abierta] : null}
          conConsola={false}
          status={status}
          onSetSpeed={setSpeed}
          onCerrar={() => setAbierta(null)}
        />
        <RielHerramientas necesidades={NECESIDADES} abierta={abierta} onAlternar={alternar} />
      </div>
    </>
  );
};
