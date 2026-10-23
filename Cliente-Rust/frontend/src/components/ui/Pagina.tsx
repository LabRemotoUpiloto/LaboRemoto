// components/ui/Pagina.tsx — el marco de cada página: ancho de lectura, encabezado y pestañas, iguales en todas.
import React from 'react';

/** Página: ancho de lectura y el mismo margen en todas. `main#contenido` es el destino de «Saltar al contenido». */
export function Pagina({ children, ancho = 'max-w-[1080px]' }: { children: React.ReactNode; ancho?: string }) {
  return (
    <div className="h-full overflow-auto bg-ui-fondo">
      <main id="contenido" tabIndex={-1} className={`mx-auto flex w-full ${ancho} flex-col gap-7 px-8 pb-12 pt-7 outline-none`}>
        {children}
      </main>
    </div>
  );
}

/** El mismo encabezado en todas las páginas: título, para qué sirve y, a la derecha, lo que la controla. */
export function Encabezado({ titulo, descripcion, derecha, pestanas }: {
  titulo: string;
  descripcion: string;
  derecha?: React.ReactNode;
  pestanas?: React.ReactNode;
}) {
  return (
    <header className={`flex flex-col gap-4 ${pestanas ? '' : 'pb-2'}`}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h1 className="m-0 font-ui-titulo text-2xl font-bold leading-tight text-ui-tinta">{titulo}</h1>
          <p className="m-0 text-[13px] text-ui-tinta-2">{descripcion}</p>
        </div>
        {derecha && <div className="flex items-center gap-3">{derecha}</div>}
      </div>
      {pestanas}
    </header>
  );
}

/** Pestañas de una página: texto con subrayado del acento en la activa; con el mouse encima, subrayado gris. */
export function Pestanas<T extends string>({ opciones, valor, onCambio, nombre = 'Secciones de la página' }: {
  opciones: { valor: T; etiqueta: string }[];
  valor: T;
  onCambio: (v: T) => void;
  nombre?: string;
}) {
  return (
    <nav aria-label={nombre} className="flex gap-6 border-b border-ui-borde">
      {opciones.map((o) => (
        <button
          key={o.valor}
          type="button"
          aria-current={o.valor === valor ? 'page' : undefined}
          onClick={() => onCambio(o.valor)}
          className="-mb-px border-b-2 border-transparent pb-2.5 text-[13px] font-semibold text-ui-apagado hover:border-ui-banda hover:text-ui-tinta aria-[current=page]:border-ui-acento-texto aria-[current=page]:text-ui-tinta"
        >
          {o.etiqueta}
        </button>
      ))}
    </nav>
  );
}
