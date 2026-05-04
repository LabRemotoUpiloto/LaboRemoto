// Página de inicio/bienvenida para el cliente SSH inteligente
import React from 'react';
import { useTour } from '../../tour';

interface LandingPageProps {
    onStartTutorial?: () => void;
    onOpenPanel?: (panelId: string) => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onStartTutorial, onOpenPanel }) => {
    const { startTour } = useTour(onOpenPanel);
    
    const handleStartTutorial = () => {
        if (onStartTutorial) {
            onStartTutorial();
        }
        startTour();
    };

    const quickActions = [
        { 
            id: 'practices', 
            title: 'Prácticas de Laboratorio', 
            description: 'Eve3, Linux, Circuitos y más', 
            icon: (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 3h6M10 3v7.4a2 2 0 0 1-.5 1.3L4 19a2 2 0 0 0 1.5 3h13a2 2 0 0 0 1.5-3l-5.5-7.3A2 2 0 0 1 14 10.4V3" />
                    <path d="M8.5 14h7" />
                </svg>
            ),
            page: 'practices'
        },
        { 
            id: 'connect', 
            title: 'Nueva Conexión', 
            description: 'Conecta a un servidor SSH', 
            icon: (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2v20M2 12h20" />
                </svg>
            ),
            page: 'connect'
        },
        { 
            id: 'hosts', 
            title: 'Mis Hosts', 
            description: 'Gestiona servidores guardados', 
            icon: (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <line x1="3" y1="9" x2="21" y2="9" />
                    <line x1="9" y1="21" x2="9" y2="21" />
                </svg>
            ),
            page: 'hosts'
        },
        { 
            id: 'logs', 
            title: 'Historial de Logs', 
            description: 'Revisa sesiones pasadas', 
            icon: (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10 9 9 9 8 9" />
                </svg>
            ),
            page: 'logs'
        },
        { 
            id: 'sftp', 
            title: 'Explorador SFTP', 
            description: 'Transferencia de archivos', 
            icon: (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    <line x1="12" y1="11" x2="12" y2="17" />
                    <line x1="9" y1="14" x2="15" y2="14" />
                </svg>
            ),
            page: 'sftp'
        }
    ];

    return (
        <div className="w-full h-full overflow-y-auto overflow-x-hidden bg-primary pt-3 custom-scrollbar">
            <div className="max-w-[1000px] mx-auto px-6 pb-15">
                {/* ── SECCIÓN HERO CTA (NUEVA) ── */}
                <section className="py-10 pb-8 animate-in fade-in duration-700">
                    <div className="bg-gradient-to-br from-secondary to-tertiary border border-subtle rounded-[24px] p-8 md:p-12 text-center relative overflow-hidden">
                        <h1 className="text-[36px] md:text-[48px] font-extrabold text-primary m-0 mb-5 leading-[1.1] tracking-tight">Bienvenido al laboratorio remoto de la Universidad Piloto de Colombia</h1>
                        <p className="text-[18px] md:text-[20px] text-secondary max-w-[640px] mx-auto mb-10 leading-relaxed">
                            Domina Linux y la administración remota con el asistente SSH más inteligente. 
                            Conecta tu primer servidor en segundos.
                        </p>
                        <div className="flex flex-col md:flex-row justify-center gap-4">
                            <button 
                                className="px-8 py-3.5 rounded-xl text-base font-semibold cursor-pointer transition-all duration-200 flex items-center justify-center gap-2.5 bg-accent text-inverse border-none hover:-translate-y-0.5 hover:brightness-110"
                                onClick={() => onOpenPanel?.('connect')}
                            >
                                Nueva Conexión
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <path d="M5 12h14M12 5l7 7-7 7" />
                                </svg>
                            </button>
                            <button 
                                className="px-8 py-3.5 rounded-xl text-base font-semibold cursor-pointer transition-all duration-200 flex items-center justify-center gap-2.5 bg-transparent text-primary border border-subtle hover:bg-white/5 hover:border-secondary"
                                onClick={handleStartTutorial}
                            >
                                Ver Tutorial
                            </button>
                        </div>
                    </div>
                </section>

                {/* ── ACCIONES RÁPIDAS (Grid 2x2) ── */}
                <section className="mb-[60px] animate-in slide-in-from-bottom-8 duration-700 delay-200 fill-mode-both">
                    <h3 className="text-[14px] font-semibold text-tertiary uppercase tracking-widest mb-5">Acceso Rápido</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {quickActions.map(action => (
                            <button 
                                key={action.id}
                                className="group bg-secondary border border-subtle rounded-2xl p-6 flex items-center gap-5 cursor-pointer text-left transition-all duration-200 relative w-full hover:bg-tertiary hover:border-accent hover:-translate-y-0.5"
                                onClick={() => onOpenPanel?.(action.page)}
                            >
                                <div className="w-12 h-12 bg-accent/10 text-accent rounded-xl flex items-center justify-center shrink-0">
                                    {action.icon}
                                </div>
                                <div>
                                    <h4 className="text-[17px] font-semibold text-primary m-0 mb-1">{action.title}</h4>
                                    <p className="text-[14px] text-secondary m-0">{action.description}</p>
                                </div>
                                <div className="ml-auto text-tertiary opacity-50 transition-all duration-200 group-hover:translate-x-1 group-hover:text-accent group-hover:opacity-100">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                        <path d="M9 18l6-6-6-6" />
                                    </svg>
                                </div>
                            </button>
                        ))}
                    </div>
                </section>

                <div className="h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent mb-[60px]"></div>

                {/* ── CONTENIDO EXISTENTE (Reorganizado abajo) ── */}
                <section className="mb-10 animate-in slide-in-from-bottom-8 duration-700">
                    <div className="bg-secondary border border-subtle rounded-2xl p-8">
                        <div className="w-14 h-14 bg-accent/10 text-accent rounded-xl flex items-center justify-center mb-5">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                                <path d="M2 17l10 5 10-5" />
                                <path d="M2 12l10 5 10-5" />
                            </svg>
                        </div>
                        <h2 className="text-[24px] font-semibold text-primary mb-4">¿Qué es este proyecto?</h2>
                        <p className="text-[16px] text-secondary leading-relaxed mb-4">
                            El cliente ssh unipiloto es una herramienta innovadora diseñada específicamente para facilitar 
                            el aprendizaje de Linux y la administración de sistemas remotos. Combinamos un cliente SSH 
                            potente con un asistente de inteligencia artificial que te guía paso a paso en tu viaje 
                            de aprendizaje.
                        </p>
                    </div>
                </section>

                <section className="mb-10 animate-in slide-in-from-bottom-8 duration-700">
                    <div className="bg-secondary border border-subtle rounded-2xl p-8">
                        <div className="w-14 h-14 bg-accent/10 text-accent rounded-xl flex items-center justify-center mb-5">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                                <path d="M9 12l2 2 4-4" />
                            </svg>
                        </div>
                        <h2 className="text-[24px] font-semibold text-primary mb-4">¿Qué es un cliente SSH?</h2>
                        <p className="text-[16px] text-secondary leading-relaxed mb-4">
                            SSH (Secure Shell) es un protocolo de red que permite conectarte de forma <strong>segura y 
                            cifrada</strong> a otro equipo. Un cliente SSH es la aplicación que utilizas para establecer estas conexiones.
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                            <div className="flex gap-3 bg-tertiary p-4 rounded-xl text-[14px] text-secondary">
                                <span className="text-accent shrink-0">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                    </svg>
                                </span>
                                <div>
                                    <strong>Conexión Segura:</strong> Comunicación cifrada para proteger tus datos.
                                </div>
                            </div>
                            <div className="flex gap-3 bg-tertiary p-4 rounded-xl text-[14px] text-secondary">
                                <span className="text-accent shrink-0">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <rect x="2" y="3" width="20" height="14" rx="2" />
                                        <line x1="8" y1="21" x2="16" y2="21" />
                                        <line x1="12" y1="17" x2="12" y2="21" />
                                    </svg>
                                </span>
                                <div>
                                    <strong>Control Remoto:</strong> Accede a servidores Linux desde cualquier lugar.
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="mb-10 animate-in slide-in-from-bottom-8 duration-700">
                    <div className="bg-secondary border border-subtle rounded-2xl p-8">
                        <div className="w-14 h-14 bg-accent/10 text-accent rounded-xl flex items-center justify-center mb-5">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                            </svg>
                        </div>
                        <h2 className="text-[24px] font-semibold text-primary mb-4">Ventajas Educativas</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                            <div className="bg-tertiary p-5 rounded-xl">
                                <div className="flex items-center gap-3 mb-3">
                                    <span className="text-accent">
                                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <rect x="4" y="4" width="16" height="16" rx="2" />
                                            <rect x="9" y="9" width="6" height="6" />
                                        </svg>
                                    </span>
                                    <h3 className="text-[16px] font-semibold text-primary m-0">Asistente de IA Integrado</h3>
                                </div>
                                <p className="text-[14px] text-secondary m-0 leading-relaxed">Aprende Linux conversando naturalmente con un compañero inteligente.</p>
                            </div>
                            <div className="bg-tertiary p-5 rounded-xl">
                                <div className="flex items-center gap-3 mb-3">
                                    <span className="text-accent">
                                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125" />
                                        </svg>
                                    </span>
                                    <h3 className="text-[16px] font-semibold text-primary m-0">Interfaz Moderna</h3>
                                </div>
                                <p className="text-[14px] text-secondary m-0 leading-relaxed">Diseño limpio que elimina la intimidación de la línea de comandos.</p>
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
};

export default LandingPage;
