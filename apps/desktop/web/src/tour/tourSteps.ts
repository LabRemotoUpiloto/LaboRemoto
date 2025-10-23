import type { DriveStep } from 'driver.js';

/**
 * Configuración de pasos del tour interactivo
 * Guía al usuario a través de todas las funcionalidades de la aplicación
 */
export const tourSteps: DriveStep[] = [
  {
    element: '[data-tour="sidebar-header"]',
    popover: {
      title: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-right:8px"><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>Barra de Navegación',
      description: 'Esta es la barra lateral de navegación. Desde aquí puedes acceder a todas las funcionalidades de la aplicación. Puedes contraerla o expandirla haciendo clic en el ícono de menú hamburguesa.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '[data-page="landing"]',
    popover: {
      title: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-right:8px"><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>Página de Inicio',
      description: 'Este botón te lleva a la página de inicio, donde encontrarás información sobre el proyecto, guías de uso y acceso rápido para iniciar este tutorial en cualquier momento.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '[data-page="connect"]',
    popover: {
      title: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-right:8px"><path d="M6 3v12"/><circle cx="18" cy="9" r="3"/><circle cx="6" cy="21" r="3"/><path d="M18 9a9 9 0 0 1-9 12"/></svg>Conectar a Servidor',
      description: 'Haz clic aquí para ir a la página de conexión SSH. Esta es la puerta de entrada para conectarte a servidores remotos y comenzar a trabajar con Linux.',
      side: 'right',
      align: 'start',
    },
  },
  {
    // Apuntar al contenedor real del formulario, no al wrapper de página
    element: '[data-tour="connect-form"] .connect-form',
    popover: {
      title: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-right:8px"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>Formulario de Conexión',
      description: 'Aquí ingresas los datos para conectarte a un servidor SSH:<br/>• <strong>Host/IP</strong>: Dirección del servidor<br/>• <strong>Puerto</strong>: Usualmente 22 o personalizado<br/>• <strong>Usuario</strong>: Tu nombre de usuario<br/>• <strong>Contraseña</strong>: Credencial de acceso<br/><br/>También puedes guardar la configuración para futuras conexiones.',
      side: 'right',
      align: 'center',
    },
  },
  {
    element: '[data-tour="quick-hosts-panel"]',
    popover: {
      title: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-right:8px"><circle cx="12" cy="12" r="2"/><path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/></svg>Hosts Rápidos',
      description: 'Los <strong>Hosts Rápidos</strong> son servidores preconfigurados que puedes seleccionar con un clic. Al hacer clic en uno, se autocompletarán el host y puerto en el formulario. Solo necesitas ingresar tu usuario y contraseña para conectarte rápidamente.',
      side: 'bottom',
      align: 'center',
    },
  },
  {
    // Paso de acción: permite rellenar usuario/contraseña y conectar
    element: '[data-tour="connect-form"] .connect-form',
    popover: {
      title: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-right:8px"><path d="M16 21v-2a4 4 0 0 0-8 0v2"/><circle cx="12" cy="7" r="4"/></svg>Conéctate ahora',
      description: 'Ya seleccionamos un host rápido arriba. Completa tus credenciales y pulsa <strong>Conectar</strong>:<br/>• <strong>Usuario</strong>: escribe tu usuario institucional con formato <code>UPILOTO\\usuario</code><br/>• <strong>Contraseña</strong>: es la misma de tu correo universitario<br/><br/>Puedes interactuar con este formulario durante el tour. Cuando la conexión sea exitosa, pasaremos al Terminal automáticamente.',
      side: 'right',
      align: 'center',
    },
  },
  {
    element: '.terminal-stack',
    popover: {
      title: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-right:8px"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>Terminal',
      description: 'Una vez conectado, el terminal te permite ejecutar comandos en el servidor remoto. Incluye un asistente de IA que te ayuda a componer comandos y realizar tareas.<br/><br/><strong>Atajos de teclado:</strong><br/>• <kbd>Ctrl+C</kbd>: Cancelar comando en ejecución<br/>• <kbd>Ctrl+V</kbd>: Pegar texto<br/>• <kbd>Ctrl+Shift+C</kbd>: Copiar texto seleccionado<br/>• <kbd>Tab</kbd>: Autocompletar comandos',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '.chat-pane',
    popover: {
      title: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-right:8px"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8.01" y2="16"/><line x1="16" y1="16" x2="16.01" y2="16"/></svg>Chat de IA',
      description: 'El <strong>Chat de IA</strong> es tu asistente inteligente que <strong>responde preguntas y genera comandos</strong> que puedes ejecutar. Todo en un solo modo:<br/><br/><strong>Ejemplos de uso:</strong><br/>• <em>"¿Cómo listo archivos ocultos?"</em> → Te explica y muestra <code>ls -la</code><br/>• <em>"Crea un archivo llamado prueba.txt"</em> → Genera <code>touch prueba.txt</code><br/>• <em>"¿Qué hace chmod 755?"</em> → Te explica permisos en detalle<br/>• <em>"Muéstrame el contenido de /home"</em> → Sugiere <code>ls -lah /home</code><br/><br/>Los comandos se muestran primero y <strong>tú decides si ejecutarlos</strong> haciendo clic en el botón <strong>"Ejecutar"</strong> o <strong>"copiar"</strong> para copiar el .<br/><br/><strong>🎯 Prueba ahora:</strong><br/>Escribe en el chat: <em>"¿Quién eres?"</em><br/><br/>El asistente se presentará y te explicará cómo puede ayudarte. <strong>Debes probarlo antes de continuar.</strong>',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '[data-page="hosts"]',
    popover: {
      title: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-right:8px"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>Hosts Guardados',
      description: 'Gestiona tus conexiones SSH guardadas. Puedes crear, editar y eliminar configuraciones de hosts con contraseñas cifradas de forma segura.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '[data-page="themes"]',
    popover: {
      title: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-right:8px"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>Temas',
      description: 'Personaliza la apariencia de la aplicación con múltiples temas. Incluye opciones de colores, tipografías y estilos del terminal.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '[data-page="sftp"]',
    popover: {
      title: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-right:8px"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>Explorador SFTP',
      description: 'Transfiere archivos entre tu máquina local y el servidor remoto de forma visual. Vamos a hacer un recorrido por sus funcionalidades.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '[data-tour="sftp-panel-local"]',
    popover: {
      title: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-right:8px"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>Panel Local',
      description: '<strong>📂 Archivos de tu computadora</strong><br/><br/>Este panel muestra los archivos y carpetas de tu PC local. Aquí puedes:<br/>• Navegar por tus carpetas<br/>• Buscar archivos con el campo de búsqueda<br/>• Seleccionar archivos para <strong>subir ↑</strong> al servidor<br/>• Usar el botón <strong>Refrescar ↻</strong> para actualizar la lista',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '[data-tour="sftp-panel-remote"]',
    popover: {
      title: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-right:8px"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>Panel Remoto',
      description: '<strong>🌐 Archivos del servidor</strong><br/><br/>Este panel muestra los archivos del servidor SSH al que estás conectado. Aquí puedes:<br/>• Navegar por las carpetas del servidor<br/>• Buscar archivos remotos<br/>• Seleccionar archivos para <strong>descargar ↓</strong> a tu PC<br/>• Ver el estado de conexión (conectado/desconectado)',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '.sftp-icon-btn--primary',
    popover: {
      title: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-right:8px"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>Transferir archivos',
      description: '<strong>📤 Subir archivos al servidor</strong><br/><br/>Los botones con flechas te permiten transferir archivos:<br/>• <strong>↑ Subir</strong>: Transfiere archivos desde tu PC (panel izquierdo) al servidor (panel derecho)<br/>• <strong>↓ Descargar</strong>: Trae archivos del servidor a tu computadora<br/><br/><em>Selecciona uno o más archivos y haz clic en el botón correspondiente para iniciar la transferencia.</em>',
      side: 'bottom',
      align: 'center',
    },
  },
  {
    element: '[data-page="snippets"]',
    popover: {
      title: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-right:8px"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>Snippets',
      description: 'Guarda comandos útiles como snippets para reutilizarlos fácilmente. Organízalos con etiquetas y ejecútalos con un clic desde el terminal.',
      side: 'right',
      align: 'start',
    },
  },
  
  {
    popover: {
      title: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-right:8px"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8.01" y2="16"/><line x1="16" y1="16" x2="16.01" y2="16"/></svg>Asistente de IA',
      description: 'El asistente de IA está integrado en el terminal. Puedes pedirle que te ayude a:<br/>• Componer comandos complejos<br/>• Buscar y editar archivos remotos<br/>• Explicar errores y resultados<br/>• Sugerir mejores prácticas',
      side: 'left',
      align: 'start',
    },
  },
  {
    popover: {
      title: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-right:8px"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>Aprendizaje de Linux',
      description: 'Esta herramienta está diseñada para aprender Linux de forma práctica:<br/>• El asistente te explica comandos antes de ejecutarlos<br/>• Detecta operaciones peligrosas y te alerta<br/>• Los snippets incluyen ejemplos educativos<br/>• El terminal muestra resultados en tiempo real',
      side: 'left',
      align: 'start',
    },
  },
  {
    popover: {
      title: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-right:8px"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>Próximos Pasos',
      description: '¡Ya estás listo para comenzar!<br/>1. Explora el <strong>Terminal</strong> y prueba el asistente de IA<br/>2. Guarda tus comandos favoritos en <strong>Snippets</strong><br/>3. Personaliza la interfaz en <strong>Temas</strong>',
      side: 'left',
      align: 'start',
    },
  },
  {
    popover: {
      title: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-right:8px"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>¡Tour Completado!',
      description: '¡Gracias por completar el tour! Puedes volver a iniciarlo en cualquier momento desde la página de inicio.<br/><br/>Si necesitas ayuda adicional, el asistente de IA está siempre disponible en el terminal.',
      side: 'left',
      align: 'start',
    },
  },
];
