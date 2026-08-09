import React from 'react';
import { Menu, Button, Group, Box } from '@mantine/core';
import { ChatMode } from '../chatModes/types';
import { MODES, ModeIcons } from './chatPane.constants';
import { ChevronDown, Lock } from 'lucide-react';

interface Props {
  value: ChatMode;
  onChange: (m: ChatMode) => void;
  sessionId?: string | null;
  pi4AgentReady?: boolean;
  /** Selector compacto para la barra pill del inicio */
  compact?: boolean;
}

const ModeSelect: React.FC<Props> = ({ value, onChange, sessionId, pi4AgentReady = false, compact = false }) => {
  const current = MODES.find(m => m.value === value) ?? MODES[0];

  return (
    <Menu shadow="md" width={180} position="bottom-start" offset={4} withArrow arrowPosition="center">
      <Menu.Target>
        <Button
          variant="default"
          size={compact ? 'sm' : 'xs'}
          radius={compact ? 'xl' : 'md'}
          className={
            compact
              ? 'h-9 px-2.5 font-medium border border-[var(--border-subtle)] bg-[var(--background-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--interactive-hover)] hover:text-[var(--text-primary)]'
              : 'bg-[var(--background-tertiary)] border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--interactive-hover)] h-[26px] px-2.5 font-normal'
          }
          rightSection={<ChevronDown size={compact ? 13 : 14} className="opacity-50 shrink-0" />}
          leftSection={
            <span className="flex items-center">
              {ModeIcons[current.value]}
            </span>
          }
          styles={{ label: { fontSize: compact ? 11 : undefined } }}
        >
          {current.label}
        </Button>
      </Menu.Target>

      <Menu.Dropdown className="p-1">
        {MODES.map(m => {
          const locked = !sessionId && !pi4AgentReady && (m.value === 'agente' || m.value === 'plan');
          const isSelected = m.value === value;

          return (
            <Menu.Item
              key={m.value}
              onClick={() => { if (!locked) onChange(m.value); }}
              disabled={locked}
              fz="xs"
              bg={isSelected ? 'var(--interactive-selected)' : undefined}
              leftSection={
                <span className="flex items-center">
                  {ModeIcons[m.value]}
                </span>
              }
              rightSection={
                locked ? (
                  <Lock size={12} className="opacity-40" />
                ) : null
              }
            >
              {m.label}
            </Menu.Item>
          );
        })}
      </Menu.Dropdown>
    </Menu>
  );
};

export default ModeSelect;
