import React from 'react';
import { Button, Group, Text, Stack } from '@mantine/core';
import { Wrench, Rocket, CheckCircle } from 'lucide-react';

interface AnalysisActionButtonsProps {
  onEditWithRecommendations: () => void;
  onImproveFile: () => void;
  onApplyRecommendations: () => void;
  fileName?: string;
  disabled?: boolean;
}

export const AnalysisActionButtons: React.FC<AnalysisActionButtonsProps> = ({
  onEditWithRecommendations,
  onImproveFile,
  onApplyRecommendations,
  fileName,
  disabled = false
}) => {
  return (
    <div className="mt-3 p-3 bg-[var(--background-tertiary)] border border-[var(--border-subtle)] rounded-lg">
      <div className="mb-3 pb-2 border-b border-[var(--border-subtle)]">
        <span className="text-[12px] font-medium text-[var(--text-secondary)] uppercase tracking-wider">
          {fileName ? `Acciones para ${fileName}` : 'Acciones disponibles'}
        </span>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Button
          variant="light"
          color="blue"
          onClick={onEditWithRecommendations}
          disabled={disabled}
          title="Editar archivo aplicando las recomendaciones del análisis"
          className="h-auto py-2 px-3 flex flex-col items-start gap-1 justify-start bg-[var(--info-bg)] hover:bg-[var(--info-bg)]/80 text-[var(--info-text)] border border-[var(--info-border)] transition-all rounded-md"
          styles={{ inner: { justifyContent: 'flex-start' }, label: { whiteSpace: 'normal', width: '100%' } }}
        >
          <Group gap={6} align="center" className="mb-0.5">
            <Wrench size={14} className="opacity-80" />
            <Text size="sm" fw={600} className="leading-tight">Aplicar Recomendaciones</Text>
          </Group>
          <Text size="xs" c="dimmed" className="text-[var(--info-text)] opacity-70 leading-tight text-left">Edita con mejoras sugeridas</Text>
        </Button>
 
        <Button
          variant="light"
          color="grape"
          onClick={onImproveFile}
          disabled={disabled}
          title="Mejorar el código aplicando buenas prácticas"
          className="h-auto py-2 px-3 flex flex-col items-start gap-1 justify-start bg-[var(--accent-primary-subtle)] hover:bg-[var(--accent-primary-subtle)]/80 text-[var(--accent-primary)] border border-[var(--accent-primary)]/20 hover:border-[var(--accent-primary)]/40 transition-all rounded-md"
          styles={{ inner: { justifyContent: 'flex-start' }, label: { whiteSpace: 'normal', width: '100%' } }}
        >
          <Group gap={6} align="center" className="mb-0.5">
            <Rocket size={14} className="opacity-80" />
            <Text size="sm" fw={600} className="leading-tight">Mejorar Código</Text>
          </Group>
          <Text size="xs" c="dimmed" className="text-[var(--accent-primary)] opacity-70 leading-tight text-left">Optimizar y refactorizar</Text>
        </Button>
 
        <Button
          variant="light"
          color="green"
          onClick={onApplyRecommendations}
          disabled={disabled}
          title="Aplicar todas las recomendaciones encontradas"
          className="h-auto py-2 px-3 flex flex-col items-start gap-1 justify-start bg-[var(--success-bg)] hover:bg-[var(--success-bg)]/80 text-[var(--success-text)] border border-[var(--success-border)] transition-all rounded-md"
          styles={{ inner: { justifyContent: 'flex-start' }, label: { whiteSpace: 'normal', width: '100%' } }}
        >
          <Group gap={6} align="center" className="mb-0.5">
            <CheckCircle size={14} className="opacity-80" />
            <Text size="sm" fw={600} className="leading-tight">Aplicar Mejoras</Text>
          </Group>
          <Text size="xs" c="dimmed" className="text-[var(--success-text)] opacity-70 leading-tight text-left">Implementar sugerencias</Text>
        </Button>
      </div>
    </div>
  );
};

export default AnalysisActionButtons;
