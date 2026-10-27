// features/circuitos/PasoCircuitoCard.tsx — un paso de la práctica de circuitos dentro del chat, como los de Linux: título, explicación,
// su contenido (párrafos, listas, imágenes y videos), lo que hay que lograr (las comprobaciones, en vivo) y, en los pasos de leer, su botón. Reporta su estado a la barra fija del chat
// (GuiaPractica) y, al completarse, queda resumido en una línea que se puede volver a abrir.
import { useEffect, useState } from 'react';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { BotonPrincipal, Num, PUNTO_NIVEL, TEXTO_NIVEL, type Nivel } from '@/components/ui';
import { EncabezadoPaso, type DatosGuia } from '@/features/practicas/linux/PasoCard';
import { corrienteLed, type Resultado } from './comprobaciones';
import { usePracticaEnCurso } from './practicaEnCurso';
import ContenidoPaso from './ContenidoPaso';

const NIVEL: Record<Resultado, Nivel> = { bien: 'bien', mal: 'critico', falta: 'apagado' };
const PALABRA: Record<Resultado, string> = { bien: 'Listo', mal: 'Revisar', falta: 'Falta' };
const mA = (a: number | null) => (a == null ? '—' : `${(a * 1000).toFixed(1).replace('.', ',')} mA`);

export default function PasoCircuitoCard({ pasoId, numero, total, onGuia }: {
  pasoId: string;
  numero: number;
  total: number;
  onGuia?: (datos: DatosGuia | null) => void;
}) {
  const enCurso = usePracticaEnCurso();
  const paso = enCurso?.practica.steps.find((s) => s.id === pasoId);
  // `null`: abierto mientras esté pendiente y resumido al completarse
  const [abierto, setAbierto] = useState<boolean | null>(null);

  const completo = !!enCurso && !!paso && enCurso.logrados.has(paso.id);
  const checks = enCurso && paso ? (paso.checks ?? []).map((id) => enCurso.practica.checks.find((c) => c.id === id)).filter((c) => !!c) : [];
  const resultado = (id: string): Resultado => enCurso?.resultados[id] ?? 'falta';
  const pendiente = checks.find((c) => resultado(c.id) !== 'bien');
  // la corriente del LED se muestra en los pasos que hablan de ella
  const lecturas = enCurso && checks.some((c) => c.type === 'led_on' || c.type === 'led_current') ? enCurso.practica.readings : [];

  useEffect(() => {
    if (!onGuia || !paso) return;
    if (completo) { onGuia(null); return; }
    onGuia(paso.button
      ? {
        acciones: [{ id: 'leer', texto: `Lee el paso y pulsa «${paso.button}»` }],
        hechas: new Set(), actual: 'leer', ahora: `Lee el paso y pulsa «${paso.button}».`,
        etiqueta: `Paso ${numero} de ${total}`, numero, total,
      }
      : {
        acciones: checks.map((c) => ({ id: c.id, texto: c.text })),
        hechas: new Set(checks.filter((c) => resultado(c.id) === 'bien').map((c) => c.id)),
        actual: pendiente?.id ?? null,
        ahora: pendiente ? `Logra que: ${pendiente.text.charAt(0).toLowerCase()}${pendiente.text.slice(1)}.` : null,
        etiqueta: `Paso ${numero} de ${total}`, numero, total,
      });
    // `resultado` y `checks` se recalculan en cada render a partir de enCurso.resultados
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onGuia, paso, completo, numero, total, pendiente?.id, enCurso?.resultados]);

  if (!enCurso || !paso) {
    // un chat guardado de una práctica que ya no está abierta (o cuyo paso cambió): solo el título
    return <p className="m-0 text-[13px] text-ui-apagado">Paso {numero} de la práctica de circuitos.</p>;
  }

  if (completo && abierto !== true) {
    return (
      <button type="button" onClick={() => setAbierto(true)} aria-label={`Ver de nuevo el paso ${numero}`}
        className="flex w-full items-center gap-2 py-1 text-left">
        <Check size={16} className="shrink-0 text-ui-bien-texto" aria-hidden />
        <span className="flex-1 text-[13px] text-ui-apagado">Paso {numero}: {paso.title}</span>
        <span className="text-[12px] text-ui-apagado">Ver de nuevo</span>
        <ChevronDown size={14} className="text-ui-apagado" aria-hidden />
      </button>
    );
  }

  return (
    <div className="w-full">
      <EncabezadoPaso
        titulo={paso.title}
        derecha={completo && (
          <button type="button" onClick={() => setAbierto(false)} className="flex items-center gap-1 text-[12px] text-ui-apagado">
            Ocultar <ChevronUp size={14} aria-hidden />
          </button>
        )}
      />
      <div className="flex flex-col gap-3">
        {paso.blocks?.length
          ? <ContenidoPaso bloques={paso.blocks} />
          : <p className="m-0 text-[13.5px] leading-relaxed text-ui-tinta-2">{paso.text}</p>}

        {checks.length > 0 && (
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0" aria-live="polite">
            {checks.map((c) => (
              <li key={c.id} className="flex items-center gap-2.5">
                <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${PUNTO_NIVEL[NIVEL[resultado(c.id)]]}`} />
                <span className="min-w-0 flex-1 text-[13px] text-ui-tinta">{c.text}</span>
                <span className={`shrink-0 text-[12px] ${TEXTO_NIVEL[NIVEL[resultado(c.id)]]}`}>{PALABRA[resultado(c.id)]}</span>
              </li>
            ))}
          </ul>
        )}

        {lecturas.map((l) => (
          <p key={l.text} className="m-0 flex items-baseline justify-between gap-3 text-[13px]">
            <span className="text-ui-tinta-2">{l.text}</span>
            <span className="text-ui-tinta"><Num>{enCurso.estado ? mA(corrienteLed(enCurso.estado, l.led)) : '—'}</Num></span>
          </p>
        ))}

        {paso.button && !completo && (
          <BotonPrincipal className="self-start" onClick={() => enCurso.pulsar(paso.id)}>{paso.button}</BotonPrincipal>
        )}
      </div>
    </div>
  );
}
