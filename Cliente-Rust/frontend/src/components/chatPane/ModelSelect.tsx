import React from 'react';
import { Menu, Button, Box } from '@mantine/core';
import { ModelSelection, AVAILABLE_MODELS } from '../chatModes/types';
import { ChevronDown } from 'lucide-react';

interface Props {
  value: ModelSelection;
  onChange: (m: ModelSelection) => void;
}

const ModelSelect: React.FC<Props> = ({ value, onChange }) => {
  const current = AVAILABLE_MODELS.find(m => m.value === value) ?? AVAILABLE_MODELS[0];

  return (
    <div className="flex-1 min-w-0 flex">
      <Menu shadow="md" width="target" position="bottom-start" offset={4} withArrow arrowPosition="center">
        <Menu.Target>
          <Button
            variant="default"
            size="xs"
            radius="md"
            className="bg-white/5 border-white/10 text-primary hover:bg-white/10 h-[26px] px-2.5 font-normal w-full flex-1"
            rightSection={<ChevronDown size={14} className="opacity-50 shrink-0" />}
            styles={{ label: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }}
          >
            {current.label}
          </Button>
        </Menu.Target>

        <Menu.Dropdown className="p-1">
          {AVAILABLE_MODELS.map(m => {
            const isSelected = m.value === value;

            return (
              <Menu.Item
                key={m.value}
                onClick={() => onChange(m.value)}
                fz="xs"
                bg={isSelected ? 'var(--interactive-selected)' : undefined}
                rightSection={
                  <div className="flex items-center gap-2">
                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{m.provider}</span>
                    {isSelected && (
                      <Box w={6} h={6} className="rounded-full bg-blue-400 shrink-0 ml-1" />
                    )}
                  </div>
                }
              >
                {m.label}
              </Menu.Item>
            );
          })}
        </Menu.Dropdown>
      </Menu>
    </div>
  );
};

export default ModelSelect;
