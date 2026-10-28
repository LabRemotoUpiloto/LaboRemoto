// features/actividad/EncuestasPage.tsx — Encuestas: lo que respondieron los estudiantes al terminar cada práctica (aprendizaje y
// funcionamiento). Anónimo: el servidor nunca manda quién respondió. Antes era una pestaña de Actividad; no es actividad.
import { useEffect, useState, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Aviso, Barra, Boton, BarraAcento, Desplegable, Encabezado, ETIQUETA, NOTA, Num, Pagina, Paginador, Seccion, TARJETA,
  TEXTO_NIVEL, paginar,
} from '@/components/ui';
import { encuestasService, type ResumenPracticaEncuesta } from '@/features/practicas/encuestas.service';
import { nivelNota5, nota5, problemasOrdenados, repartoDificultad } from './encuestasStats';
import { useResumen } from './useResumen';
import { BotonActualizar, useActualizar } from './BotonActualizar';

const COMENTARIOS_POR_PAGINA = 5;

const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });

const PREGUNTAS: { clave: keyof ResumenPracticaEncuesta['promedios']; etiqueta: string }[] = [
  { clave: 'aprendizaje', etiqueta: 'Aprendizaje' },
  { clave: 'claridad', etiqueta: 'Claridad de los pasos' },
  { clave: 'funcionamiento', etiqueta: 'Funcionamiento (conexión y terminal)' },
  { clave: 'asistente', etiqueta: 'Ayuda del asistente' },
  { clave: 'satisfaccion', etiqueta: 'Satisfacción general' },
];

/** `incrustada`: pestaña de Prácticas (sin marco ni título propios; los controles van en una fila). */
export default function EncuestasPage({ incrustada = false }: { incrustada?: boolean }) {
  // Las encuestas se juntan más despacio que la actividad: el período va de 30 días a un año.
  const [dias, setDias] = useState('90');
  const { datos, error, cargando, recargar } = useResumen(encuestasService.resumen, Number(dias));
  const { actualizando, actualizar } = useActualizar([recargar], { bien: 'Encuestas actualizadas', mal: 'No se pudieron actualizar las encuestas' });
  const [nombres, setNombres] = useState<Record<string, string>>({});

  // Nombre de cada práctica (las encuestas llegan con el id, p. ej. «linux»).
  useEffect(() => {
    invoke<{ id: string; name: string }[]>('practicas_list_categories')
      .then((cats) => setNombres(Object.fromEntries(cats.map((c) => [c.id, c.name]))))
      .catch(() => {});
  }, []);

  const controles = (
    <>
      <Desplegable etiqueta="Período" valor={dias} onCambio={setDias} className="w-[180px]"
        opciones={[{ valor: '30', etiqueta: 'Últimos 30 días' }, { valor: '90', etiqueta: 'Últimos 90 días' }, { valor: '365', etiqueta: 'Último año' }]} />
      <BotonActualizar actualizando={actualizando} onClick={() => void actualizar()} />
    </>
  );
  const Marco = incrustada ? Incrustada : Pagina;

  return (
    <Marco>
      {incrustada ? (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="m-0 text-[13px] text-ui-tinta-2">Son anónimas: no se muestra quién respondió.</p>
          <div className="flex items-center gap-3">{controles}</div>
        </div>
      ) : (
        <Encabezado titulo="Encuestas"
          descripcion="Lo que opinan los estudiantes al terminar cada práctica. Son anónimas: no se muestra quién respondió."
          derecha={controles} />
      )}
      {cargando && !datos ? (
        <div className={`${TARJETA} h-[240px] bg-ui-pista`} role="status" aria-busy="true"><span className="sr-only">Cargando…</span></div>
      ) : error && !datos ? (
        <Aviso nivel="critico" titulo="No se pudieron cargar las encuestas" detalle={error}
          accion={<Boton onClick={() => void actualizar()} disabled={actualizando}>Reintentar</Boton>} />
      ) : !datos?.practicas.length ? (
        <Aviso titulo="Todavía no hay encuestas en este período"
          detalle="Aparecen cuando un estudiante termina todos los módulos de una práctica." />
      ) : (
        datos.practicas.map((p) => <Practica key={p.practica} p={p} nombre={nombres[p.practica] ?? p.practica} />)
      )}
    </Marco>
  );
}

const Incrustada = ({ children }: { children: ReactNode }) => <div className="flex flex-col gap-7">{children}</div>;

function Practica({ p, nombre }: { p: ResumenPracticaEncuesta; nombre: string }) {
  const problemas = problemasOrdenados(p.problemas);
  const dificultad = repartoDificultad(p.dificultad, p.respuestas).filter((d) => d.veces > 0);
  const sinProblemas = p.problemas.ninguno ?? 0;
  const [pagina, setPagina] = useState(1);
  const comentarios = paginar(p.comentarios, pagina, COMENTARIOS_POR_PAGINA);
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
                <span className={`text-right font-ui-num ${nivel === 'bien' ? 'text-ui-tinta' : TEXTO_NIVEL[nivel]}`}>{nota5(v)}</span>
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
                <span className="text-ui-tinta">{x.etiqueta}</span><Num>{x.veces}</Num>
              </div>
            )) : <span className="text-[13px] text-ui-tinta-2">Nadie reportó problemas.</span>}
            {sinProblemas > 0 && problemas.length > 0 && <span className={NOTA}>{sinProblemas} sin ningún problema.</span>}
          </div>
        </div>
      </div>

      <div className={`${TARJETA} flex flex-col`}>
        <h4 className={`${ETIQUETA} border-b border-ui-borde px-5 py-2.5`}>Comentarios</h4>
        {p.comentarios.length ? comentarios.filas.map((c, i) => (
          <div key={i} className={`flex flex-col gap-1 px-5 py-3 text-[13px] ${i ? 'border-t border-ui-pista' : ''}`}>
            <span className={NOTA}>{fecha(c.fecha)}</span>
            {c.gusto && <span className="text-ui-tinta-2">Le gustó: {c.gusto}</span>}
            {c.mejorar && <span className="text-ui-tinta-2">Mejoraría: {c.mejorar}</span>}
          </div>
        )) : <span className="px-5 py-3 text-[13px] text-ui-tinta-2">Sin comentarios escritos.</span>}
        {p.comentarios.length > COMENTARIOS_POR_PAGINA && <Paginador pagina={comentarios} onPagina={setPagina} unidad="comentarios" />}
      </div>
    </Seccion>
  );
}
