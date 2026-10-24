// features/cuenta/ThemesPage.tsx — elegir el tema de toda la aplicación (se guarda en este equipo). Por grupos; el que está en
// uso se marca con «En uso». Los roles con tema institucional no llegan aquí (ver usePermissions).
import { useTheme, type Theme } from '@/app/providers/ThemeContext';
import { Encabezado, Pagina, Punto, Seccion, TARJETA } from '@/components/ui';

export interface InfoTema {
  id: Theme;
  label: string;
  grupo: 'Institucional' | 'Claros' | 'Oscuros' | 'Especiales';
  /** Vista previa: los colores del tema en un degradado. */
  vista: string;
  descripcion: string;
}

export const TEMAS: InfoTema[] = [
  { id: 'unipiloto', label: 'Universidad Piloto', grupo: 'Institucional', vista: 'linear-gradient(135deg, #f4f4f4 0%, #ffffff 55%, #d51f22 100%)', descripcion: 'Identidad oficial: blanco institucional con rojo Unipiloto' },
  { id: 'lavender-dream', label: 'Lavender Dream', grupo: 'Claros', vista: 'linear-gradient(135deg, #f5f3ff, #ede9fe)', descripcion: 'Lavanda suave con toques violeta y vidrio translúcido' },
  { id: 'polar-mint', label: 'Polar Mint', grupo: 'Claros', vista: 'linear-gradient(135deg, #f0fdf4, #dcfce7)', descripcion: 'Fresco, limpio y minimalista' },
  { id: 'sepia-paper', label: 'Sepia Paper', grupo: 'Claros', vista: 'linear-gradient(135deg, #fbf5ef, #f3e9de)', descripcion: 'Papel cálido estilo libro clásico' },
  { id: 'dracula', label: 'Dracula Console', grupo: 'Oscuros', vista: 'linear-gradient(135deg, #44475a, #282a36)', descripcion: 'Terminal retro cyberpunk' },
  { id: 'neo-brutalist', label: 'Brutalist Lime', grupo: 'Oscuros', vista: 'linear-gradient(135deg, #121212, #84cc16)', descripcion: 'Neobrutalismo con bordes gruesos y lima neón' },
  { id: 'amber-night', label: 'Amber Night', grupo: 'Oscuros', vista: 'linear-gradient(135deg, #2d241d, #120d0a)', descripcion: 'Ámbar profundo con toques bronce' },
  { id: 'oceanic-teal', label: 'Oceanic Teal', grupo: 'Oscuros', vista: 'linear-gradient(135deg, #134e4a, #0a1a1a)', descripcion: 'Vidrio marino fresco y tranquilo' },
  { id: 'crimson-gold', label: 'Crimson Gold', grupo: 'Oscuros', vista: 'linear-gradient(135deg, #450a0a, #1a0f0f)', descripcion: 'Rojo imperial intenso con detalles dorados' },
  { id: 'obsidian-rose', label: 'Obsidian Rose', grupo: 'Oscuros', vista: 'linear-gradient(135deg, #1c0a0a, #0a0505)', descripcion: 'Synthwave fucsia sobre obsidiana' },
  { id: 'pastel-dream', label: 'Pastel Dream', grupo: 'Especiales', vista: 'linear-gradient(45deg, #ffc9e5, #ffd9a3, #fff4b3, #c9f5d9, #c9e5ff, #e5c9ff)', descripcion: 'Colores pastel suaves y divertidos' },
  { id: 'sunburst-rainbow', label: 'Sunburst Rainbow', grupo: 'Especiales', vista: 'linear-gradient(45deg, #ff4b6b, #ff8b3b, #ffd56b, #6bff8b, #6bd7ff)', descripcion: 'Arcoíris cálido con efectos animados' },
  { id: 'glass-water', label: 'Liquid Glass', grupo: 'Especiales', vista: 'linear-gradient(135deg, #ff007f 0%, #00f0ff 100%)', descripcion: 'Vidrio líquido sobre orbes de neón' },
];

const GRUPOS: InfoTema['grupo'][] = ['Institucional', 'Claros', 'Oscuros', 'Especiales'];

export default function ThemesPage() {
  const { theme, setTheme } = useTheme();
  return (
    <Pagina>
      <Encabezado titulo="Temas" descripcion="Cambia el aspecto de toda la aplicación. Se guarda en este equipo." />
      {GRUPOS.map((g) => (
        <Seccion key={g} titulo={g}>
          <div role="radiogroup" aria-label={`Temas: ${g}`} className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-4">
            {TEMAS.filter((t) => t.grupo === g).map((t) => {
              const activo = t.id === theme;
              return (
                <button key={t.id} type="button" role="radio" aria-checked={activo} onClick={() => setTheme(t.id)}
                  className={`${TARJETA} flex flex-col overflow-hidden text-left transition-colors hover:border-ui-acento-texto ${activo ? '!border-2 !border-ui-acento-texto' : ''}`}>
                  <span className="h-16 w-full border-b border-ui-pista" style={{ background: t.vista }} aria-hidden />
                  <span className="flex flex-col gap-1 px-3.5 py-3">
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-semibold text-ui-tinta">{t.label}</span>
                      {activo && <Punto nivel="bien" fuerte="En uso" />}
                    </span>
                    <span className="truncate text-[12px] text-ui-apagado" title={t.descripcion}>{t.descripcion}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </Seccion>
      ))}
    </Pagina>
  );
}
