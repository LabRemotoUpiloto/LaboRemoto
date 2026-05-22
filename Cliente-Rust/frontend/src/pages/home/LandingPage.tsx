import React from 'react';
import { Container, Title, Text, Button, SimpleGrid, Card, Group, Stack, rem, UnstyledButton, Box } from '@mantine/core';
import { ArrowRight, FlaskConical, Plus, Server, History, FolderOpen, Layers, ShieldCheck, Star, Play } from 'lucide-react';
import { useTour } from '../../tour';

interface LandingPageProps {
    onStartTutorial?: () => void;
    onOpenPanel?: (panelId: string) => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onStartTutorial, onOpenPanel }) => {
    const { startTour } = useTour(onOpenPanel);

    const handleStartTutorial = () => {
        if (onStartTutorial) onStartTutorial();
        startTour();
    };

    const quickActions = [
        { id: 'practices', title: 'Prácticas de Laboratorio', description: 'Eve3, Linux, Circuitos y más',   icon: <FlaskConical size={22} />, page: 'practices' },
        { id: 'connect',   title: 'Nueva Conexión',          description: 'Conecta a un servidor SSH',       icon: <Plus size={22} />,        page: 'connect'   },
        { id: 'hosts',     title: 'Mis Hosts',                description: 'Gestiona servidores guardados',   icon: <Server size={22} />,      page: 'hosts'     },
        { id: 'logs',      title: 'Historial de Logs',        description: 'Revisa sesiones pasadas',         icon: <History size={22} />,     page: 'logs'      },
        { id: 'sftp',      title: 'Explorador SFTP',          description: 'Transferencia de archivos',       icon: <FolderOpen size={22} />,  page: 'sftp'      },
    ];

    const infoCards = [
        {
            icon: <Layers size={28} />,
            title: '¿Qué es este proyecto?',
            body: 'El cliente SSH Unipiloto es una herramienta innovadora diseñada para facilitar el aprendizaje de Linux y la administración de sistemas remotos. Combinamos un cliente SSH potente con un asistente de inteligencia artificial que te guía paso a paso.',
        },
        {
            icon: <ShieldCheck size={28} />,
            title: '¿Qué es un cliente SSH?',
            body: 'SSH (Secure Shell) es un protocolo de red que permite conectarte de forma segura y cifrada a otro equipo. Un cliente SSH es la aplicación que utilizas para establecer estas conexiones.',
            grid: [
                { icon: <ShieldCheck size={16} />, label: 'Conexión Segura', desc: 'Comunicación cifrada para proteger tus datos.' },
                { icon: <Server size={16} />,      label: 'Control Remoto',  desc: 'Accede a servidores Linux desde cualquier lugar.' },
            ],
        },
        {
            icon: <Star size={28} />,
            title: 'Ventajas Educativas',
            grid: [
                { icon: <Play size={16} />,   label: 'Asistente de IA Integrado', desc: 'Aprende Linux conversando naturalmente.' },
                { icon: <Layers size={16} />, label: 'Interfaz Moderna',           desc: 'Diseño limpio que elimina la intimidación del terminal.' },
            ],
        },
    ];

    return (
        <div
            className="w-full h-full overflow-y-auto overflow-x-hidden custom-scrollbar"
            style={{ backgroundColor: 'var(--background-primary)', overscrollBehavior: 'contain' }}
        >
            <Container size={1000} pt={32} pb={60}>

                {/* ── HERO ── */}
                <Box component="section" mb={40} className="animate-in fade-in duration-700">
                    <Card
                        padding={rem(48)}
                        radius={20}
                        withBorder
                        style={{
                            backgroundColor: 'var(--background-secondary)',
                            borderColor: 'var(--border-subtle)',
                            textAlign: 'center',
                        }}
                    >
                        <Title
                            order={1}
                            mb="md"
                            style={{
                                fontSize: rem(38),
                                fontWeight: 800,
                                lineHeight: 1.15,
                                letterSpacing: '-0.02em',
                                color: 'var(--text-primary)',
                            }}
                        >
                            Bienvenido al laboratorio remoto de la Universidad Piloto de Colombia
                        </Title>
                        <Text
                            size="lg"
                            maw={600}
                            mx="auto"
                            mb={40}
                            style={{ lineHeight: 1.6, color: 'var(--text-secondary)' }}
                        >
                            Domina Linux y la administración remota con el asistente SSH más inteligente.
                            Conecta tu primer servidor en segundos.
                        </Text>
                        <Group justify="center" gap="md">
                            <Button
                                size="lg"
                                radius="xl"
                                onClick={() => onOpenPanel?.('connect')}
                                rightSection={<ArrowRight size={16} />}
                                style={{
                                    paddingLeft: rem(28),
                                    paddingRight: rem(28),
                                    height: rem(50),
                                    '--button-bg': 'var(--accent-primary)',
                                    '--button-hover': 'var(--accent-primary-hover)',
                                    color: 'var(--text-inverse)',
                                    border: 'none',
                                } as React.CSSProperties}
                            >
                                Nueva Conexión
                            </Button>
                            <Button
                                variant="outline"
                                size="lg"
                                radius="xl"
                                onClick={handleStartTutorial}
                                style={{ paddingLeft: rem(28), paddingRight: rem(28), height: rem(50), borderColor: 'var(--border-strong)', color: 'var(--text-primary)' }}
                            >
                                Ver Tutorial
                            </Button>
                        </Group>
                    </Card>
                </Box>

                {/* ── ACCIONES RÁPIDAS ── */}
                <Box component="section" mb={56} className="animate-in slide-in-from-bottom-8 duration-700 delay-200 fill-mode-both">
                    <Text
                        size="xs"
                        fw={700}
                        tt="uppercase"
                        ls={1.5}
                        mb="lg"
                        style={{ color: 'var(--text-muted)', letterSpacing: '0.08em' }}
                    >
                        Acceso Rápido
                    </Text>
                    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
                        {quickActions.map(action => (
                            <UnstyledButton
                                key={action.id}
                                onClick={() => onOpenPanel?.(action.page)}
                                className="group"
                                style={{
                                    backgroundColor: 'var(--background-secondary)',
                                    border: '1px solid var(--border-subtle)',
                                    borderRadius: rem(12),
                                    padding: `${rem(18)} ${rem(20)}`,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: rem(16),
                                    transition: 'border-color 0.15s ease, background-color 0.15s ease',
                                }}
                                onMouseEnter={e => {
                                    e.currentTarget.style.borderColor = 'var(--accent-secondary)';
                                    e.currentTarget.style.backgroundColor = 'var(--interactive-hover)';
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.borderColor = 'var(--border-subtle)';
                                    e.currentTarget.style.backgroundColor = 'var(--background-secondary)';
                                }}
                            >
                                <Box
                                    style={{
                                        width: rem(42),
                                        height: rem(42),
                                        backgroundColor: 'var(--accent-primary-subtle)',
                                        color: 'var(--accent-primary)',
                                        borderRadius: rem(10),
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        flexShrink: 0,
                                    }}
                                >
                                    {action.icon}
                                </Box>
                                <Stack gap={2} style={{ flex: 1 }}>
                                    <Text fw={600} size="sm" style={{ color: 'var(--text-primary)' }}>
                                        {action.title}
                                    </Text>
                                    <Text size="xs" style={{ color: 'var(--text-secondary)' }}>
                                        {action.description}
                                    </Text>
                                </Stack>
                                <ArrowRight size={14} style={{ opacity: 0.4, color: 'var(--text-secondary)', flexShrink: 0 }} />
                            </UnstyledButton>
                        ))}
                    </SimpleGrid>
                </Box>

                {/* ── DIVISOR ── */}
                <Box mb={48} style={{ height: 1, backgroundColor: 'var(--border-subtle)' }} />

                {/* ── INFO CARDS ── */}
                <Stack gap="md">
                    {infoCards.map(card => (
                        <Card
                            key={card.title}
                            padding="xl"
                            radius="lg"
                            withBorder
                            style={{
                                backgroundColor: 'var(--background-secondary)',
                                borderColor: 'var(--border-subtle)',
                                borderLeft: '3px solid var(--accent-primary)',
                            }}
                        >
                            <Group align="flex-start" wrap="nowrap" gap="xl">
                                <Box
                                    style={{
                                        width: rem(48),
                                        height: rem(48),
                                        backgroundColor: 'var(--accent-primary-subtle)',
                                        color: 'var(--accent-primary)',
                                        borderRadius: rem(10),
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        flexShrink: 0,
                                    }}
                                >
                                    {card.icon}
                                </Box>
                                <div style={{ flex: 1 }}>
                                    <Title order={2} mb="sm" size="h4" style={{ color: 'var(--text-primary)' }}>
                                        {card.title}
                                    </Title>
                                    {card.body && (
                                        <Text style={{ lineHeight: 1.65, color: 'var(--text-secondary)', fontSize: rem(14) }}>
                                            {card.body}
                                        </Text>
                                    )}
                                    {card.grid && (
                                        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm" mt={card.body ? 'md' : 0}>
                                            {card.grid.map(item => (
                                                <Group
                                                    key={item.label}
                                                    gap="sm"
                                                    p="md"
                                                    style={{
                                                        backgroundColor: 'var(--background-tertiary)',
                                                        borderRadius: rem(10),
                                                        border: '1px solid var(--border-subtle)',
                                                    }}
                                                >
                                                    <Box style={{ color: 'var(--accent-primary)', flexShrink: 0 }}>
                                                        {item.icon}
                                                    </Box>
                                                    <div>
                                                        <Text size="sm" fw={600} style={{ color: 'var(--text-primary)' }}>{item.label}</Text>
                                                        <Text size="xs" style={{ color: 'var(--text-secondary)' }}>{item.desc}</Text>
                                                    </div>
                                                </Group>
                                            ))}
                                        </SimpleGrid>
                                    )}
                                </div>
                            </Group>
                        </Card>
                    ))}
                </Stack>

            </Container>
        </div>
    );
};

export default LandingPage;
