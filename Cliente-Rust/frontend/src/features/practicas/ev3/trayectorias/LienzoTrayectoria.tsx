// features/practicas/ev3/trayectorias/LienzoTrayectoria.tsx — lienzo del editor de trayectorias: rejilla en cm, ruta
// planeada, puntos arrastrables, el robot de la simulación y la trayectoria real. Traduce los gestos (clic, arrastre,
// doble clic, rueda, clic derecho) a cambios de la lista de primitivas: nunca guarda su propia copia de la ruta.
//
// Solo se arrastran los finales de cada `avanzar` (waypoints.ts); los arcos y pausas se dibujan y se conservan. Para
// quien no usa el mouse, la lista de comandos edita la misma ruta.
import React, { useEffect, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { Boton } from '@/components/ui';
import { crearProyeccion, PX_POR_CM_DEFECTO, type Camara } from './proyeccion';
import { POSE_INICIAL_DEFECTO, simularPrimitivas } from './planificador';
import { agregarWaypoint, eliminarWaypoint, moverWaypoint, snapRelativoAAnterior, waypointsDesdePrimitivas } from './waypoints';
import type { Pose, Primitiva, Punto } from './tipos';

const PASO_REJILLA_CM = 10;
const RADIO_PUNTO_PX = 6;
/** Margen de clic más generoso que el punto dibujado. */
const RADIO_DETECCION_PX = 12;
const ZOOM_MIN = 2;
const ZOOM_MAX = 60;
const FACTOR_ZOOM_RUEDA = 1.1;

interface Colores {
  linea: string;
  ruta: string;
  arco: string;
  robot: string;
  real: string;
  fuente: string;
}

/**
 * Colores del tema activo. El lienzo 2D no entiende variables CSS: se leen del documento al montar y otra vez cuando
 * cambia el tema. Si un tema no define alguna, se usa el color del texto del contenedor.
 */
function leerColores(el: HTMLElement): Colores {
  const css = getComputedStyle(el);
  const tinta = css.color;
  const v = (nombre: string) => css.getPropertyValue(nombre).trim() || tinta;
  return {
    linea: v('--text-secondary'),
    ruta: v('--accent-primary'),
    arco: v('--warning'),
    robot: v('--success'),
    real: v('--danger'),
    fuente: css.getPropertyValue('--terminal-font-family').trim() || 'monospace',
  };
}

type Arrastre =
  | { tipo: 'pan'; xPx: number; yPx: number; panX: number; panY: number }
  | { tipo: 'punto'; indice: number }
  | { tipo: 'posible-clic' }
  | null;

interface Props {
  primitivas: Primitiva[];
  onCambiar: (p: Primitiva[]) => void;
  poseRobot: Pose;
  trayectoriaReal: Pose[] | null;
}

export const LienzoTrayectoria: React.FC<Props> = ({ primitivas, onCambiar, poseRobot, trayectoriaReal }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const contenedorRef = useRef<HTMLDivElement | null>(null);
  const camaraLista = useRef(false);

  const [tamano, setTamano] = useState({ ancho: 0, alto: 0 });
  const [camara, setCamara] = useState<Camara>({ panXPx: 0, panYPx: 0, pxPorCm: PX_POR_CM_DEFECTO });
  const [arrastre, setArrastre] = useState<Arrastre>(null);
  const [colores, setColores] = useState<Colores | null>(null);

  const puntos = waypointsDesdePrimitivas(primitivas);
  const proyeccion = crearProyeccion(camara);

  // El lienzo mide lo mismo que su contenedor (oculto mide 0 y no se dibuja).
  useEffect(() => {
    const el = contenedorRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const obs = new ResizeObserver(([entrada]) => {
      setTamano({ ancho: entrada.contentRect.width, alto: entrada.contentRect.height });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Colores del tema, y de nuevo si cambia el tema.
  useEffect(() => {
    const el = contenedorRef.current;
    if (!el) return undefined;
    const actualizar = () => setColores(leerColores(el));
    actualizar();
    if (typeof MutationObserver === 'undefined') return undefined;
    const obs = new MutationObserver(actualizar);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
    return () => obs.disconnect();
  }, []);

  // La cámara se centra una vez, apenas se conoce el tamaño: el origen abajo al centro, la ruta crece hacia arriba.
  useEffect(() => {
    if (camaraLista.current || tamano.ancho === 0) return;
    camaraLista.current = true;
    setCamara((c) => ({ ...c, panXPx: tamano.ancho / 2, panYPx: tamano.alto * 0.75 }));
  }, [tamano]);

  // Zoom con la rueda hacia el cursor. React registra «wheel» como pasivo y hace falta preventDefault: va a mano.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const rueda = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const xPx = e.clientX - rect.left;
      const yPx = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? FACTOR_ZOOM_RUEDA : 1 / FACTOR_ZOOM_RUEDA;
      setCamara((c) => {
        const antes = crearProyeccion(c).pantallaAMundo(xPx, yPx);
        const pxPorCm = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, c.pxPorCm * factor));
        // El punto bajo el cursor queda en el mismo píxel después del zoom.
        return { pxPorCm, panXPx: xPx - antes.x * pxPorCm, panYPx: yPx + antes.y * pxPorCm };
      });
    };
    canvas.addEventListener('wheel', rueda, { passive: false });
    return () => canvas.removeEventListener('wheel', rueda);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !colores || tamano.ancho === 0) return;
    const { ancho, alto } = tamano;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = ancho * dpr;
    canvas.height = alto * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, ancho, alto);

    const linea = (pts: Punto[]) => {
      ctx.beginPath();
      pts.forEach((p, i) => {
        const { x, y } = proyeccion.mundoAPantalla(p.x, p.y);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
    };

    // Rejilla cada 10 cm, con los ejes más marcados y sus medidas.
    const a = proyeccion.pantallaAMundo(0, 0);
    const b = proyeccion.pantallaAMundo(ancho, alto);
    const origen = proyeccion.mundoAPantalla(0, 0);
    ctx.font = `10px ${colores.fuente}`;
    ctx.textBaseline = 'top';
    ctx.strokeStyle = colores.linea;
    ctx.fillStyle = colores.linea;
    for (let x = Math.floor(Math.min(a.x, b.x) / PASO_REJILLA_CM) * PASO_REJILLA_CM; x <= Math.max(a.x, b.x); x += PASO_REJILLA_CM) {
      const xPx = proyeccion.mundoAPantalla(x, 0).x;
      ctx.globalAlpha = x === 0 ? 0.55 : 0.16;
      ctx.lineWidth = x === 0 ? 1.5 : 1;
      ctx.beginPath(); ctx.moveTo(xPx, 0); ctx.lineTo(xPx, alto); ctx.stroke();
      if (x !== 0 && origen.y >= 0 && origen.y <= alto) { ctx.globalAlpha = 0.85; ctx.fillText(`${x}`, xPx + 2, origen.y + 2); }
    }
    for (let y = Math.floor(Math.min(a.y, b.y) / PASO_REJILLA_CM) * PASO_REJILLA_CM; y <= Math.max(a.y, b.y); y += PASO_REJILLA_CM) {
      const yPx = proyeccion.mundoAPantalla(0, y).y;
      ctx.globalAlpha = y === 0 ? 0.55 : 0.16;
      ctx.lineWidth = y === 0 ? 1.5 : 1;
      ctx.beginPath(); ctx.moveTo(0, yPx); ctx.lineTo(ancho, yPx); ctx.stroke();
      if (y !== 0 && origen.x >= 0 && origen.x <= ancho) { ctx.globalAlpha = 0.85; ctx.fillText(`${y}`, origen.x + 2, yPx + 2); }
    }
    ctx.globalAlpha = 1;

    // Ruta planeada: rectas en el acento, arcos en ámbar. Giros y pausas no dibujan línea propia.
    ctx.lineWidth = 2;
    for (const s of simularPrimitivas(primitivas)) {
      if (s.puntos.length < 2) continue;
      ctx.strokeStyle = s.primitiva.tipo === 'arco' ? colores.arco : colores.ruta;
      linea(s.puntos);
    }

    // Trayectoria real (encoders): punteada, para distinguirla de un vistazo.
    if (trayectoriaReal && trayectoriaReal.length > 1) {
      ctx.strokeStyle = colores.real;
      ctx.setLineDash([5, 4]);
      linea(trayectoriaReal);
      ctx.setLineDash([]);
    }

    // Robot de la simulación: un triángulo que apunta hacia donde mira.
    const pose = poseRobot ?? POSE_INICIAL_DEFECTO;
    const centro = proyeccion.mundoAPantalla(pose.x, pose.y);
    const th = (pose.th * Math.PI) / 180;
    const tam = 9;
    ctx.fillStyle = colores.robot;
    ctx.beginPath();
    ctx.moveTo(centro.x + tam * Math.cos(th), centro.y - tam * Math.sin(th));
    ctx.lineTo(centro.x + tam * Math.cos(th + 2.5), centro.y - tam * Math.sin(th + 2.5));
    ctx.lineTo(centro.x + tam * Math.cos(th - 2.5), centro.y - tam * Math.sin(th - 2.5));
    ctx.closePath();
    ctx.fill();

    // Puntos: el que se arrastra, más grande.
    puntos.forEach((p, i) => {
      const { x, y } = proyeccion.mundoAPantalla(p.x, p.y);
      const activo = arrastre?.tipo === 'punto' && arrastre.indice === i;
      ctx.fillStyle = activo ? colores.robot : colores.ruta;
      ctx.beginPath();
      ctx.arc(x, y, activo ? RADIO_PUNTO_PX + 2 : RADIO_PUNTO_PX, 0, Math.PI * 2);
      ctx.fill();
    });
    // Se redibuja con cualquier cambio de lo que se ve; `proyeccion` y `puntos` derivan de camara y primitivas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tamano, camara, primitivas, arrastre, poseRobot, trayectoriaReal, colores]);

  const enPantalla = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { xPx: e.clientX - rect.left, yPx: e.clientY - rect.top };
  };

  const puntoCercano = (xPx: number, yPx: number): number | null => {
    let mejor: number | null = null;
    let distanciaMejor = RADIO_DETECCION_PX;
    puntos.forEach((p, i) => {
      const q = proyeccion.mundoAPantalla(p.x, p.y);
      const d = Math.hypot(q.x - xPx, q.y - yPx);
      if (d <= distanciaMejor) { distanciaMejor = d; mejor = i; }
    });
    return mejor;
  };

  /** Shift ajusta a 45° y 5 cm desde el punto anterior. */
  const ajustar = (e: React.MouseEvent, destino: Punto, anterior: Punto) =>
    (e.shiftKey ? snapRelativoAAnterior(anterior, destino) : destino);

  const alPresionar = (e: React.MouseEvent) => {
    const { xPx, yPx } = enPantalla(e);
    if (e.button === 2) {
      e.preventDefault();
      setArrastre({ tipo: 'pan', xPx, yPx, panX: camara.panXPx, panY: camara.panYPx });
      return;
    }
    if (e.button !== 0) return;
    const indice = puntoCercano(xPx, yPx);
    setArrastre(indice !== null ? { tipo: 'punto', indice } : { tipo: 'posible-clic' });
  };

  const alMover = (e: React.MouseEvent) => {
    const canvas = canvasRef.current!;
    const { xPx, yPx } = enPantalla(e);
    if (!arrastre) {
      canvas.style.cursor = puntoCercano(xPx, yPx) !== null ? 'grab' : 'crosshair';
      return;
    }
    if (arrastre.tipo === 'pan') {
      setCamara((c) => ({ ...c, panXPx: arrastre.panX + (xPx - arrastre.xPx), panYPx: arrastre.panY + (yPx - arrastre.yPx) }));
      return;
    }
    if (arrastre.tipo === 'punto') {
      canvas.style.cursor = 'grabbing';
      const anterior = arrastre.indice === 0 ? POSE_INICIAL_DEFECTO : puntos[arrastre.indice - 1];
      onCambiar(moverWaypoint(primitivas, arrastre.indice, ajustar(e, proyeccion.pantallaAMundo(xPx, yPx), anterior)));
    }
  };

  const alSoltar = (e: React.MouseEvent) => {
    if (arrastre?.tipo === 'posible-clic') {
      const { xPx, yPx } = enPantalla(e);
      const anterior = puntos.length ? puntos[puntos.length - 1] : POSE_INICIAL_DEFECTO;
      onCambiar(agregarWaypoint(primitivas, ajustar(e, proyeccion.pantallaAMundo(xPx, yPx), anterior)));
    }
    setArrastre(null);
  };

  const alDobleClic = (e: React.MouseEvent) => {
    const { xPx, yPx } = enPantalla(e);
    const indice = puntoCercano(xPx, yPx);
    if (indice !== null) onCambiar(eliminarWaypoint(primitivas, indice));
  };

  const reiniciarVista = () => setCamara({ panXPx: tamano.ancho / 2, panYPx: tamano.alto * 0.75, pxPorCm: PX_POR_CM_DEFECTO });

  return (
    <div ref={contenedorRef} className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-ui-fondo text-ui-tinta-2">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`Lienzo de la ruta, con ${puntos.length} ${puntos.length === 1 ? 'punto' : 'puntos'}. La lista de comandos edita la misma ruta.`}
        aria-describedby="lienzo-trayectoria-ayuda"
        className="absolute inset-0 h-full w-full"
        onMouseDown={alPresionar}
        onMouseMove={alMover}
        onMouseUp={alSoltar}
        // Salir del lienzo cancela el gesto (no agrega un punto en el borde).
        onMouseLeave={() => setArrastre(null)}
        onDoubleClick={alDobleClic}
        onContextMenu={(e) => e.preventDefault()}
      />

      <ul className="pointer-events-none absolute left-2 top-2 m-0 flex list-none flex-wrap gap-x-3 gap-y-1 rounded-ui border border-ui-borde bg-ui-superficie px-2 py-1 text-[11px] text-ui-tinta-2">
        <li className="flex items-center gap-1.5"><span aria-hidden className="h-0.5 w-3 bg-ui-acento" />Ruta</li>
        <li className="flex items-center gap-1.5"><span aria-hidden className="h-0.5 w-3 bg-ui-alerta" />Arco</li>
        <li className="flex items-center gap-1.5"><span aria-hidden className="w-3 border-t-2 border-dashed border-ui-critico" />Real</li>
        <li className="flex items-center gap-1.5"><span aria-hidden className="h-2 w-2 rotate-45 bg-ui-bien" />Robot</li>
      </ul>

      <Boton className="absolute right-2 top-2 h-8 px-2.5 text-[12px]" onClick={reiniciarVista}>
        <RotateCcw size={14} aria-hidden />
        Reiniciar vista
      </Boton>

      <p id="lienzo-trayectoria-ayuda" className="pointer-events-none absolute bottom-2 left-2 right-2 m-0 rounded-ui border border-ui-borde bg-ui-superficie px-2 py-1 font-ui-num text-[11px] text-ui-tinta-2">
        Clic: agregar punto · Arrastrar: mover · Doble clic: borrar · Shift: ajustar a 45° y 5 cm · Rueda: zoom · Clic derecho: mover la vista
      </p>
    </div>
  );
};
