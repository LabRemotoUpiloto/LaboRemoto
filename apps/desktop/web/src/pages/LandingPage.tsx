// Página de inicio/bienvenida para el cliente SSH inteligente
import React from 'react';
import './LandingPage.css';

interface LandingPageProps {
    onStartTutorial?: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onStartTutorial }) => {
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
                        Bienvenido a Cliente SSH Unipiloto
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
                                <span className="landing-feature-item__icon">🔐</span>
                                <div>
                                    <strong>Conexión Segura:</strong> Toda la comunicación está cifrada para proteger 
                                    tus datos y credenciales
                                </div>
                            </div>
                            <div className="landing-feature-item">
                                <span className="landing-feature-item__icon">💻</span>
                                <div>
                                    <strong>Control Remoto:</strong> Accede y administra servidores Linux desde 
                                    cualquier lugar del mundo
                                </div>
                            </div>
                            <div className="landing-feature-item">
                                <span className="landing-feature-item__icon">📁</span>
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
                                    <span className="landing-advantage__icon">🤖</span>
                                    <h3>Asistente de IA Integrado</h3>
                                </div>
                                <p>
                                    Un compañero inteligente que responde tus preguntas, sugiere comandos y te 
                                    explica cada paso en lenguaje sencillo. Aprende Linux conversando naturalmente.
                                </p>
                            </div>
                            <div className="landing-advantage">
                                <div className="landing-advantage__header">
                                    <span className="landing-advantage__icon">🎨</span>
                                    <h3>Interfaz Intuitiva y Moderna</h3>
                                </div>
                                <p>
                                    Diseño limpio y fácil de usar que elimina la intimidación de la línea de comandos. 
                                    Pestañas múltiples, temas personalizables y controles visuales claros.
                                </p>
                            </div>
                            <div className="landing-advantage">
                                <div className="landing-advantage__header">
                                    <span className="landing-advantage__icon">🔗</span>
                                    <h3>Gestión Inteligente de Conexiones</h3>
                                </div>
                                <p>
                                    Guarda tus servidores favoritos de forma segura, conecta con un clic y mantén 
                                    múltiples sesiones activas simultáneamente. Todo tus datos están cifrados localmente.
                                </p>
                            </div>
                            <div className="landing-advantage">
                                <div className="landing-advantage__header">
                                    <span className="landing-advantage__icon">📚</span>
                                    <h3>Recursos Educativos Integrados</h3>
                                </div>
                                <p>
                                    Accede a snippets de código, tutoriales contextuales y explicaciones detalladas 
                                    sin salir de la aplicación. Aprende haciendo, con ejemplos reales.
                                </p>
                            </div>
                            <div className="landing-advantage">
                                <div className="landing-advantage__header">
                                    <span className="landing-advantage__icon">📂</span>
                                    <h3>Transferencia de Archivos Visual</h3>
                                </div>
                                <p>
                                    Navegador SFTP integrado que te permite arrastrar y soltar archivos entre tu 
                                    computadora y el servidor remoto. Tan fácil como usar un explorador de archivos.
                                </p>
                            </div>
                            <div className="landing-advantage">
                                <div className="landing-advantage__header">
                                    <span className="landing-advantage__icon">🛡️</span>
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
                            onClick={onStartTutorial}
                        >
                            <span>Iniciar tutorial</span>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="5" y1="12" x2="19" y2="12" />
                                <polyline points="12 5 19 12 12 19" />
                            </svg>
                        </button>
                        <p className="landing-cta__note">
                            💡 <em>Tip: Si ya tienes un servidor Linux o Raspberry Pi, ¡puedes conectarte ahora mismo!</em>
                        </p>
                    </div>
                </section>

                {/* Footer */}
                <footer className="landing-footer">
                    <p>
                        Desarrollado con ❤️ por el equipo de Cliente SSH Unipiloto.
                    </p>
                </footer>
            </div>
        </div>
    );
};

export default LandingPage;
