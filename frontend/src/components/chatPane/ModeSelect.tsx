import React from 'react';
import { Menu, Button, Group, Box } from '@mantine/core';
import { ChatMode } from '../chatModes/types';
import { MODES, ModeIcons } from './chatPane.constants';
import { ChevronDown, Lock } from 'lucide-react';

interface Props {
  value: ChatMode;
  onChange: (m: ChatMode) => void;
  sessionId?: string | null;
}

const ModeSelect: React.FC<Props> = ({ value, onChange, sessionId }) => {
  const current = MODES.find(m => m.value === value) ?? MODES[0];

  return (
    <Menu shadow="md" width={180} position="bottom-start" offset={4} withArrow arrowPosition="center">
      <Menu.Target>
        <Button
          variant="default"
          size="xs"
          radius="md"
          className="bg-white/5 border-white/10 text-primary hover:bg-white/10 h-[26px] px-2.5 font-normal"
          rightSection={<ChevronDown size={14} className="opacity-50" />}
          leftSection={
            <span style={{ color: current.color }} className="flex items-center">
              {ModeIcons[current.value]}
            </span>
          }
        >
          {current.label}
        </Button>
      </Menu.Target>

      <Menu.Dropdown className="bg-[#1e2130] border-white/10 p-1">
        {MODES.map(m => {
          const locked = !sessionId && (m.value === 'agente' || m.value === 'plan');
          const isSelected = m.value === value;

          return (
            <Menu.Item
              key={m.value}
              onClick={() => { if (!locked) onChange(m.value); }}
              disabled={locked}
              className={`
                text-[12.5px] py-1.5 px-2 rounded-md
                ${isSelected ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/5'}
                ${locked ? 'opacity-50 cursor-not-allowed' : ''}
              `}
              leftSection={
                <span style={{ color: m.color }} className="flex items-center">
                  {ModeIcons[m.value]}
                </span>
              }
              rightSection={
                locked ? (
                  <Lock size={12} className="opacity-40" />
                ) : isSelected ? (
                  <Box w={6} h={6} style={{ borderRadius: '50%', backgroundColor: m.color }} />
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
