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
            padding="lg"
            className={`animate-reveal dribbble-card ${isAvailable ? 'dribbble-card-interactive group' : ''}`}
            style={{ cursor: isAvailable ? 'pointer' : 'not-allowed' }}
            onClick={isAvailable ? onClick : undefined}
        >
            <Stack gap="md">
                <ThemeIcon
                    size="xl"
                    radius="md"
                    style={{
                        backgroundColor: isAvailable ? 'color-mix(in srgb, var(--accent-primary) 12%, transparent)' : 'color-mix(in srgb, var(--border-subtle) 30%, transparent)',
                        color: isAvailable ? 'var(--accent-primary)' : 'var(--text-secondary)',
                    }}
                >
                    <IconComponent size={24} />
                </ThemeIcon>

                <div>
                    <Text fw={600} size="lg" mb={4}>{name}</Text>
                    <Text size="sm" c="dimmed" lineClamp={2}>{description}</Text>
                </div>

                <Group justify="space-between" mt="xs" align="center">
                    <Text 
                        size="xs" 
                        tt="uppercase" 
                        fw={500} 
                        className="transition-colors duration-200 group-hover:text-[var(--accent-primary)]"
                        style={{ letterSpacing: '0.04em', color: 'var(--text-secondary)' }}
                    >
                        {isAvailable
                            ? `${practiceCount} práctica${practiceCount !== 1 ? 's' : ''}`
                            : 'Próximamente'}
                    </Text>
                    {isAvailable && (
                        <ArrowRight 
                            size={14} 
                            className="opacity-40 group-hover:opacity-100 group-hover:text-[var(--accent-primary)] group-hover:translate-x-0.5 transition-all duration-200" 
                            style={{ color: 'var(--text-secondary)' }}
                        />
                    )}
                </Group>
            </Stack>
        </Card>
    );
};

export default CategoryCard;
