// PracticesPage — Página de prácticas de laboratorio.
// Muestra categorías, y al seleccionar una, las prácticas disponibles.
// Toda la data viene del backend Rust via invoke().
import React, { useEffect, useState, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import Swal from 'sweetalert2';
import CategoryCard from '../../components/practicas/CategoryCard';
import PracticeCard from '../../components/practicas/PracticeCard';

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
            <div className="w-full h-full overflow-y-auto overflow-x-hidden bg-primary pt-3 custom-scrollbar">
                <div className="flex flex-col items-center justify-center h-[50vh] gap-4 text-secondary text-[15px]">
                    <div className="w-9 h-9 border-3 border-subtle border-t-accent rounded-full animate-spin" />
                    <p>Cargando prácticas...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full h-full overflow-y-auto overflow-x-hidden bg-primary pt-3 custom-scrollbar">
            <div className="max-w-[960px] mx-auto px-7 pb-15">
                {!selectedCategory ? (
                    /* ── Vista de Categorías ── */
                    <>
                        <header className="py-9 pb-8 animate-in fade-in duration-600">
                            <div className="inline-flex items-center gap-2 py-1.5 px-4 bg-accent/10 text-accent border border-subtle rounded-full text-[13px] font-semibold mb-5 uppercase tracking-wide">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                                    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                                </svg>
                                Laboratorio Remoto
                            </div>
                            <h1 className="text-[32px] md:text-[42px] font-extrabold text-primary m-0 mb-3.5 leading-[1.1] tracking-tight">Prácticas de Laboratorio</h1>
                            <p className="text-[17px] text-secondary max-w-[600px] leading-relaxed m-0">
                                Selecciona una categoría para ver las prácticas disponibles. 
                                Cada práctica configura automáticamente tu entorno de trabajo.
                            </p>
                        </header>

                        <section className="grid grid-cols-1 md:grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-5 animate-in slide-in-from-bottom-6 duration-600 delay-150 fill-mode-both">
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
                        <header className="py-9 pb-8 animate-in fade-in duration-600">
                            <button className="inline-flex items-center gap-2 bg-transparent border-none text-secondary text-[14px] font-medium cursor-pointer py-1.5 mb-4 transition-all duration-200 hover:text-accent hover:gap-3 group" onClick={handleBack}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <path d="M19 12H5M12 19l-7-7 7-7" />
                                </svg>
                                Volver a categorías
                            </button>
                            <br />
                            <div className="inline-flex items-center gap-2 py-1.5 px-4 bg-accent/10 border border-subtle rounded-full text-[13px] font-semibold mb-5 uppercase tracking-wide" style={{ color: selectedCategory.color, borderColor: selectedCategory.color }}>
                                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: selectedCategory.color }} />
                                {selectedCategory.name}
                            </div>
                            <h1 className="text-[32px] md:text-[42px] font-extrabold text-primary m-0 mb-3.5 leading-[1.1] tracking-tight">{selectedCategory.name}</h1>
                            <p className="text-[17px] text-secondary max-w-[600px] leading-relaxed m-0">{selectedCategory.description}</p>
                        </header>

                        <section className="grid grid-cols-1 gap-4 animate-in slide-in-from-bottom-6 duration-500">
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
                            <section className="mt-6 rounded-[14px] overflow-hidden border border-subtle bg-primary animate-in slide-in-from-bottom-4 duration-400">
                                <div className="flex items-center gap-3 py-2.5 px-4 bg-tertiary border-b border-subtle">
                                    <div className="flex gap-1.5">
                                        <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                                        <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                                    </div>
                                    <span className="text-[12px] font-semibold text-secondary tracking-wide flex-1">
                                        📋 Log de Inicialización
                                    </span>
                                    {!startingPractice && (
                                        <button 
                                            className="bg-transparent border-none text-tertiary text-[14px] cursor-pointer py-0.5 px-1.5 rounded transition-all duration-200 hover:bg-white/5 hover:text-primary"
                                            onClick={() => setSetupLogs([])}
                                        >
                                            ✕
                                        </button>
                                    )}
                                </div>
                                <div className="py-3.5 px-4 max-h-[280px] overflow-y-auto font-mono text-[13px] leading-relaxed custom-scrollbar">
                                    {setupLogs.map((log, i) => {
                                        let logColorCls = 'text-secondary';
                                        if (log.level === 'success') logColorCls = 'text-emerald-400';
                                        if (log.level === 'warning') logColorCls = 'text-amber-400';
                                        if (log.level === 'error') logColorCls = 'text-red-400';
                                        
                                        return (
                                            <div key={i} className="flex items-start gap-2.5 py-0.5">
                                                <span className="text-muted text-[11px] min-w-[65px] shrink-0 opacity-60 pt-[1px]">{log.timestamp}</span>
                                                <span className={`break-words ${logColorCls}`}>{log.message}</span>
                                            </div>
                                        );
                                    })}
                                    {startingPractice && (
                                        <div className="flex items-start gap-2.5 py-0.5">
                                            <span className="text-accent animate-pulse">▌</span>
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
