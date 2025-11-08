// Página de inicio/bienvenida para el cliente SSH inteligente
import React, { useEffect } from 'react';
import { useTour } from '../tour';
import { useAuth } from '../contexts/AuthContext';
import './LandingPage.css';

interface LandingPageProps {
    onStartTutorial?: () => void;
    onPageChange?: (page: string) => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onStartTutorial, onPageChange }) => {
    const { startTour } = useTour(onPageChange);
    const { user } = useAuth();
    
    // Redirigir automáticamente al dashboard correspondiente según el rol
    useEffect(() => {
        if (user && onPageChange) {
            // role_id: 1 = estudiante, 2 = profesor, 3 = admin
            switch (user.role_id) {
                case 1:
                    onPageChange('student-dashboard');
                    break;
                case 2:
                    onPageChange('professor-dashboard');
                    break;
                case 3:
                    onPageChange('admin-dashboard');
                    break;
                default:
                    console.warn('Rol de usuario desconocido:', user.role_id);
            }
        }
    }, [user, onPageChange]);
    
    const handleStartTutorial = () => {
        // Ejecutar callback personalizado si existe
        if (onStartTutorial) {
            onStartTutorial();
        }
        // Iniciar el tour
        startTour();
    };
    return (
        <div className="landing-page">
            <div className="landing-page__container">
                {/* Sección Hero */}
                <section className="landing-hero">
                    <div className="landing-hero__icon">
                        <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="2" y="3" width="20" height="18" rx="2" />
                            <line x1="2" y1="8" x2="22" y2="8" />
                            <path d="M6 12h4" />
                            <path d="M6 15h8" />
                        </svg>
                    </div>
                    <h1 className="landing-hero__title">
                        Conexion remota Unipiloto
                    </h1>
                    <p className="landing-hero__subtitle">
                        Tu compañero inteligente para dominar Linux y la administración remota
                    </p>
                </section>

                {/* Sección Descripción del Proyecto */}
                <section className="landing-section">
                    <div className="landing-card">
                        <div className="landing-card__icon">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                                <path d="M2 17l10 5 10-5" />
                                <path d="M2 12l10 5 10-5" />
                            </svg>
                        </div>
                        <h2 className="landing-card__title">¿Qué es este proyecto?</h2>
                        <p className="landing-card__description">
                            El cliente ssh unipiloto es una herramienta innovadora diseñada específicamente para facilitar 
                            el aprendizaje de Linux y la administración de sistemas remotos. Combinamos un cliente SSH 
                            potente con un asistente de inteligencia artificial que te guía paso a paso en tu viaje 
                            de aprendizaje, desde los conceptos básicos hasta técnicas avanzadas.
                        </p>
                        <p className="landing-card__description">
                            Ya seas un principiante que da sus primeros pasos en la línea de comandos o un usuario 
                            intermedio que busca mejorar sus habilidades, nuestra plataforma te proporciona un 
                            entorno seguro y educativo para experimentar, aprender y crecer.
                        </p>
                    </div>
                </section>

                {/* Sección ¿Qué es SSH? */}
                <section className="landing-section">
                    <div className="landing-card landing-card--accent">
                        <div className="landing-card__icon">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                                <path d="M9 12l2 2 4-4" />
                            </svg>
                        </div>
                        <h2 className="landing-card__title">¿Qué es un cliente SSH?</h2>
                        <p className="landing-card__description">
                            SSH (Secure Shell) es un protocolo de red que permite conectarte de forma <strong>segura y 
                            cifrada</strong> a otro equipo a través de internet o una red local. Un cliente SSH es la 
                            aplicación que utilizas en tu computadora para establecer estas conexiones.
                        </p>
                        <div className="landing-feature-list">
                            <div className="landing-feature-item">
                                <span className="landing-feature-item__icon">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                    </svg>
                                </span>
                                <div>
                                    <strong>Conexión Segura:</strong> Toda la comunicación está cifrada para proteger 
                                    tus datos y credenciales
                                </div>
                            </div>
                            <div className="landing-feature-item">
                                <span className="landing-feature-item__icon">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <rect x="2" y="3" width="20" height="14" rx="2" />
                                        <line x1="8" y1="21" x2="16" y2="21" />
                                        <line x1="12" y1="17" x2="12" y2="21" />
                                    </svg>
                                </span>
                                <div>
                                    <strong>Control Remoto:</strong> Accede y administra servidores Linux desde 
                                    cualquier lugar del mundo
                                </div>
                            </div>
                            <div className="landing-feature-item">
                                <span className="landing-feature-item__icon">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                                    </svg>
                                </span>
                                <div>
                                    <strong>Transferencia de Archivos:</strong> Copia archivos de forma segura entre 
                                    tu computadora y el servidor remoto
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Sección Ventajas */}
                <section className="landing-section">
                    <div className="landing-card">
                        <div className="landing-card__icon">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                            </svg>
                        </div>
                        <h2 className="landing-card__title">¿Por qué elegir nuestro cliente SSH?</h2>
                        <p className="landing-card__description">
                            Hemos diseñado un cliente SSH que va más allá de las herramientas tradicionales, 
                            especialmente pensado para facilitar el aprendizaje:
                        </p>
                        <div className="landing-advantages">
                            <div className="landing-advantage">
                                <div className="landing-advantage__header">
                                    <span className="landing-advantage__icon">
                                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <rect x="4" y="4" width="16" height="16" rx="2" />
                                            <rect x="9" y="9" width="6" height="6" />
                                            <line x1="9" y1="1" x2="9" y2="4" />
                                            <line x1="15" y1="1" x2="15" y2="4" />
                                            <line x1="9" y1="20" x2="9" y2="23" />
                                            <line x1="15" y1="20" x2="15" y2="23" />
                                            <line x1="20" y1="9" x2="23" y2="9" />
                                            <line x1="20" y1="14" x2="23" y2="14" />
                                            <line x1="1" y1="9" x2="4" y2="9" />
                                            <line x1="1" y1="14" x2="4" y2="14" />
                                        </svg>
                                    </span>
                                    <h3>Asistente de IA Integrado</h3>
                                </div>
                                <p>
                                    Un compañero inteligente que responde tus preguntas, sugiere comandos y te 
                                    explica cada paso en lenguaje sencillo. Aprende Linux conversando naturalmente.
                                </p>
                            </div>
                            <div className="landing-advantage">
                                <div className="landing-advantage__header">
                                    <span className="landing-advantage__icon">
                                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
                                            <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
                                            <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
                                            <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
                                            <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
                                        </svg>
                                    </span>
                                    <h3>Interfaz Intuitiva y Moderna</h3>
                                </div>
                                <p>
                                    Diseño limpio y fácil de usar que elimina la intimidación de la línea de comandos. 
                                    Pestañas múltiples, temas personalizables y controles visuales claros.
                                </p>
                            </div>
                            <div className="landing-advantage">
                                <div className="landing-advantage__header">
                                    <span className="landing-advantage__icon">
                                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                                            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                                        </svg>
                                    </span>
                                    <h3>Gestión Inteligente de Conexiones</h3>
                                </div>
                                <p>
                                    Guarda tus servidores favoritos de forma segura, conecta con un clic y mantén 
                                    múltiples sesiones activas simultáneamente. Todo tus datos están cifrados localmente.
                                </p>
                            </div>
                            <div className="landing-advantage">
                                <div className="landing-advantage__header">
                                    <span className="landing-advantage__icon">
                                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                                            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                                        </svg>
                                    </span>
                                    <h3>Recursos Educativos Integrados</h3>
                                </div>
                                <p>
                                    Accede a snippets de código, tutoriales contextuales y explicaciones detalladas 
                                    sin salir de la aplicación. Aprende haciendo, con ejemplos reales.
                                </p>
                            </div>
                            <div className="landing-advantage">
                                <div className="landing-advantage__header">
                                    <span className="landing-advantage__icon">
                                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                                            <line x1="12" y1="11" x2="12" y2="17" />
                                            <line x1="9" y1="14" x2="15" y2="14" />
                                        </svg>
                                    </span>
                                    <h3>Transferencia de Archivos Visual</h3>
                                </div>
                                <p>
                                    Navegador SFTP integrado que te permite arrastrar y soltar archivos entre tu 
                                    computadora y el servidor remoto. Tan fácil como usar un explorador de archivos.
                                </p>
                            </div>
                            <div className="landing-advantage">
                                <div className="landing-advantage__header">
                                    <span className="landing-advantage__icon">
                                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                                        </svg>
                                    </span>
                                    <h3>Seguro y Privado</h3>
                                </div>
                                <p>
                                    Todas tus credenciales se almacenan cifradas en tu dispositivo. Sin servidores 
                                    en la nube, sin seguimiento. Tu privacidad es nuestra prioridad.
                                </p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Sección Call to Action */}
                <section className="landing-section landing-section--cta">
                    <div className="landing-cta">
                        <h2 className="landing-cta__title">¿Listo para comenzar tu viaje?</h2>
                        <p className="landing-cta__description">
                            Conecta tu primer servidor y descubre lo fácil que puede ser trabajar con Linux
                        </p>
                        <button 
                            className="landing-cta__button"
                            onClick={handleStartTutorial}
                        >
                            <span>Iniciar tutorial</span>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="5" y1="12" x2="19" y2="12" />
                                <polyline points="12 5 19 12 12 19" />
                            </svg>
                        </button>
                        <p className="landing-cta__note">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '4px' }}>
                                <circle cx="12" cy="12" r="10" />
                                <line x1="12" y1="16" x2="12" y2="12" />
                                <line x1="12" y1="8" x2="12.01" y2="8" />
                            </svg>
                            <em>Tip: Si ya tienes un servidor Linux o Raspberry Pi, ¡puedes conectarte ahora mismo!</em>
                        </p>
                    </div>
                </section>

                {/* Footer */}
                <footer className="landing-footer">
                    <p>
                        Desarrollado con{' '}
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none" style={{ display: 'inline-block', verticalAlign: 'middle', color: '#ef4444' }}>
                            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                        </svg>
                        {' '}por el equipo de Cliente SSH Unipiloto.
                    </p>
                </footer>
            </div>
        </div>
    );
};

export default LandingPage;
