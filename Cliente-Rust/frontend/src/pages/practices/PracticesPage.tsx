// PracticesPage — Página de prácticas de laboratorio.
import React, { useEffect, useState, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import Swal from 'sweetalert2';
import { ActionIcon, Button, Container, Divider, Group, Loader, Paper, ScrollArea, SimpleGrid, Stack, Text, ThemeIcon, Title, Box } from '@mantine/core';
import { ArrowLeft, Bot, Cpu, Terminal, X } from 'lucide-react';
import CategoryCard from '../../components/practicas/CategoryCard';
import PracticeCard from '../../components/practicas/PracticeCard';
import LinuxModulePage from './LinuxModulePage';

const categoryIconMap: Record<string, React.ElementType> = {
    robot: Bot,
    terminal: Terminal,
    circuit: Cpu,
};

interface PanelConfig {
    camera: boolean;
    chat: boolean;
    chat_context: string;
    chat_tutorial: string;
}

interface TerminalConfig {
    allowed_commands: string[];
    working_directory: string;
    allow_navigation: boolean;
    allow_nano: boolean;
}

interface PracticeConnection {
    host: string;
    port: number;
    user: string;
    password: string;
    setup_commands: any[];
}

interface Practice {
    id: string;
    name: string;
    description: string;
    difficulty: string;
    moodle_assignment_id?: number;
    connection: PracticeConnection;
    terminal: TerminalConfig;
    panels: PanelConfig;
}

interface PracticeCategory {
    id: string;
    name: string;
    description: string;
    icon: string;
    color: string;
    practices: Practice[];
}

interface PracticesPageProps {
    onStartPractice?: (payload: {
        practice: Practice;
        student: { id: number; username: string; fullname: string; email: string };
    }) => Promise<void>;
    /** Requerido para la categoría Linux: abre la pestaña de la sesión SSH real. */
    onNewSession?: (info: { id: string; label: string }) => void;
}

interface LogEntry {
    level: 'info' | 'success' | 'warning' | 'error';
    message: string;
    timestamp: string;
}

const PracticesPage: React.FC<PracticesPageProps> = ({ onStartPractice, onNewSession }) => {
    const [categories, setCategories] = useState<PracticeCategory[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<PracticeCategory | null>(null);
    const [loading, setLoading] = useState(true);
    const [startingPractice, setStartingPractice] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [setupLogs, setSetupLogs] = useState<LogEntry[]>([]);
    const [selectedLinuxPracticeId, setSelectedLinuxPracticeId] = useState<string | null>(null);
    const logEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        loadCategories();
    }, []);

    // Auto-scroll logs
    useEffect(() => {
        logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [setupLogs]);

    // Listen to practice:log events
    useEffect(() => {
        let unlisten: UnlistenFn | null = null;
        listen<{ practice_id: string; level: string; message: string }>('practice:log', (event) => {
            const { level, message } = event.payload;
            const now = new Date();
            const timestamp = now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            setSetupLogs(prev => [...prev, { level: level as LogEntry['level'], message, timestamp }]);
        }).then(fn => { unlisten = fn; });

        return () => { unlisten?.(); };
    }, []);

    const loadCategories = async () => {
        try {
            setLoading(true);
            const cats = await invoke<PracticeCategory[]>('practicas_list_categories');
            setCategories(cats);
        } catch (err) {
            setError(`Error cargando prácticas: ${err}`);
        } finally {
            setLoading(false);
        }
    };

    const handleStartPractice = async (practice: Practice) => {
        if (startingPractice) return;
        setStartingPractice(practice.id);
        setSetupLogs([]); // Reset logs
        setError(null);

        const addLog = (level: LogEntry['level'], message: string) => {
            const now = new Date();
            const timestamp = now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            setSetupLogs(prev => [...prev, { level, message, timestamp }]);
        };

        try {
            // 1. Ejecutar setup commands (ej: levantar servidor del robot)
            // Los logs de este paso llegan via evento practice:log desde Rust
            await invoke<string[]>('practicas_run_setup', { practiceId: practice.id });

            // 2. Obtener configuración completa (con credenciales) desde el backend
            addLog('info', 'Obteniendo configuración de la práctica...');
            const fullConfig = await invoke<Practice>('practicas_get_config', { practiceId: practice.id });
            addLog('success', 'Configuración obtenida');

            // 3. Notificar al parent para abrir sesión SSH + workspace
            await onStartPractice?.({
                practice: fullConfig,
                student: { id: 0, username: '', fullname: 'Estudiante', email: '' },
            });

        } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            addLog('error', `Práctica detenida por error — ${errMsg}`);
            Swal.fire({
                title: 'Error al iniciar práctica',
                text: errMsg,
                icon: 'error',
                confirmButtonText: 'Cerrar',
                confirmButtonColor: 'var(--danger, #EF4444)',
                position: 'center',
                customClass: { container: 'swal-fullscreen' },
            });
            setStartingPractice(null);
            return;
        }

        setStartingPractice(null);
    };

    const handleBack = () => {
        setSelectedCategory(null);
        setSetupLogs([]);
        setSelectedLinuxPracticeId(null);
    };

    if (loading) {
        return (
            <Box w="100%" h="100%" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Stack align="center" gap="md">
                    <Loader size="md" />
                    <Text c="dimmed" size="sm">Cargando prácticas...</Text>
                </Stack>
            </Box>
        );
    }

    if (selectedLinuxPracticeId) {
        return (
            <LinuxModulePage
                practiceId={selectedLinuxPracticeId}
                onBack={() => setSelectedLinuxPracticeId(null)}
                onNewSession={onNewSession ?? (() => {})}
            />
        );
    }

    const levelColor: Record<LogEntry['level'], string> = {
        info: 'gray',
        success: 'green',
        warning: 'orange',
        error: 'red',
    };

    return (
        <Box w="100%" h="100%" style={{ overflow: 'auto' }}>
            <Container size="lg" py="xl" px="xl">
                {!selectedCategory ? (
                    <Stack gap="xl">
                        <Stack gap="sm">
                            <Title order={1}>Prácticas de Laboratorio</Title>
                            <Text size="md" c="dimmed" maw={580}>
                                Selecciona una categoría para ver las prácticas disponibles.
                                Cada práctica configura automáticamente tu entorno de trabajo.
                            </Text>
                        </Stack>

                        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
                            {categories.map(cat => (
                                <CategoryCard
                                    key={cat.id}
                                    id={cat.id}
                                    name={cat.name}
                                    description={cat.description}
                                    icon={cat.icon}
                                    color={cat.color}
                                    practiceCount={cat.practices.length}
                                    onClick={() => cat.practices.length > 0 && setSelectedCategory(cat)}
                                />
                            ))}
                        </SimpleGrid>
                    </Stack>
                ) : (
                    <Stack gap="xl">
                        <Group justify="space-between" align="center">
                            <Button
                                variant="subtle"
                                color="gray"
                                size="sm"
                                radius="md"
                                leftSection={<ArrowLeft size={14} />}
                                onClick={handleBack}
                            >
                                Volver a categorías
                            </Button>
                            <Text size="xs" c="dimmed" fw={500} tt="uppercase" style={{ letterSpacing: '0.08em' }}>
                                {selectedCategory.practices.length} práctica{selectedCategory.practices.length !== 1 ? 's' : ''}
                            </Text>
                        </Group>

                        <Group gap="md" align="flex-start" wrap="nowrap">
                            <ThemeIcon size={52} radius="lg" variant="light" color="blue">
                                {(() => {
                                    const Icon = categoryIconMap[selectedCategory.icon] || Terminal;
                                    return <Icon size={26} />;
                                })()}
                            </ThemeIcon>
                            <Stack gap={6}>
                                <Title order={1} style={{ fontSize: '1.875rem', letterSpacing: '-0.02em', lineHeight: 1.15 }}>
                                    {selectedCategory.name}
                                </Title>
                                <Text size="sm" c="dimmed" maw={620} style={{ lineHeight: 1.55 }}>
                                    {selectedCategory.description}
                                </Text>
                            </Stack>
                        </Group>

                        <Divider />

                        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
                            {selectedCategory.practices.map(practice => (
                                <PracticeCard
                                    key={practice.id}
                                    id={practice.id}
                                    name={practice.name}
                                    description={practice.description}
                                    difficulty={practice.difficulty}
                                    hasCamera={practice.panels.camera}
                                    hasChat={practice.panels.chat}
                                    onStart={() => (
                                        selectedCategory.id === 'linux'
                                            ? setSelectedLinuxPracticeId(practice.id)
                                            : handleStartPractice(practice)
                                    )}
                                    loading={startingPractice === practice.id}
                                />
                            ))}
                        </SimpleGrid>

                        {setupLogs.length > 0 && (
                            <Paper withBorder radius="md">
                                <Group
                                    px="md"
                                    py="xs"
                                    justify="space-between"
                                    style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
                                >
                                    <Text size="xs" fw={600} c="dimmed">Log de Inicialización</Text>
                                    {!startingPractice && (
                                        <ActionIcon variant="subtle" color="gray" size="sm" onClick={() => setSetupLogs([])}>
                                            <X size={14} />
                                        </ActionIcon>
                                    )}
                                </Group>
                                <ScrollArea h={280} p="md">
                                    <Stack gap={4}>
                                        {setupLogs.map((log, i) => (
                                            <Group key={i} gap="sm" align="flex-start" wrap="nowrap">
                                                <Text
                                                    size="xs"
                                                    c="dimmed"
                                                    style={{ minWidth: 65, flexShrink: 0, fontFamily: 'monospace' }}
                                                >
                                                    {log.timestamp}
                                                </Text>
                                                <Text
                                                    size="xs"
                                                    c={levelColor[log.level]}
                                                    style={{ fontFamily: 'monospace', wordBreak: 'break-word' }}
                                                >
                                                    {log.message}
                                                </Text>
                                            </Group>
                                        ))}
                                        {startingPractice && (
                                            <Text size="xs" c="green" style={{ fontFamily: 'monospace' }}>▌</Text>
                                        )}
                                        <div ref={logEndRef} />
                                    </Stack>
                                </ScrollArea>
                            </Paper>
                        )}
                    </Stack>
                )}
            </Container>
        </Box>
    );
};

export default PracticesPage;
