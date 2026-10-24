// features/actividad/EncuestasPanel.tsx — pestaña «Encuestas» de Actividad: lo que respondieron los estudiantes al terminar cada
// práctica (aprendizaje y funcionamiento). Anónimo: el servidor nunca manda quién respondió.
import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Aviso, Barra, Boton, BarraAcento, ETIQUETA, NOTA, Num, Seccion, TARJETA, TEXTO_NIVEL } from '@/components/ui';
import { encuestasService, type ResumenPracticaEncuesta } from '@/features/practicas/encuestas.service';
import { nivelNota5, nota5, problemasOrdenados, repartoDificultad } from './encuestasStats';
import type { PropsPestana } from './piezas';
import { useResumen } from './useResumen';

const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });

const PREGUNTAS: { clave: keyof ResumenPracticaEncuesta['promedios']; etiqueta: string }[] = [
  { clave: 'aprendizaje', etiqueta: 'Aprendizaje' },
  { clave: 'claridad', etiqueta: 'Claridad de los pasos' },
  { clave: 'funcionamiento', etiqueta: 'Funcionamiento (conexión y terminal)' },
  { clave: 'asistente', etiqueta: 'Ayuda del asistente' },
  { clave: 'satisfaccion', etiqueta: 'Satisfacción general' },
];

export default function EncuestasPanel({ dias, recarga, reintentar }: PropsPestana) {
  const { datos, error, cargando } = useResumen(encuestasService.resumen, dias, recarga);
  const [nombres, setNombres] = useState<Record<string, string>>({});

  // Nombre de cada práctica (las encuestas llegan con el id, p. ej. «linux»).
  useEffect(() => {
    invoke<{ id: string; name: string }[]>('practicas_list_categories')
      .then((cats) => setNombres(Object.fromEntries(cats.map((c) => [c.id, c.name]))))
      .catch(() => {});
  }, []);

  if (cargando && !datos) return <div className={`${TARJETA} h-[240px] bg-ui-pista`} role="status" aria-busy="true"><span className="sr-only">Cargando…</span></div>;
  if (error && !datos) return <Aviso nivel="critico" titulo="No se pudieron cargar las encuestas" detalle={error} accion={<Boton onClick={reintentar}>Reintentar</Boton>} />;
  if (!datos?.practicas.length) {
    return <Aviso titulo="Todavía no hay encuestas en este período"
      detalle="Aparecen cuando un estudiante termina todos los módulos de una práctica. Son anónimas: no se muestra quién respondió." />;
  }
  return (
    <>
      <p className="m-0 text-[13px] text-ui-tinta-2">Lo que opinan los estudiantes al terminar cada práctica. Anónimo: no se muestra quién respondió.</p>
      {datos.practicas.map((p) => <Practica key={p.practica} p={p} nombre={nombres[p.practica] ?? p.practica} />)}
    </>
  );
}

function Practica({ p, nombre }: { p: ResumenPracticaEncuesta; nombre: string }) {
  const problemas = problemasOrdenados(p.problemas);
  const dificultad = repartoDificultad(p.dificultad, p.respuestas).filter((d) => d.veces > 0);
  const sinProblemas = p.problemas.ninguno ?? 0;
  return (
    <Seccion titulo={nombre}>
      <div className={`${TARJETA} grid gap-x-10 gap-y-6 px-5 py-4 md:grid-cols-2`}>
        <div className="flex flex-col gap-3">
          <h4 className={ETIQUETA}>Promedios de {p.respuestas} {p.respuestas === 1 ? 'respuesta' : 'respuestas'} (de 1 a 5)</h4>
          {PREGUNTAS.map(({ clave, etiqueta }) => {
            const v = p.promedios[clave];
            const nivel = nivelNota5(v);
            return (
              <div key={clave} className="grid grid-cols-[minmax(0,1fr)_120px_32px] items-center gap-4 text-[13px]">
                <span className="truncate text-ui-tinta">{etiqueta}</span>
                <Barra frac={v == null ? null : v / 5} nivel={nivel} />
                <span className={`text-right font-ui-num font-bold ${nivel === 'bien' ? 'text-ui-tinta' : TEXTO_NIVEL[nivel]}`}>{nota5(v)}</span>
              </div>
            );
          })}
          {p.asistenteNoUso > 0 && <span className={NOTA}>{p.asistenteNoUso} no usaron el asistente.</span>}
        </div>

        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-3">
            <h4 className={ETIQUETA}>Dificultad</h4>
            {dificultad.map((d) => (
              <div key={d.valor} className="grid grid-cols-[minmax(0,1fr)_120px_40px] items-center gap-4 text-[13px]">
                <span className="text-ui-tinta">{d.etiqueta}</span>
                <BarraAcento frac={d.pct / 100} />
                <span className="text-right"><Num>{d.pct} %</Num></span>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            <h4 className={ETIQUETA}>Problemas reportados</h4>
            {problemas.length ? problemas.map((x) => (
              <div key={x.valor} className="flex justify-between text-[13px]">
                <span className="text-ui-tinta">{x.etiqueta}</span><Num fuerte>{x.veces}</Num>
              </div>
            )) : <span className="text-[13px] text-ui-tinta-2">Nadie reportó problemas.</span>}
            {sinProblemas > 0 && problemas.length > 0 && <span className={NOTA}>{sinProblemas} sin ningún problema.</span>}
          </div>
        </div>
      </div>

      <div className={`${TARJETA} flex max-h-[320px] flex-col overflow-auto`}>
        <h4 className={`${ETIQUETA} border-b border-ui-borde px-5 py-2.5`}>Comentarios</h4>
        {p.comentarios.length ? p.comentarios.map((c, i) => (
          <div key={i} className={`flex flex-col gap-1 px-5 py-3 text-[13px] ${i ? 'border-t border-ui-pista' : ''}`}>
            <span className={NOTA}>{fecha(c.fecha)}</span>
            {c.gusto && <span className="text-ui-tinta-2"><b className="font-semibold text-ui-bien-texto">Le gustó: </b>{c.gusto}</span>}
            {c.mejorar && <span className="text-ui-tinta-2"><b className="font-semibold text-ui-alerta-texto">Mejoraría: </b>{c.mejorar}</span>}
          </div>
        )) : <span className="px-5 py-3 text-[13px] text-ui-tinta-2">Sin comentarios escritos.</span>}
      </div>
    </Seccion>
  );
}
