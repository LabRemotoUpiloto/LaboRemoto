// PracticesPage — Página de prácticas de laboratorio.
// Muestra categorías, y al seleccionar una, las prácticas disponibles.
// Toda la data viene del backend Rust via invoke().
import React, { useEffect, useState, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import Swal from 'sweetalert2';
import CategoryCard from '../../components/practicas/CategoryCard';
import PracticeCard from '../../components/practicas/PracticeCard';
import './PracticesPage.css';

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
}

interface LogEntry {
    level: 'info' | 'success' | 'warning' | 'error';
    message: string;
    timestamp: string;
}

const PracticesPage: React.FC<PracticesPageProps> = ({ onStartPractice }) => {
    const [categories, setCategories] = useState<PracticeCategory[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<PracticeCategory | null>(null);
    const [loading, setLoading] = useState(true);
    const [startingPractice, setStartingPractice] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [setupLogs, setSetupLogs] = useState<LogEntry[]>([]);
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
    };

    if (loading) {
        return (
            <div className="practices-page">
                <div className="practices-page__loading">
                    <div className="practices-page__spinner" />
                    <p>Cargando prácticas...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="practices-page">
            <div className="practices-page__container">
                {!selectedCategory ? (
                    /* ── Vista de Categorías ── */
                    <>
                        <header className="practices-page__header">
                            <div className="practices-page__header-badge">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                                    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                                </svg>
                                Laboratorio Remoto
                            </div>
                            <h1 className="practices-page__title">Prácticas de Laboratorio</h1>
                            <p className="practices-page__subtitle">
                                Selecciona una categoría para ver las prácticas disponibles. 
                                Cada práctica configura automáticamente tu entorno de trabajo.
                            </p>
                        </header>

                        <section className="practices-page__categories">
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
                        </section>
                    </>
                ) : (
                    /* ── Vista de Prácticas ── */
                    <>
                        <header className="practices-page__header">
                            <button className="practices-page__back-btn" onClick={handleBack}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <path d="M19 12H5M12 19l-7-7 7-7" />
                                </svg>
                                Volver a categorías
                            </button>
                            <div className="practices-page__header-badge" style={{ color: selectedCategory.color, borderColor: selectedCategory.color }}>
                                <span className="practices-page__header-dot" style={{ background: selectedCategory.color }} />
                                {selectedCategory.name}
                            </div>
                            <h1 className="practices-page__title">{selectedCategory.name}</h1>
                            <p className="practices-page__subtitle">{selectedCategory.description}</p>
                        </header>

                        <section className="practices-page__list">
                            {selectedCategory.practices.map(practice => (
                                <PracticeCard
                                    key={practice.id}
                                    id={practice.id}
                                    name={practice.name}
                                    description={practice.description}
                                    difficulty={practice.difficulty}
                                    hasCamera={practice.panels.camera}
                                    hasChat={practice.panels.chat}
                                    onStart={() => handleStartPractice(practice)}
                                    loading={startingPractice === practice.id}
                                />
                            ))}
                        </section>

                        {/* ── Terminal de Log ── */}
                        {setupLogs.length > 0 && (
                            <section className="practices-page__log-terminal">
                                <div className="practices-page__log-header">
                                    <div className="practices-page__log-dots">
                                        <span />
                                        <span />
                                        <span />
                                    </div>
                                    <span className="practices-page__log-title">
                                        📋 Log de Inicialización
                                    </span>
                                    {!startingPractice && (
                                        <button 
                                            className="practices-page__log-close"
                                            onClick={() => setSetupLogs([])}
                                        >
                                            ✕
                                        </button>
                                    )}
                                </div>
                                <div className="practices-page__log-body">
                                    {setupLogs.map((log, i) => (
                                        <div key={i} className={`practices-page__log-entry practices-page__log-entry--${log.level}`}>
                                            <span className="practices-page__log-time">{log.timestamp}</span>
                                            <span className="practices-page__log-msg">{log.message}</span>
                                        </div>
                                    ))}
                                    {startingPractice && (
                                        <div className="practices-page__log-entry practices-page__log-entry--info">
                                            <span className="practices-page__log-cursor">▌</span>
                                        </div>
                                    )}
                                    <div ref={logEndRef} />
                                </div>
                            </section>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default PracticesPage;
