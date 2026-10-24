// Mapa de ubicaciones aproximadas (por IP) desde donde se conectan los
// estudiantes. Leaflet directo, sin wrapper de React.
import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { PuntoUbicacion } from './dashboardStats';

// Leaflet pinta con atributos SVG (no entienden var()); el color se aplica por
// clase para que siga el tema activo.
const ESTILOS = `
  .marcador-sesion { stroke: var(--accent-primary); fill: var(--accent-primary); }
  .marcador-sesion.activo { stroke: var(--success); fill: var(--success); }
  .marcador-sesion.aproximada { stroke-dasharray: 4 4; fill-opacity: 0.15; }
`;

function tooltip(p: PuntoUbicacion): HTMLElement {
  // Texto vía textContent: ciudad y nombres vienen de fuera (ipinfo, Keycloak).
  const el = document.createElement('div');
  const titulo = document.createElement('strong');
  titulo.textContent = p.lugar;
  const detalle = document.createElement('div');
  detalle.textContent = `${p.sesiones} sesión(es)${p.activas ? ` · ${p.activas} ahora` : ''}${p.aproximada ? ' · aprox. por IP' : ''}`;
  const quienes = document.createElement('div');
  quienes.textContent = p.estudiantes.slice(0, 5).join(', ') + (p.estudiantes.length > 5 ? '…' : '');
  el.append(titulo, detalle, quienes);
  return el;
}

const SesionesMapa: React.FC<{ puntos: PuntoUbicacion[] }> = ({ puntos }) => {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const capa = useRef<L.LayerGroup | null>(null);
  const ultimoEncuadre = useRef('');

  useEffect(() => {
    if (!contenedor.current) return;
    const m = L.map(contenedor.current, { center: [4.57, -74.3], zoom: 5, scrollWheelZoom: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; OpenStreetMap',
    }).addTo(m);
    capa.current = L.layerGroup().addTo(m);
    mapa.current = m;
    // El contenedor puede no tener tamaño definitivo al montar.
    const t = setTimeout(() => m.invalidateSize(), 0);
    return () => {
      clearTimeout(t);
      m.remove();
      mapa.current = null;
      capa.current = null;
      ultimoEncuadre.current = '';
    };
  }, []);

  useEffect(() => {
    const m = mapa.current;
    const c = capa.current;
    if (!m || !c) return;
    c.clearLayers();
    for (const p of puntos) {
      L.circleMarker([p.lat, p.lon], {
        radius: 6 + Math.min(14, Math.sqrt(p.sesiones) * 3),
        className: ['marcador-sesion', p.activas && 'activo', p.aproximada && 'aproximada'].filter(Boolean).join(' '),
        weight: 2,
        fillOpacity: 0.45,
      }).bindTooltip(tooltip(p)).addTo(c);
    }
    // Reencuadrar solo si cambió el conjunto de lugares, no en cada refresco
    // (si no, el mapa le quitaría el zoom al usuario cada 30 s).
    const clave = puntos.map((p) => `${p.lat},${p.lon}`).sort().join('|');
    if (puntos.length && clave !== ultimoEncuadre.current) {
      ultimoEncuadre.current = clave;
      m.fitBounds(L.latLngBounds(puntos.map((p) => [p.lat, p.lon] as [number, number])), { maxZoom: 10, padding: [30, 30] });
    }
  }, [puntos]);

  // zIndex 0 + position relative: los z-index internos de Leaflet (400-1000)
  // quedan contenidos y no tapan modales ni menús de Mantine.
  return (
    <>
      <style>{ESTILOS}</style>
      <div ref={contenedor} style={{ height: 360, borderRadius: 12, overflow: 'hidden', position: 'relative', zIndex: 0 }} />
    </>
  );
};

export default SesionesMapa;
