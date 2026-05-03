import React from 'react';
import { Card, Group, Stack, Text, ThemeIcon, useMantineTheme } from '@mantine/core';
import { Bot, Terminal, Cpu, ArrowRight } from 'lucide-react';

interface CategoryCardProps {
    id: string;
    name: string;
    description: string;
    icon: string;
    color: string;
    practiceCount: number;
    onClick: () => void;
}

const iconMap: Record<string, React.ElementType> = {
    robot: Bot,
    terminal: Terminal,
    circuit: Cpu,
};

const CategoryCard: React.FC<CategoryCardProps> = ({ name, description, icon, practiceCount, onClick }) => {
    const IconComponent = iconMap[icon] || Terminal;
    const isAvailable = practiceCount > 0;
    const theme = useMantineTheme();

    return (
        <Card
            withBorder
            padding="lg"
            radius="md"
            style={{ cursor: isAvailable ? 'pointer' : 'not-allowed' }}
            onClick={isAvailable ? onClick : undefined}
            sx={{
                transition: 'transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease',
                ...(isAvailable && {
                    '&:hover': {
                        transform: 'translateY(-2px)',
                        boxShadow: theme.shadows.md,
                        borderColor: theme.colors.blue[5],
                    },
                }),
            }}
        >
            <Stack gap="md">
                <ThemeIcon size="xl" radius="md" variant="light" color={isAvailable ? 'blue' : 'gray'}>
                    <IconComponent size={24} />
                </ThemeIcon>

                <div>
                    <Text fw={600} size="lg" mb={4}>{name}</Text>
                    <Text size="sm" c="dimmed" lineClamp={2}>{description}</Text>
                </div>

                <Group justify="space-between" mt="xs" align="center">
                    <Text size="xs" c={isAvailable ? 'dimmed' : 'dimmed'} tt="uppercase" fw={500} style={{ letterSpacing: '0.04em' }}>
                        {isAvailable
                            ? `${practiceCount} práctica${practiceCount !== 1 ? 's' : ''}`
                            : 'Próximamente'}
                    </Text>
                    {isAvailable && (
                        <ArrowRight size={14} style={{ opacity: 0.4 }} />
                    )}
                </Group>
            </Stack>
        </Card>
    );
};

export default CategoryCard;
