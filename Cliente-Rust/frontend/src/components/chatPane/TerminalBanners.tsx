import React from 'react';
import { ActionIcon, Button } from '@mantine/core';
import { AlertTriangle, X, ArrowRight } from 'lucide-react';

interface Props {
  errorBanner: { snippet: string } | null;
  onDismissError: () => void;
  onAnalyze: () => void;
  terminalActivity: boolean;
  onDismissActivity: () => void;
}

const TerminalBanners: React.FC<Props> = ({
  errorBanner, onDismissError, onAnalyze,
  terminalActivity, onDismissActivity,
}) => (
  <>
    {errorBanner && (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-red-400/10 border-t border-red-400/20 text-[11px]">
        <AlertTriangle size={12} className="text-red-400 shrink-0" strokeWidth={2.5} />
        <span className="text-red-400 font-medium shrink-0">Error detectado</span>
        <span className="text-white/35 flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[10.5px]">
          {errorBanner.snippet}
        </span>
        <Button
          variant="light"
          color="red"
          size="compact-xs"
          radius="sm"
          onClick={onAnalyze}
          className="text-[10px] h-5"
          rightSection={<ArrowRight size={10} />}
        >
          Analizar
        </Button>
        <ActionIcon
          variant="subtle"
          color="gray"
          size="sm"
          onClick={onDismissError}
          className="text-white/20 hover:text-white/50 hover:bg-transparent"
        >
          <X size={14} />
        </ActionIcon>
      </div>
    )}

    {terminalActivity && !errorBanner && (
      <div className="flex items-center gap-1.5 px-3 py-1 border-t border-blue-400/10 text-[10.5px]">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0 animate-pulse" />
        <span className="text-white/30 flex-1">
          Terminal activa · el Agente puede leer el output si lo necesita
        </span>
        <ActionIcon
          variant="subtle"
          color="gray"
          size="xs"
          onClick={onDismissActivity}
          className="text-white/20 hover:text-white/50 hover:bg-transparent"
        >
          <X size={12} />
        </ActionIcon>
      </div>
    )}
  </>
);

export default TerminalBanners;
