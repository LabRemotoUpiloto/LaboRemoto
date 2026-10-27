// features/cursos/ResumenGeneralPanel.tsx — vista general de un curso para el docente: el porcentaje de cada estudiante en TODAS las
// prácticas y cómo va en cada una. Los datos salen de Moodle (cmd::moodle_resumen_curso); las cuentas están en entregasStats.ts.
import { useEffect, useState } from 'react';
import { BarraAcento, ETIQUETA, Paginador, paginar } from '@/components/ui';
import { moodleCursosService, type ResumenCurso } from './moodleCursos.service';
import { etiquetaEstadoDocente, resumenGeneral, textoNota } from './entregasStats';

const mensajeDe = (e: any) => e?.message ?? String(e);
const POR_PAGINA = 10;

/** La nota general en el color del texto (verde, ámbar, rojo), para ubicar de un vistazo a quien necesita ayuda. */
const colorNota = (n: number) => (n >= 70 ? 'text-ui-bien-texto' : n >= 40 ? 'text-ui-alerta-texto' : 'text-ui-critico-texto');

function Dato({ etiqueta, valor, detalle }: { etiqueta: string; valor: string; detalle: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className={ETIQUETA}>{etiqueta}</dt>
      <dd className="m-0 font-ui-num text-[14px] text-ui-tinta">{valor}</dd>
      <dd className="m-0 text-[12px] text-ui-apagado">{detalle}</dd>
    </div>
  );
}

const TH = `${ETIQUETA} whitespace-nowrap border-b border-ui-borde py-2 pr-4 text-left align-bottom`;
const TD = 'py-2 pr-4 align-middle text-[13px]';
/** Cabecera de una práctica: su id tal cual (minúsculas), no como rótulo. */
const TH_PRACTICA = 'whitespace-nowrap border-b border-ui-borde py-2 pr-4 text-left align-bottom font-ui-num text-[11px] font-bold text-ui-apagado';

export default function ResumenGeneralPanel({ cursoId }: { cursoId: number }) {
  const [datos, setDatos] = useState<ResumenCurso | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pagina, setPagina] = useState(1);

  useEffect(() => {
    let activo = true;
    setDatos(null);
    setError(null);
    moodleCursosService.resumenCurso(cursoId)
      .then((r) => { if (activo) setDatos(r); })
      .catch((e: any) => { if (activo) setError(mensajeDe(e)); });
    return () => { activo = false; };
  }, [cursoId]);

  const texto = 'm-0 py-3 text-[13px]';
  if (error) return <p className={`${texto} text-ui-critico-texto`} role="alert">{error}</p>;
  if (!datos) return <p className={`${texto} text-ui-apagado`} role="status">Cargando la vista general…</p>;
  if (!datos.practicas.length) return <p className={`${texto} text-ui-apagado`}>Este curso aún no tiene prácticas de laboratorio.</p>;
  if (!datos.estudiantes.length) return <p className={`${texto} text-ui-apagado`}>Este curso no tiene estudiantes matriculados.</p>;

  const g = resumenGeneral(datos);
  const vista = paginar(g.filas, pagina, POR_PAGINA);
  return (
    <div className="flex flex-col gap-3 py-4">
      <dl className="m-0 grid grid-cols-3 gap-6">
        <Dato etiqueta="Estudiantes" valor={String(g.curso.estudiantes)} detalle={`${g.curso.practicas} ${g.curso.practicas === 1 ? 'práctica' : 'prácticas'} en el curso`} />
        <Dato etiqueta="Avance del curso" valor={textoNota(g.curso.avance)} detalle="Prácticas entregadas sobre el total, en promedio" />
        <Dato etiqueta="Nota general" valor={textoNota(g.curso.general)} detalle="Promedio de todos; lo no entregado cuenta como 0" />
      </dl>

      <p className="m-0 text-[12px] text-ui-apagado">
        «General» es el promedio de todas las prácticas del curso: la que un estudiante no ha entregado cuenta como 0. Son notas provisionales
        hasta que las confirmes en Moodle.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr>
              <th className={TH}>Estudiante</th>
              <th className={`${TH} w-[170px]`}>Avance</th>
              <th className={TH}>General</th>
              {datos.practicas.map((p) => <th key={p.cmid} className={TH_PRACTICA} title={p.nombre}>{p.practica}</th>)}
            </tr>
          </thead>
          <tbody>
            {vista.filas.map((f, i) => (
              <tr key={f.usuario} className={i ? 'border-t border-ui-pista' : ''}>
                <td className={TD}>
                  <span className="block text-ui-tinta">{f.nombre}</span>
                  {f.nombre !== f.usuario && <span className="block text-[12px] text-ui-apagado">{f.usuario}</span>}
                </td>
                <td className={TD}>
                  <span className="mb-1 block text-[12px] text-ui-apagado">{f.entregadas} de {f.total} ({textoNota(f.avance)})</span>
                  <BarraAcento frac={f.avance / 100} />
                </td>
                <td className={`${TD} font-ui-num ${colorNota(f.general)}`}>{textoNota(f.general)}</td>
                {f.notas.map((n, j) => (
                  <td key={datos.practicas[j].cmid} className={`${TD} font-ui-num ${n === null ? 'text-ui-apagado' : 'text-ui-tinta-2'}`}
                    title={etiquetaEstadoDocente({ estado: f.estados[j], nota: n })}>
                    {textoNota(n)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-ui-borde">
              <td colSpan={3} className="py-2 pr-4 align-middle text-[12px] text-ui-apagado">Por práctica: entregaron (promedio)</td>
              {g.porPractica.map((p) => (
                <td key={p.cmid} className="whitespace-nowrap py-2 pr-4 align-middle font-ui-num text-[12px] text-ui-apagado">
                  {p.entregaron}/{g.curso.estudiantes} ({textoNota(p.promedio)})
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      {vista.paginas > 1 && <Paginador pagina={vista} onPagina={setPagina} unidad="estudiantes" margen="px-0" />}
    </div>
  );
}
