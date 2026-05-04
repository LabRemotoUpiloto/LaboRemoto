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
            className={`animate-reveal ${isAvailable ? 'group' : ''}`}
            style={{ cursor: isAvailable ? 'pointer' : 'not-allowed' }}
            onClick={isAvailable ? onClick : undefined}
            sx={{
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                ...(isAvailable && {
                    '&:hover': {
                        transform: 'translateY(-4px) scale(1.01)',
                        boxShadow: '0 12px 24px -10px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(34, 139, 230, 0.1)',
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
                    <Text 
                        size="xs" 
                        tt="uppercase" 
                        fw={500} 
                        className="text-gray-500 group-hover:text-blue-500 transition-colors duration-200"
                        style={{ letterSpacing: '0.04em' }}
                    >
                        {isAvailable
                            ? `${practiceCount} práctica${practiceCount !== 1 ? 's' : ''}`
                            : 'Próximamente'}
                    </Text>
                    {isAvailable && (
                        <ArrowRight 
                            size={14} 
                            className="opacity-40 group-hover:opacity-100 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all duration-200" 
                        />
                    )}
                </Group>
            </Stack>
        </Card>
    );
};

export default CategoryCard;
