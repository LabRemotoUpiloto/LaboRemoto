// vite.informe.ts — `npm run build:informe`: qué pesa cada paquete del build y de dónde sale (librería o carpeta de src/), y
// qué se carga al arrancar (lo que el index importa de forma estática) frente a lo que se carga después. Escribe
// dist/informe-paquetes.json y un resumen en la consola, para medir antes y después de un cambio.
import type { Plugin } from 'vite';

/** `node_modules/@scope/pkg/...` → `@scope/pkg`; `src/features/chat/...` → `src/features/chat`. */
function origen(id: string): string {
  const limpio = id.replace(/\\/g, '/').replace(/\?.*$/, '');
  const nm = limpio.lastIndexOf('/node_modules/');
  if (nm >= 0) {
    const partes = limpio.slice(nm + 14).split('/');
    return partes[0].startsWith('@') ? `${partes[0]}/${partes[1]}` : partes[0];
  }
  const src = limpio.indexOf('/src/');
  if (src >= 0) {
    const partes = limpio.slice(src + 1).split('/');
    return partes.slice(0, partes[1] === 'features' || partes[1] === 'components' ? 3 : 2).join('/');
  }
  return limpio.startsWith('\0') ? '(vite)' : limpio;
}

const kb = (n: number) => `${(n / 1024).toFixed(0).padStart(6)} KB`;

export function informePaquetes(): Plugin {
  return {
    name: 'informe-paquetes',
    apply: 'build',
    generateBundle(_opciones, bundle) {
      const chunks = Object.values(bundle).filter((c) => c.type === 'chunk');
      const entrada = chunks.find((c) => c.isEntry);
      // lo que el navegador baja antes de pintar: la entrada y todo lo que importa de forma estática, en cadena
      const alArrancar = new Set<string>();
      const pendientes = entrada ? [entrada.fileName] : [];
      while (pendientes.length) {
        const f = pendientes.pop()!;
        if (alArrancar.has(f)) continue;
        alArrancar.add(f);
        const c = bundle[f];
        if (c?.type === 'chunk') pendientes.push(...c.imports);
      }

      const informe = chunks
        .map((c) => {
          const porOrigen: Record<string, number> = {};
          for (const [id, m] of Object.entries(c.modules)) porOrigen[origen(id)] = (porOrigen[origen(id)] ?? 0) + m.renderedLength;
          return {
            archivo: c.fileName,
            bytes: c.code.length,
            alArrancar: alArrancar.has(c.fileName),
            origenes: Object.entries(porOrigen).sort((a, b) => b[1] - a[1]).map(([nombre, bytes]) => ({ nombre, bytes })),
          };
        })
        .sort((a, b) => Number(b.alArrancar) - Number(a.alArrancar) || b.bytes - a.bytes);

      this.emitFile({ type: 'asset', fileName: 'informe-paquetes.json', source: JSON.stringify(informe, null, 2) });

      const total = (filtro: (i: (typeof informe)[number]) => boolean) => informe.filter(filtro).reduce((s, i) => s + i.bytes, 0);
      const lineas = [
        '',
        `JS al arrancar: ${kb(total((i) => i.alArrancar)).trim()}   después: ${kb(total((i) => !i.alArrancar)).trim()}`,
        '',
      ];
      for (const i of informe.filter((x) => x.bytes > 20 * 1024)) {
        lineas.push(`${i.alArrancar ? 'ARRANQUE' : 'después '} ${kb(i.bytes)}  ${i.archivo}`);
        for (const o of i.origenes.slice(0, 8)) lineas.push(`                    ${kb(o.bytes)}  ${o.nombre}`);
      }
      console.log(lineas.join('\n'));
    },
  };
}
