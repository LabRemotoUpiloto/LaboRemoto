import React, { useRef } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { Text, Group, Box, Card, Stack } from '@mantine/core';

interface ThemeInfo {
  id: string;
  label: string;
  gradient: string;
  description?: string;
  swatches?: number;
}

const THEMES: ThemeInfo[] = [
  // Institucional
  { id: 'unipiloto', label: 'Universidad Piloto', gradient: 'linear-gradient(135deg, #f4f4f4 0%, #ffffff 55%, #d51f22 100%)', description: 'Identidad oficial — blanco institucional con rojo Unipiloto' },

  // Claros
  { id: 'lavender-dream', label: 'Lavender Dream', gradient: 'linear-gradient(135deg, #f5f3ff, #ede9fe)', description: 'Lavanda suave con toques violeta y vidrio translúcido' },
  { id: 'polar-mint', label: 'Polar Mint', gradient: 'linear-gradient(135deg, #f0fdf4, #dcfce7)', description: 'Fresco, limpio y minimalista' },
  { id: 'sepia-paper', label: 'Sepia Paper', gradient: 'linear-gradient(135deg, #fbf5ef, #f3e9de)', description: 'Papel cálido vintage estilo libro clásico' },

  // Oscuros
  { id: 'dracula', label: 'Dracula Console', gradient: 'linear-gradient(135deg, #44475a, #282a36)', description: 'Retro terminal cyberpunk' },
  { id: 'neo-brutalist', label: 'Brutalist Lime', gradient: 'linear-gradient(135deg, #121212, #84cc16)', description: 'Neo-Brutalismo con bordes gruesos y lima neón' },
  { id: 'amber-night', label: 'Amber Night', gradient: 'linear-gradient(135deg, #2d241d, #120d0a)', description: 'Ámbar de lujo profundo con toques bronce' },
  { id: 'oceanic-teal', label: 'Oceanic Teal', gradient: 'linear-gradient(135deg, #134e4a, #0a1a1a)', description: 'Vidrio marino fresco y tranquilo' },
  { id: 'crimson-gold', label: 'Crimson Gold', gradient: 'linear-gradient(135deg, #450a0a, #1a0f0f)', description: 'Rojo imperial intenso con detalles dorados' },
  { id: 'obsidian-rose', label: 'Obsidian Rose', gradient: 'linear-gradient(135deg, #1c0a0a, #0a0505)', description: 'Synthwave fucsia sobre obsidiana' },

  // Especiales
  { id: 'pastel-dream', label: 'Pastel Dream', gradient: 'linear-gradient(45deg, #ffc9e5, #ffd9a3, #fff4b3, #c9f5d9, #c9e5ff, #e5c9ff)', description: 'Colores pastel suaves multi-color y divertidos' },
  { id: 'sunburst-rainbow', label: 'Sunburst Rainbow', gradient: 'linear-gradient(45deg, #ff4b6b, #ff8b3b, #ffd56b, #6bff8b, #6bd7ff)', description: 'Arcoíris cálido con efectos RGB animados', swatches: 5 },
  { id: 'glass-water', label: 'Liquid Glass', gradient: 'linear-gradient(135deg, #ff007f 0%, #00f0ff 100%)', description: 'Vidrio líquido refractivo sobre orbes de neón vibrantes' },
];

export default function ThemesPage() {
  const { theme, setTheme } = useTheme();
  const gridRef = useRef<HTMLDivElement>(null);

  const renderThemeCard = (t: ThemeInfo) => {
    const isActive = theme === t.id;
    return (
      <Card
        key={t.id}
        padding={0}
        radius="md"
        withBorder
        className="dribbble-card dribbble-card-interactive cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-lg"
        style={{
          borderColor: isActive ? 'var(--accent-primary)' : 'var(--border-subtle)',
          borderWidth: isActive ? '2px' : '1px',
        }}
        role="radio"
        aria-checked={isActive}
        tabIndex={0}
        onClick={() => setTheme(t.id as any)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setTheme(t.id as any); }}
      >
        <Box className="h-[110px] w-full relative overflow-hidden shrink-0" style={{ background: t.gradient }}>
          {/* Overlay fade */}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/20 pointer-events-none" />

          {/* Active indicator */}
          {isActive && (
            <div
              className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center shadow-md animate-[scaleIn_0.25s_ease-out]"
              style={{
                backgroundColor: 'var(--accent-primary)',
                color: 'var(--accent-contrast, #ffffff)',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
          )}
        </Box>

        {t.swatches && (
          <Group gap={4} px="sm" pt="sm">
            {Array.from({ length: t.swatches }).map((_, i) => (
              <div key={i} className="w-2.5 h-2.5 rounded-full" style={{ border: '1px solid var(--border-strong)' }} />
            ))}
          </Group>
        )}

        <Stack gap={2} p="sm" className="flex-1">
          <Text size="sm" fw={700} truncate>{t.label}</Text>
          {t.description && <Text size="xs" c="dimmed" truncate>{t.description}</Text>}
        </Stack>
      </Card>
    );
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="page-header-integrated border-b pb-4" style={{ borderColor: 'var(--border-subtle)' }}>
        <h2 className="page-header-title">Temas</h2>
        <div className="page-header-content">
          <p className="page-header-description">
            Personaliza la apariencia de la aplicación con temas únicos.
          </p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 scroll-smooth custom-scrollbar">
        <div className="max-w-[1400px] mx-auto pb-10">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4" ref={gridRef}>
            {THEMES.map(renderThemeCard)}
          </div>
        </div>
      </div>
    </div>
  );
}
