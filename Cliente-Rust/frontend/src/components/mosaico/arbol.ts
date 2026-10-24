// components/mosaico/arbol.ts — el acomodo de un mosaico como árbol de divisiones (mismo modelo que la terminal local):
// cada hoja es un panel; cada división reparte su espacio entre sus hijos en horizontal o en vertical. Sin React, para probarlo.

export type Lado = 'izquierda' | 'derecha' | 'arriba' | 'abajo' | 'centro';

export type Nodo =
  | { tipo: 'hoja'; id: string }
  | { tipo: 'division'; id: string; direccion: 'horizontal' | 'vertical'; hijos: Nodo[]; tamanos?: number[] };

let contador = 0;
const nuevoId = () => `d${Date.now().toString(36)}${(contador++).toString(36)}`;

export const hoja = (id: string): Nodo => ({ tipo: 'hoja', id });
export const division = (direccion: 'horizontal' | 'vertical', hijos: Nodo[], tamanos?: number[]): Nodo =>
  ({ tipo: 'division', id: nuevoId(), direccion, hijos, tamanos });

/** Los paneles del árbol, en orden de lectura. */
export const hojas = (n: Nodo | null): string[] => (!n ? [] : n.tipo === 'hoja' ? [n.id] : n.hijos.flatMap(hojas));

/** Quita un panel; una división que queda con un solo hijo se reemplaza por ese hijo. `null` si no queda nada. */
export function quitar(n: Nodo | null, id: string): Nodo | null {
  if (!n) return null;
  if (n.tipo === 'hoja') return n.id === id ? null : n;
  const hijos = n.hijos.map((h) => quitar(h, id)).filter((h): h is Nodo => h !== null);
  if (!hijos.length) return null;
  if (hijos.length === 1) return hijos[0];
  return hijos.length === n.hijos.length ? { ...n, hijos } : { ...n, hijos, tamanos: undefined };
}

function reemplazar(n: Nodo, id: string, por: Nodo): Nodo {
  if (n.tipo === 'hoja') return n.id === id ? por : n;
  return { ...n, hijos: n.hijos.map((h) => reemplazar(h, id, por)) };
}

/** Lleva el panel `id` al lado de `destino`; en el centro, los intercambia. */
export function mover(arbol: Nodo, id: string, destino: string, lado: Lado): Nodo {
  const presentes = hojas(arbol);
  if (id === destino || !presentes.includes(id) || !presentes.includes(destino)) return arbol;
  if (lado === 'centro') {
    const marca = '\u0000intercambio';
    return reemplazar(reemplazar(reemplazar(arbol, id, hoja(marca)), destino, hoja(id)), marca, hoja(destino));
  }
  const sinEl = quitar(arbol, id);
  if (!sinEl) return arbol;
  const direccion = lado === 'izquierda' || lado === 'derecha' ? 'horizontal' : 'vertical';
  const antes = lado === 'izquierda' || lado === 'arriba';
  return reemplazar(sinEl, destino, division(direccion, antes ? [hoja(id), hoja(destino)] : [hoja(destino), hoja(id)]));
}

/**
 * Abre un panel sin pisar lo que hay. Si no hay nada, ocupa todo. Si el principal (la terminal) está solo, el panel va a
 * su derecha con un tercio del ancho; si ya hay una columna a la derecha, se suma abajo en esa columna.
 */
export function abrir(arbol: Nodo | null, id: string, principal: string): Nodo {
  if (!arbol) return hoja(id);
  if (hojas(arbol).includes(id)) return arbol;
  if (arbol.tipo === 'division' && arbol.direccion === 'horizontal') {
    const ultima = arbol.hijos[arbol.hijos.length - 1];
    if (!hojas(ultima).includes(principal)) {
      const columna: Nodo = ultima.tipo === 'division' && ultima.direccion === 'vertical'
        ? { ...ultima, hijos: [...ultima.hijos, hoja(id)], tamanos: undefined }
        : division('vertical', [ultima, hoja(id)]);
      return { ...arbol, hijos: [...arbol.hijos.slice(0, -1), columna] };
    }
  }
  return division('horizontal', [arbol, hoja(id)], [66, 34]);
}

/** Abre el panel si no está; si está, lo oculta. */
export const alternar = (arbol: Nodo | null, id: string, principal: string): Nodo | null =>
  hojas(arbol).includes(id) ? quitar(arbol, id) : abrir(arbol, id, principal);

/** Guarda los tamaños (en %) de una división después de que la persona arrastra un separador. */
export function conTamanos(n: Nodo, divisionId: string, tamanos: number[]): Nodo {
  if (n.tipo === 'hoja') return n;
  if (n.id === divisionId) return { ...n, tamanos };
  return { ...n, hijos: n.hijos.map((h) => conTamanos(h, divisionId, tamanos)) };
}
