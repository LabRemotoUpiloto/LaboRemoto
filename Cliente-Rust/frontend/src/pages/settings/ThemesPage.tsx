import React, { useRef } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { Badge, Text, Group, Box, Card, Stack } from '@mantine/core';

type ThemeCategory = 'dark' | 'light' | 'special';

interface ThemeInfo {
  id: string;
  label: string;
  gradient: string;
  category: ThemeCategory;
  description?: string;
  swatches?: number;
}

const THEMES: ThemeInfo[] = [
  // Temas Oscuros
  { id: 'default', label: 'Predeterminado', gradient: 'linear-gradient(135deg, #1e293b, #0f172a)', category: 'dark', description: 'Tema oscuro profesional' },
  { id: 'dracula', label: 'Dracula', gradient: 'linear-gradient(135deg, #44475a, #282a36)', category: 'dark', description: 'Retro y vibrante' },
  { id: 'crimson-gold', label: 'Crimson Gold', gradient: 'linear-gradient(135deg, #450a0a, #1a0f0f)', category: 'dark', description: 'Rojo intenso con detalles dorados' },
  { id: 'obsidian-rose', label: 'Obsidian Rose', gradient: 'linear-gradient(135deg, #1c0a0a, #0a0505)', category: 'dark', description: 'Dramático e intenso' },
  { id: 'aurora-coral', label: 'Aurora Coral', gradient: 'linear-gradient(135deg, #2a1f1a, #1a1512)', category: 'dark', description: 'Cálido y acogedor' },
  { id: 'electric-indigo', label: 'Electric Indigo', gradient: 'linear-gradient(135deg, #1e1b4b, #0f0a1a)', category: 'dark', description: 'Índigo eléctrico con chispas cyan' },
  { id: 'amber-night', label: 'Amber Night', gradient: 'linear-gradient(135deg, #2d241d, #120d0a)', category: 'dark', description: 'Ámbar profundo con toques bronce' },
  { id: 'oceanic-teal', label: 'Oceanic Teal', gradient: 'linear-gradient(135deg, #134e4a, #0a1a1a)', category: 'dark', description: 'Fresco y tranquilo' },
  { id: 'toxic-lime', label: 'Toxic Lime', gradient: 'linear-gradient(135deg, #1a2e05, #0a1205)', category: 'dark', description: 'Lima radioactivo con neón ácido' },
  { id: 'violet-ember', label: 'Violet Ember', gradient: 'linear-gradient(135deg, #2e1065, #120a1a)', category: 'dark', description: 'Místico y elegante' },
  { id: 'metro-gray', label: 'Metro Gray', gradient: 'linear-gradient(135deg, #334155, #1a1a1a)', category: 'dark', description: 'Neutro e industrial' },
  
  // Temas Claros
  { id: 'light', label: 'Light', gradient: 'linear-gradient(135deg, #f8fafc, #ffffff)', category: 'light', description: 'Limpio y profesional' },
  { id: 'lavender-dream', label: 'Lavender Dream', gradient: 'linear-gradient(135deg, #f5f3ff, #ede9fe)', category: 'light', description: 'Lavanda suave con toques violeta' },
  { id: 'polar-mint', label: 'Polar Mint', gradient: 'linear-gradient(135deg, #f0fdf4, #dcfce7)', category: 'light', description: 'Fresco y energizante' },
  { id: 'peachy-sunrise', label: 'Peachy Sunrise', gradient: 'linear-gradient(135deg, #fff7ed, #ffedd5)', category: 'light', description: 'Durazno vibrante con amanecer coral' },
  { id: 'sakura-blush', label: 'Sakura Blush', gradient: 'linear-gradient(135deg, #fff1f2, #ffe4e6)', category: 'light', description: 'Delicado y suave' },
  { id: 'rose-quartz', label: 'Rose Quartz', gradient: 'linear-gradient(135deg, #fff1f2, #fce7f3)', category: 'light', description: 'Rosa cuarzo con detalles fucsia' },
  { id: 'silver-cloud', label: 'Silver Cloud', gradient: 'linear-gradient(135deg, #f0f9ff, #e0f2fe)', category: 'light', description: 'Plateado brillante con azul cielo' },
  
  // Institucional
  { id: 'unipiloto', label: 'Universidad Piloto', gradient: 'linear-gradient(135deg, #f4f4f4 0%, #ffffff 55%, #d51f22 100%)', category: 'light', description: 'Identidad oficial — blanco institucional con rojo Unipiloto' },

  // Temas Especiales
  { id: 'sunburst-rainbow', label: 'Sunburst Rainbow', gradient: 'linear-gradient(45deg, #ff4b6b, #ff8b3b, #ffd56b, #6bff8b, #6bd7ff)', category: 'special', description: 'Arcoíris cálido con efectos RGB animados', swatches: 5 },
  { id: 'bold-rainbow', label: 'Bold Rainbow', gradient: 'linear-gradient(45deg, #ff0080, #ff8000, #ffff00, #00ff00, #00ffff, #0080ff, #8000ff)', category: 'special', description: 'RGB intenso con neón y resplandor', swatches: 7 },
  { id: 'pastel-dream', label: 'Pastel Dream', gradient: 'linear-gradient(45deg, #ffc9e5, #ffd9a3, #fff4b3, #c9f5d9, #c9e5ff, #e5c9ff)', category: 'special', description: 'Colores pastel suaves multi-color' },
  { id: 'fc-barcelona', label: 'FC Barcelona', gradient: 'linear-gradient(45deg, #004d98, #a50044, #edbb00)', category: 'special', description: 'Azulgrana del Barça con detalles dorados' },
];

const THEME_CATEGORIES = {
  dark: THEMES.filter(t => t.category === 'dark'),
  light: THEMES.filter(t => t.category === 'light'),
  special: THEMES.filter(t => t.category === 'special')
};

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
        className={`cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-lg ${isActive ? 'border-teal-500 border-2' : ''}`}
        style={!isActive ? { borderColor: 'var(--border-subtle)' } : {}}
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
            <div className="absolute top-2 right-2 w-7 h-7 bg-teal-500 text-white rounded-full flex items-center justify-center shadow-md animate-[scaleIn_0.25s_ease-out]">
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
    <div className="flex flex-col h-full overflow-hidden" style={{ backgroundColor: 'var(--background-primary)' }}>
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
          
          {/* Dark Themes */}
          <Box mb={40}>
            <Group gap="sm" mb="md" className="border-b pb-2" style={{ borderColor: 'var(--border-subtle)' }}>
              <Box className="flex items-center justify-center w-8 h-8 rounded-lg text-teal-400 shrink-0" style={{ backgroundColor: 'var(--interactive-hover)', border: '1px solid var(--border-subtle)' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              </Box>
              <Text fw={700} size="sm" className="uppercase tracking-wider">Temas Oscuros</Text>
              <Badge variant="light" color="gray" size="sm" radius="xl">{THEME_CATEGORIES.dark.length} temas</Badge>
            </Group>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4" ref={gridRef}>
              {THEME_CATEGORIES.dark.map(renderThemeCard)}
            </div>
          </Box>

          {/* Light Themes */}
          <Box mb={40}>
            <Group gap="sm" mb="md" className="border-b pb-2" style={{ borderColor: 'var(--border-subtle)' }}>
              <Box className="flex items-center justify-center w-8 h-8 rounded-lg text-teal-400 shrink-0" style={{ backgroundColor: 'var(--interactive-hover)', border: '1px solid var(--border-subtle)' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              </Box>
              <Text fw={700} size="sm" className="uppercase tracking-wider">Temas Claros</Text>
              <Badge variant="light" color="gray" size="sm" radius="xl">{THEME_CATEGORIES.light.length} temas</Badge>
            </Group>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
              {THEME_CATEGORIES.light.map(renderThemeCard)}
            </div>
          </Box>

          {/* Special Themes */}
          <Box mb={40}>
            <Group gap="sm" mb="md" className="border-b pb-2" style={{ borderColor: 'var(--border-subtle)' }}>
              <Box className="flex items-center justify-center w-8 h-8 rounded-lg text-teal-400 shrink-0" style={{ backgroundColor: 'var(--interactive-hover)', border: '1px solid var(--border-subtle)' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
              </Box>
              <Text fw={700} size="sm" className="uppercase tracking-wider">Temas Especiales</Text>
              <Badge variant="light" color="gray" size="sm" radius="xl">{THEME_CATEGORIES.special.length} temas</Badge>
            </Group>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
              {THEME_CATEGORIES.special.map(renderThemeCard)}
            </div>
          </Box>

        </div>
      </div>
    </div>
  );
}
