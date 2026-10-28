// features/registros/RegistrosEstudiantes.tsx — pestaña «Prácticas de estudiantes» de Conexiones: el registro de la terminal
// de cada intento de práctica de Linux, guardado en la Pi. Para admin_lab, semillerista y docente (el servidor lo vuelve a
// exigir). El registro se ve en un marco aislado: es HTML generado por la app, pero con lo que el estudiante escribió.
import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import {
  Aviso, Boton, Buscador, Desplegable, Dialogo, FilasCargando, NOTA, Num, Paginador, RADIO, Tabla, paginar,
} from '@/components/ui';
import { useResumen } from '@/features/actividad/useResumen';
import { BotonActualizar, useActualizar } from '@/features/actividad/BotonActualizar';
import { fechaCorta, lapso } from '@/features/actividad/actividad';
import { registrosService, type RegistroIntento } from './registros.service';
import { TEXTO_ESTADO, diasDe, filtrar, practicasDe, type Periodo } from './filtros';

const POR_PAGINA = 8;
const PLANTILLA = 'grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_110px_110px_90px_64px]';
const COLUMNAS = [
  { titulo: 'Estudiante' }, { titulo: 'Práctica' }, { titulo: 'Estado' }, { titulo: 'Terminó', derecha: true },
  { titulo: 'Duración', derecha: true }, { titulo: '' },
];

export default function RegistrosEstudiantes() {
  const [busqueda, setBusqueda] = useState('');
  const [practica, setPractica] = useState('');
  const [estado, setEstado] = useState('');
  const [periodo, setPeriodo] = useState<Periodo>('7');
  const [pagina, setPagina] = useState(1);
  const [abierto, setAbierto] = useState<RegistroIntento | null>(null);
  const { datos, error, cargando, ahora, recargar } = useResumen(registrosService.listar, diasDe(periodo));
  const { actualizando, actualizar } = useActualizar([recargar], { bien: 'Registros actualizados', mal: 'No se pudieron actualizar los registros' });
  useEffect(() => { setPagina(1); }, [busqueda, practica, estado, periodo]);

  const registros = datos?.registros ?? [];
  const practicas = useMemo(() => practicasDe(registros), [registros]);
  const visibles = useMemo(() => filtrar(registros, { busqueda, practica, estado, periodo }, ahora), [registros, busqueda, practica, estado, periodo, ahora]);
  const pag = paginar(visibles, pagina, POR_PAGINA);
  const filtrando = !!(busqueda.trim() || practica || estado);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-[13px] text-ui-tinta-2">
          Lo que cada estudiante hizo en la terminal durante las prácticas de Linux. Se guardan {datos?.retencionDias ?? 20} días.
        </p>
        <BotonActualizar actualizando={actualizando} onClick={() => void actualizar()} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Buscador icono={Search} valor={busqueda} onCambio={setBusqueda} placeholder="Buscar estudiante" />
        <Desplegable etiqueta="Práctica" valor={practica} onCambio={setPractica} className="w-[200px]"
          opciones={[{ valor: '', etiqueta: 'Todas las prácticas' }, ...practicas]} />
        <Desplegable etiqueta="Estado" valor={estado} onCambio={setEstado} className="w-[170px]"
          opciones={[{ valor: '', etiqueta: 'Todos los estados' }, ...Object.entries(TEXTO_ESTADO).map(([valor, etiqueta]) => ({ valor, etiqueta }))]} />
        <Desplegable<Periodo> etiqueta="Período" valor={periodo} onCambio={setPeriodo} className="w-[170px]"
          opciones={[{ valor: 'hoy', etiqueta: 'Hoy' }, { valor: '7', etiqueta: 'Últimos 7 días' }, { valor: '20', etiqueta: 'Últimos 20 días' }]} />
      </div>

      {error && !datos ? (
        <Aviso nivel="critico" titulo="No se pudieron cargar los registros" detalle={error}
          accion={<Boton onClick={() => void actualizar()} disabled={actualizando}>Reintentar</Boton>} />
      ) : cargando && !datos ? (
        <FilasCargando plantilla={PLANTILLA} columnas={COLUMNAS.length} />
      ) : !visibles.length ? (
        <Aviso titulo={filtrando ? 'Ningún registro coincide con los filtros' : 'Todavía no hay registros en este período'}
          detalle={filtrando ? undefined : 'Aparecen cuando un estudiante aprueba una práctica de Linux, la cierra o cierra la app.'} />
      ) : (
        <div aria-busy={cargando} className={`transition-opacity duration-300 ${cargando ? 'opacity-50' : ''}`}>
          <Tabla plantilla={PLANTILLA} columnas={COLUMNAS} claves={pag.filas.map((r) => `${r.carpeta}:${r.id}`)}
            filas={pag.filas.map((r) => [
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-semibold text-ui-tinta" title={r.nombre ?? r.usuario}>{r.nombre ?? r.usuario}</span>
                <span className={`truncate ${NOTA}`}>{r.usuario}</span>
              </span>,
              <span className="block truncate" title={r.practicaNombre ?? r.practica}>{r.practicaNombre ?? r.practica}</span>,
              <span>{TEXTO_ESTADO[r.estado] ?? r.estado}</span>,
              <Num>{fechaCorta(Date.parse(r.fin))}</Num>,
              <Num>{lapso(Date.parse(r.fin) - Date.parse(r.inicio))}</Num>,
              <span className="flex justify-end"><Boton onClick={() => setAbierto(r)}>Ver</Boton></span>,
            ])}
            pie={visibles.length > POR_PAGINA && <Paginador pagina={pag} onPagina={setPagina} unidad="registros" />} />
        </div>
      )}

      {abierto && <VerRegistro registro={abierto} onCerrar={() => setAbierto(null)} />}
    </>
  );
}

function VerRegistro({ registro: r, onCerrar }: { registro: RegistroIntento; onCerrar: () => void }) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    registrosService.archivo(r.carpeta, r.id)
      .then((h) => { if (vivo) setHtml(h); })
      .catch((e) => { if (vivo) setError((e as { message?: string })?.message ?? String(e)); });
    return () => { vivo = false; };
  }, [r.carpeta, r.id]);

  return (
    <Dialogo titulo={`${r.nombre ?? r.usuario}, ${r.practicaNombre ?? r.practica}`} descripcion={r.archivo}
      // ancho que deja libre la barra lateral (queda por encima del fondo de los diálogos)
      ancho="w-[min(calc(100vw-480px),1000px)]" onCerrar={onCerrar} acciones={<Boton onClick={onCerrar}>Cerrar</Boton>}>
      {error ? (
        <Aviso nivel="critico" titulo="No se pudo abrir el registro" detalle={error} />
      ) : html === null ? (
        <div className={`h-[65vh] ${RADIO} bg-ui-pista`} role="status" aria-busy="true"><span className="sr-only">Cargando…</span></div>
      ) : (
        // sandbox vacío: sin scripts, sin formularios y en otro origen (el registro trae texto que escribió el estudiante)
        <iframe title={`Registro de ${r.nombre ?? r.usuario}`} srcDoc={html} sandbox="" className={`h-[65vh] w-full ${RADIO} border border-ui-borde bg-ui-superficie`} />
      )}
    </Dialogo>
  );
}
