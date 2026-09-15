import React from 'react';
import { Group, Stack, Text, UnstyledButton, Tooltip, Box } from '@mantine/core';

interface SkeletonColorPickerProps {
    color: string;
    onChange: (color: string) => void;
}

export const SKELETON_COLORS = [
    { name: 'Blanco', hex: '#FFFFFF' },
    { name: 'Rojo', hex: '#FF0033' },
    { name: 'Naranja', hex: '#FF6D00' },
    { name: 'Rosa', hex: '#FF007F' },
    { name: 'Verde', hex: '#00FF66' },
    { name: 'Amarillo', hex: '#FFEA00' },
    { name: 'Azul', hex: '#00E5FF' },
];

export const SkeletonColorPicker: React.FC<SkeletonColorPickerProps> = ({ color, onChange }) => {
    return (
        <Stack gap="xs">
            <Text fw={600} size="xs" style={{ color: 'var(--text-primary)' }}>
                Color del Esqueleto
            </Text>
            <Group gap="xs" wrap="wrap">
                {SKELETON_COLORS.map((item) => {
                    const isSelected = color.toLowerCase() === item.hex.toLowerCase();
                    return (
                        <Tooltip key={item.hex} label={item.name} withArrow position="top" size="xs">
                            <UnstyledButton
                                onClick={() => onChange(item.hex)}
                                style={{
                                    width: 28,
                                    height: 28,
                                    borderRadius: '50%',
                                    backgroundColor: item.hex,
                                    border: isSelected
                                        ? '2px solid var(--text-primary, #FFFFFF)'
                                        : '1px solid rgba(255, 255, 255, 0.2)',
                                    boxShadow: isSelected
                                        ? `0 0 12px ${item.hex}, 0 0 4px ${item.hex}`
                                        : `0 0 4px ${item.hex}44`,
                                    transform: isSelected ? 'scale(1.15)' : 'scale(1)',
                                    transition: 'all 0.2s ease',
                                    cursor: 'pointer',
                                }}
                                aria-label={`Seleccionar color ${item.name}`}
                            />
                        </Tooltip>
                    );
                })}
            </Group>
        </Stack>
    );
};

export default SkeletonColorPicker;
