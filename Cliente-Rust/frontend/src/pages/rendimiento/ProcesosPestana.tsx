// pages/rendimiento/ProcesosPestana.tsx — «Procesos» de la Pi 4: todos los programas (paginados, por CPU
// o por RAM) y las conexiones abiertas por servicio y por cámara.
import { useMemo, useState } from 'react';
import type { InformePi, MuestraPi } from '../../services/rendimiento.service';
import { paginar } from './monitoreo';
import { NOTA, Paginador, Seccion, Selector, TARJETA } from './Piezas';

const POR_PAGINA = 10;
type Orden = 'cpu' | 'ram';

const NOMBRE_SERVICIO: Record<string, string> = {
  ssh: 'Terminales y apps (SSH)',
  api: 'API de prácticas',
  camaras: 'Cámaras en vivo (MediaMTX)',
  shinobi: 'Grabación de cámaras (Shinobi)',
};

function Conteos({ titulo, filas, mono }: { titulo: string; filas: [string, number][]; mono?: boolean }) {
  return (
    <div className={TARJETA}>
      <h4 className="m-0 border-b border-mon-pista px-6 pb-2.5 pt-3.5 text-[10px] font-bold uppercase tracking-[0.08em] text-mon-apagado">{titulo}</h4>
      <ul className="m-0 list-none divide-y divide-mon-pista p-0 px-4">
        {filas.map(([nombre, n]) => (
          <li key={nombre} className="flex items-center justify-between px-2 py-2 text-[13px]">
            <span className={`text-mon-tinta ${mono ? 'font-mon-num' : ''}`}>{nombre}</span>
            <span className={`font-mon-num ${n ? 'text-mon-tinta' : 'text-mon-apagado'}`}>{n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ProcesosPestana({ informe, ultima }: { informe: Omit<InformePi, 'muestras'> | null; ultima: MuestraPi | null }) {
  const [orden, setOrden] = useState<Orden>('cpu');
  const [pagina, setPagina] = useState(1);
  // `procesos` (todos) llega desde la versión nueva de metrics_svc; con la vieja solo hay el top.
  const procesos = informe?.procesos ?? informe?.procesos_top ?? [];
  const ordenados = useMemo(
    () => [...procesos].sort((a, b) => (orden === 'cpu' ? b.cpu_pct - a.cpu_pct || b.ram_mb - a.ram_mb : b.ram_mb - a.ram_mb)),
    [procesos, orden],
  );
  const pag = paginar(ordenados, pagina, POR_PAGINA);

  const servicios = Object.entries(ultima?.conexiones ?? {}).map(([s, n]) => [NOMBRE_SERVICIO[s] ?? s, n] as [string, number]);
  const camaras = Object.entries(ultima?.camaras?.por_camara ?? {}).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="flex flex-col gap-8">
      <Seccion titulo="Procesos" derecha={
        <span className="inline-flex items-center gap-2 text-xs text-mon-apagado">
          Ordenar por
          <Selector<Orden> nombre="Ordenar por" valor={orden} onCambio={(o) => { setOrden(o); setPagina(1); }}
            opciones={[{ valor: 'cpu', etiqueta: 'CPU' }, { valor: 'ram', etiqueta: 'RAM' }]} />
        </span>
      }>
        <div className={TARJETA}>
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="text-left text-[10px] font-bold uppercase tracking-[0.08em]">
                <th className="border-b border-mon-pista pb-2.5 pl-6 pt-3.5 font-bold text-mon-apagado">Programa</th>
                <th className="border-b border-mon-pista pb-2.5 pt-3.5 font-bold text-mon-apagado">Usuario</th>
                <th className={`border-b border-mon-pista pb-2.5 pt-3.5 text-right font-bold ${orden === 'cpu' ? 'text-mon-tinta' : 'text-mon-apagado'}`}>CPU</th>
                <th className={`border-b border-mon-pista pb-2.5 pr-6 pt-3.5 text-right font-bold ${orden === 'ram' ? 'text-mon-tinta' : 'text-mon-apagado'}`}>RAM</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-mon-pista">
              {pag.filas.map((p) => (
                <tr key={`${p.comando}-${p.usuario}`}>
                  <td className="py-2 pl-6 font-mon-num text-mon-tinta">{p.comando}{p.procesos > 1 ? ` ×${p.procesos}` : ''}</td>
                  <td className="py-2 text-mon-tinta-2">{p.usuario}</td>
                  <td className="py-2 text-right font-mon-num text-mon-tinta">{p.cpu_pct.toFixed(1)} %</td>
                  <td className={`py-2 pr-6 text-right font-mon-num ${Math.round(p.ram_mb) ? 'text-mon-tinta' : 'text-mon-apagado'}`}>{Math.round(p.ram_mb)} MB</td>
                </tr>
              ))}
            </tbody>
          </table>
          {pag.total === 0 && <p className="m-0 px-6 py-5 text-[13px] text-mon-tinta-2">Todavía no hay datos de procesos.</p>}
          <Paginador pagina={pag} onPagina={setPagina} unidad="procesos" />
        </div>
        <p className="m-0 text-[11px] text-mon-apagado">×4 = cuatro procesos con el mismo nombre, sumados.</p>
      </Seccion>

      {ultima && (
        <Seccion titulo="Conexiones abiertas">
          <div className="grid gap-4 md:grid-cols-2">
            <Conteos titulo="Por servicio" filas={servicios} />
            {ultima.camaras
              ? <Conteos titulo="Viendo cada cámara" filas={camaras} mono />
              : <div className={`${TARJETA} px-6 py-5 text-[13px] text-mon-tinta-2`}>La API de MediaMTX no respondió: no se cuentan los espectadores de cámaras.</div>}
          </div>
          <span className={NOTA}>actualizado cada 2 s</span>
        </Seccion>
      )}
    </div>
  );
}
