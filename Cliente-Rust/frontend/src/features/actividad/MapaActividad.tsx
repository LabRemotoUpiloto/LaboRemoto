// features/actividad/MapaActividad.tsx — el mapa de Actividad (Leaflet directo, sin envoltorio de React).
// En vivo: una marca por persona (círculo relleno = práctica, contorno = SSH, cuadrado = app). En histórico: un círculo por lugar, del tamaño
// de cuántas veces se conectaron desde ahí. Nunca rastros. Encuadra donde está la mayoría y nombra lo que quedó fuera.
import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { encuadrar, TEXTO_TIPO, type Tipo } from './actividad';

export interface PuntoMapa {
  id: string;
  lat: number;
  lon: number;
  /** Lo que se lee junto al punto (nombre o «Bogotá, 12»). */
  etiqueta: string;
  /** Solo en vivo: qué está haciendo. Sin tipo, es un lugar del histórico. */
  tipo?: Tipo;
  /** Solo lugares: 0 a 1 según cuántas veces, para el tamaño. */
  peso?: number;
}

// Leaflet pinta con atributos SVG (no entienden var()): el color va por clase para que siga el tema activo.
// Las calles del mapa son siempre claras: todas las marcas van en el acento y se distinguen por la forma, no por colores del
// tema que en los oscuros se pierden sobre el mapa claro.
const ESTILOS = `
  .act-punto { stroke: var(--accent-primary); fill: var(--accent-primary); }
  .act-punto.practica { stroke-width: 2; fill-opacity: 1; }
  .act-punto.ssh { stroke-width: 3; fill-opacity: 0; }
  .act-app { box-sizing: border-box; border: 2px solid var(--accent-primary); border-radius: 2px;
    background: color-mix(in srgb, var(--accent-primary) 40%, transparent); }
  .act-app.act-marcado { box-shadow: 0 0 0 5px color-mix(in srgb, var(--accent-primary) 35%, transparent); }
  .act-lugar { stroke: var(--accent-primary); stroke-width: 1; fill: var(--accent-primary); fill-opacity: 0.22; }
  .act-marcado { stroke-width: 6; stroke-opacity: 0.35; }
  .leaflet-tooltip.act-etiqueta { background: var(--background-secondary); color: var(--text-secondary); border: 0; box-shadow: none;
    padding: 0 6px; font-size: 11px; border-radius: 4px; }
  .leaflet-tooltip.act-etiqueta::before { display: none; }
`;

export default function MapaActividad({ puntos, marcado, onMarcar, vacio }: {
  puntos: PuntoMapa[];
  marcado?: string | null;
  onMarcar?: (id: string) => void;
  /** Qué decir si no hay ningún punto. */
  vacio: string;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const capa = useRef<L.LayerGroup | null>(null);
  const marcadores = useRef(new Map<string, L.CircleMarker | L.Marker>());
  const ultimoEncuadre = useRef('');
  const onMarcarRef = useRef(onMarcar);
  onMarcarRef.current = onMarcar;
  const { dentro, fuera } = useMemo(() => encuadrar(puntos), [puntos]);

  useEffect(() => {
    if (!contenedor.current) return;
    const m = L.map(contenedor.current, {
      center: [4.65, -74.1], zoom: 9,
      // Con touchpad, el zoom por pasos enteros y la rueda sensible se sentían a saltos: zoom fraccionario, más recorrido
      // por nivel y una pausa corta entre eventos de la rueda (el pellizco llega como rueda con Ctrl).
      zoomSnap: 0.25, zoomDelta: 0.5, wheelPxPerZoomLevel: 160, wheelDebounceTime: 30,
      inertia: true, inertiaDeceleration: 2500,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; OpenStreetMap' }).addTo(m);
    capa.current = L.layerGroup().addTo(m);
    mapa.current = m;
    // El contenedor puede no tener su tamaño definitivo al montar.
    const t = setTimeout(() => m.invalidateSize(), 0);
    return () => { clearTimeout(t); m.remove(); mapa.current = null; capa.current = null; ultimoEncuadre.current = ''; };
  }, []);

  useEffect(() => {
    const m = mapa.current, c = capa.current;
    if (!m || !c) return;
    c.clearLayers();
    marcadores.current.clear();
    for (const p of puntos) {
      const lugar = !p.tipo;
      // La app va como cuadrado (un divIcon): otra forma, no otro color.
      const marca = p.tipo === 'app'
        ? L.marker([p.lat, p.lon], { icon: L.divIcon({ className: 'act-app', iconSize: [13, 13] }), keyboard: false })
        : L.circleMarker([p.lat, p.lon], {
          radius: lugar ? 6 + 22 * Math.sqrt(p.peso ?? 0) : 7,
          className: lugar ? 'act-lugar' : `act-punto ${p.tipo}`,
        });
      marca
        .bindTooltip(p.etiqueta, { permanent: true, direction: 'bottom', offset: [0, 6], className: 'act-etiqueta' })
        .on('click', () => onMarcarRef.current?.(p.id))
        .addTo(c);
      if (p.tipo) marca.getElement()?.setAttribute('aria-label', `${p.etiqueta}, ${TEXTO_TIPO[p.tipo].toLowerCase()}`);
      marcadores.current.set(p.id, marca);
    }
    // Reencuadrar solo si cambió el conjunto de puntos, no en cada refresco (si no, el mapa le quita el zoom a quien lo mira).
    const clave = dentro.map((p) => p.id).sort().join('|');
    if (dentro.length && clave !== ultimoEncuadre.current) {
      ultimoEncuadre.current = clave;
      m.fitBounds(L.latLngBounds(dentro.map((p) => [p.lat, p.lon] as [number, number])), { maxZoom: 11, padding: [60, 60] });
    }
  }, [puntos, dentro]);

  // El elegido en la lista: se resalta y, si está fuera de la vista, el mapa va hasta él.
  useEffect(() => {
    const m = mapa.current;
    for (const [id, marca] of marcadores.current) {
      const el = marca.getElement();
      if (el) el.classList.toggle('act-marcado', id === marcado);
    }
    const p = puntos.find((x) => x.id === marcado);
    if (m && p && !m.getBounds().contains([p.lat, p.lon])) m.flyTo([p.lat, p.lon], Math.max(m.getZoom(), 10));
  }, [marcado, puntos]);

  // zIndex 0 + relative: los z-index internos de Leaflet (400–1000) no tapan diálogos ni menús.
  return (
    <div className="relative z-0 h-full overflow-hidden rounded-ui border-[length:var(--card-border-width,1px)] border-ui-borde">
      <style>{ESTILOS}</style>
      <div ref={contenedor} className="h-full w-full" role="region" aria-label="Mapa de actividad" />
      {!puntos.length && (
        <span className="pointer-events-none absolute inset-0 z-[500] flex items-center justify-center">
          <span className="rounded bg-ui-superficie px-3 py-1.5 text-[13px] text-ui-tinta-2">{vacio}</span>
        </span>
      )}
      {fuera.length > 0 && (
        <div className="absolute bottom-3 left-3 z-[500] flex flex-wrap items-center gap-2 rounded bg-ui-superficie px-3 py-1.5 text-[12px] text-ui-tinta-2">
          Fuera de la vista:
          {fuera.map((p) => (
            <button key={p.id} type="button" onClick={() => mapa.current?.flyTo([p.lat, p.lon], 9)}
              className="cursor-pointer text-ui-acento-texto underline-offset-2 hover:underline">{p.etiqueta}</button>
          ))}
        </div>
      )}
    </div>
  );
}
