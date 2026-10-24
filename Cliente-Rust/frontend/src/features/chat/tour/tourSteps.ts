import type { DriveStep } from 'driver.js';

/**
 * Configuración de pasos del tour interactivo
 * Guía al usuario a través de todas las funcionalidades de la aplicación
 *
 * ÍNDICES RELEVANTES (para validaciones en useTour.ts):
 *   5  → "Conéctate ahora"  — requiere sesión SSH activa
 *   7  → "Chat de IA"       — requiere al menos un mensaje del asistente
 *   14 → "Transferir archivos" — al seguir, vuelve al terminal
 */

// ── Helper SVG inline ────────────────────────────────────────────────────────
const icon = (d: string) =>
  `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-right:8px">${d}</svg>`;

export const tourSteps: DriveStep[] = [

  // ── 0 · Barra lateral ───────────────────────────────────────────────────
  {
    element: '[data-tour="sidebar-header"]',
    popover: {
      title: icon('<path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>') + 'Barra de Navegación',
      description:
        'Esta es la barra lateral de navegación. Desde aquí accedes a todas las secciones de la aplicación. Puedes contraerla con el ícono de menú ☰ para ganar espacio en pantalla.',
      side: 'right',
      align: 'start',
    },
  },

  // ── 1 · Página de inicio ────────────────────────────────────────────────
  {
    element: '[data-page="landing"]',
    popover: {
      title: icon('<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>') + 'Página de Inicio',
      description:
        'Vuelve aquí en cualquier momento para ver el acceso rápido a las secciones, información del proyecto y el botón Ver Tutorial para reiniciar este recorrido.',
      side: 'right',
      align: 'start',
    },
  },

  // ── 2 · Prácticas de Laboratorio (NUEVO) ────────────────────────────────
  {
    element: '[data-page="practices"]',
    popover: {
      title: icon('<path d="M9 3h6M10 3v7.4a2 2 0 0 1-.5 1.3L4 19a2 2 0 0 0 1.5 3h13a2 2 0 0 0 1.5-3l-5.5-7.3A2 2 0 0 1 14 10.4V3"/><path d="M8.5 14h7"/>') + 'Prácticas de Laboratorio',
      description:
        '🧪 ¡Novedad! Accede a las prácticas configuradas por tu profesor.<br/><br/>' +
        'Cada práctica incluye:<br/>' +
        '• Conexión automática al servidor de la práctica<br/>' +
        '• Terminal restringida con los comandos permitidos<br/>' +
        '• Chat IA contextual que conoce el tema de la práctica<br/>' +
        '• Cámara en tiempo real del entorno (robot, circuito, etc.)<br/>' +
        '• Validación automática de objetivos cumplidos<br/>' +
        '• Calificación automática enviada a Moodle al finalizar',
      side: 'right',
      align: 'start',
    },
  },

  // ── 3 · Conexiones ──────────────────────────────────────────────
  {
    element: '[data-page="connect"]',
    popover: {
      title: icon('<path d="M6 3v12"/><circle cx="18" cy="9" r="3"/><circle cx="6" cy="21" r="3"/><path d="M18 9a9 9 0 0 1-9 12"/>') + 'Conexiones',
      description:
        'Aquí te conectas por SSH: los equipos del laboratorio, tus equipos guardados y las conexiones recientes, cada uno con su botón Conectar. También abres una terminal en este computador.',
      side: 'right',
      align: 'start',
    },
  },

  // ── 4 · Nueva conexión ───────────────────────────────────────────
  {
    element: '[data-tour="nueva-conexion"]',
    popover: {
      title: icon('<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>') + 'Nueva conexión',
      description:
        'Abre el formulario para conectarte a un servidor que no está en tu lista:<br/>' +
        '• Host/IP: Dirección del servidor<br/>' +
        '• Puerto: Usualmente 22 o personalizado<br/>' +
        '• Usuario: Tu nombre de usuario<br/>' +
        '• Contraseña: Credencial de acceso<br/><br/>' +
        'Puedes guardarlo en tus equipos para la próxima vez.',
      side: 'right',
      align: 'center',
    },
  },

  // ── 5 · Equipos del laboratorio ────────────────────────────────────────────────────
  {
    element: '[data-tour="quick-hosts-panel"]',
    popover: {
      title: icon('<circle cx="12" cy="12" r="2"/><path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/>') + 'Equipos del laboratorio',
      description:
        'Los equipos del laboratorio ya vienen listos. Al seguir, abrimos el formulario de la Raspberry Pi 4 con la dirección llena: solo pones tu usuario y contraseña.',
      side: 'bottom',
      align: 'center',
    },
  },

  // ── 6 · Conéctate ahora (VALIDADO) ──────────────────────────────────────
  //    useTour.ts verifica opts.state.activeIndex === 5
  //    ⚠️  Si cambias el orden de pasos, actualiza ese índice en useTour.ts
  {
    element: '[data-tour="connect-form"] .connect-form',
    popover: {
      title: icon('<path d="M16 21v-2a4 4 0 0 0-8 0v2"/><circle cx="12" cy="7" r="4"/>') + 'Conéctate ahora',
      description:
        'Ya abrimos la Raspberry Pi 4. Completa tus credenciales y pulsa Conectar:<br/>' +
        '• Usuario: escribe tu usuario institucional con formato <code>UPILOTO\\\\usuario</code><br/>' +
        '• Contraseña: es la misma de tu correo universitario<br/><br/>' +
        'Puedes interactuar con este formulario durante el tour. Cuando la conexión sea exitosa, pasaremos al Terminal automáticamente.',
      side: 'right',
      align: 'center',
    },
  },

  // ── 7 · Terminal ─────────────────────────────────────────────────────────
  {
    element: '.terminal-stack',
    popover: {
      title: icon('<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>') + 'Terminal',
      description:
        'Una vez conectado, el terminal te permite ejecutar comandos en el servidor remoto.<br/><br/>' +
        'Atajos de teclado:<br/>' +
        '• <kbd>Ctrl+C</kbd>: Cancelar comando en ejecución<br/>' +
        '• <kbd>Ctrl+V</kbd>: Pegar texto<br/>' +
        '• <kbd>Ctrl+Shift+C</kbd>: Copiar texto seleccionado<br/>' +
        '• <kbd>Tab</kbd>: Autocompletar comandos',
      side: 'right',
      align: 'start',
    },
  },

  // ── 8 · Chat de IA (VALIDADO) ────────────────────────────────────────────
  //    useTour.ts verifica opts.state.activeIndex === 7
  //    ⚠️  Si cambias el orden de pasos, actualiza ese índice en useTour.ts
  {
    element: '.chat-pane',
    popover: {
      title: icon('<rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8.01" y2="16"/><line x1="16" y1="16" x2="16.01" y2="16"/>') + 'Chat de IA',
      description:
        'El Chat de IA es tu asistente inteligente. Responde preguntas y genera comandos que puedes ejecutar.<br/><br/>' +
        'Ejemplos de uso:<br/>' +
        '• <em>"¿Cómo listo archivos ocultos?"</em> → Te explica y muestra <code>ls -la</code><br/>' +
        '• <em>"Crea un archivo llamado prueba.txt"</em> → Genera <code>touch prueba.txt</code><br/>' +
        '• <em>"¿Qué hace chmod 755?"</em> → Te explica permisos en detalle<br/><br/>' +
        '🎯 Prueba ahora:<br/>Escribe en el chat: <em>"¿Quién eres?"</em><br/><br/>' +
        'El asistente se presentará y te explicará cómo puede ayudarte. Debes probarlo antes de continuar.',
      side: 'left',
      align: 'start',
    },
  },

  // ── 9 · Agente AI con tools (NUEVO) ─────────────────────────────────────
  {
    element: '.chat-pane',
    popover: {
      title: icon('<circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>') + 'Agente AI — Modo Ejecutar',
      description:
        '🤖 ¡Modo Agente! A diferencia del chat simple, el Agente AI puede actuar por ti en el servidor remoto.<br/><br/>' +
        'Selecciona el modo Agente en el chat y prueba:<br/>' +
        '• <em>"¿Cuánta memoria tiene el servidor?"</em> → El agente ejecuta <code>free -h</code> y te da el resultado<br/>' +
        '• <em>"Lista los archivos de mi home"</em> → El agente corre <code>ls -la ~</code><br/>' +
        '• <em>"Reinicia el servicio multicam"</em> → El agente corre <code>systemctl restart multicam</code><br/><br/>' +
        'El Agente usa un loop tool_use con Claude: inspecciona el servidor, ejecuta comandos SSH/SFTP, lee archivos y responde con información real.',
      side: 'left',
      align: 'start',
    },
  },

  // ── 10 · Plan AI (NUEVO) ────────────────────────────────────────────────
  {
    element: '.chat-pane',
    popover: {
      title: icon('<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>') + 'Agente AI — Modo Plan',
      description:
        '📋 Modo Plan — Para cuando necesitas que el agente te explique qué hacer <em>sin ejecutar nada todavía</em>.<br/><br/>' +
        'Selecciona el modo Plan y, por ejemplo:<br/>' +
        '• <em>"Cómo instalo un servidor web en este servidor"</em><br/>' +
        '→ El agente inspecciona el sistema, detecta el OS, paquetes instalados y genera un plan paso a paso con comandos reales que puedes pegar en el terminal.<br/><br/>' +
        'Ideal para: aprender antes de ejecutar, evitar errores en producción, entender el estado del servidor.',
      side: 'left',
      align: 'start',
    },
  },

  // ── 11 · Archivos (en «Esta sesión») ────────────────────────────────────────────────
  {
    element: '[data-page="sftp"]',
    popover: {
      title: icon('<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>') + 'Archivos (SFTP)',
      description:
        'En «Esta sesión», Archivos abre el explorador SFTP de la conexión: transfiere archivos entre tu computador y el servidor. Vamos a ver cómo funciona.',
      side: 'right',
      align: 'start',
    },
  },

  // ── 12 · Panel Local (SFTP) ──────────────────────────────────────────────
  {
    element: '[data-tour="sftp-panel-local"]',
    popover: {
      title: icon('<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>') + 'Panel Local',
      description:
        '📂 Archivos de tu computadora<br/><br/>' +
        'Este panel muestra los archivos y carpetas de tu PC local. Aquí puedes:<br/>' +
        '• Navegar por tus carpetas<br/>' +
        '• Buscar archivos con el campo de búsqueda<br/>' +
        '• Seleccionar archivos para subir ↑ al servidor<br/>' +
        '• Usar el botón Refrescar ↻ para actualizar la lista',
      side: 'right',
      align: 'start',
    },
  },

  // ── 13 · Panel Remoto (SFTP) ────────────────────────────────────────────
  {
    element: '[data-tour="sftp-panel-remote"]',
    popover: {
      title: icon('<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>') + 'Panel Remoto',
      description:
        '🌐 Archivos del servidor<br/><br/>' +
        'Este panel muestra los archivos del servidor SSH al que estás conectado. Aquí puedes:<br/>' +
        '• Navegar por las carpetas del servidor<br/>' +
        '• Buscar archivos remotos<br/>' +
        '• Seleccionar archivos para descargar ↓ a tu PC<br/>' +
        '• Ver el estado de conexión (conectado/desconectado)',
      side: 'left',
      align: 'start',
    },
  },

  // ── 14 · Transferir archivos ─────────────────────────────────────────────
  {
    element: '.sftp-icon-btn--primary',
    popover: {
      title: icon('<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>') + 'Transferir archivos',
      description:
        '📤 Subir y descargar archivos<br/><br/>' +
        'Los botones con flechas transfieren archivos:<br/>' +
        '• ↑ Subir: Transfiere archivos de tu PC (izq.) al servidor (der.)<br/>' +
        '• ↓ Descargar: Trae archivos del servidor a tu computadora<br/><br/>' +
        '<em>Selecciona uno o más archivos y haz clic en el botón correspondiente.</em>',
      side: 'bottom',
      align: 'center',
    },
  },

  // ── 15 · Escritorio Remoto VNC ── flotante, sin oscurecer el header
  {
    popover: {
      title: icon('<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>') + 'Escritorio Remoto',
      description:
        'En «Esta sesión», el ícono de monitor activa el escritorio remoto del servidor.<br/><br/>' +
        'Te permite ver y controlar el entorno gráfico directamente desde la app.',
      side: 'top',
      align: 'end',
    },
  },

  // ── 16 · GPIO Raspberry Pi (NUEVO) ── flotante
  {
    popover: {
      title: icon('<circle cx="12" cy="12" r="5"/><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/>') + 'Control GPIO — Raspberry Pi',
      description:
        '🔌 Control de pines GPIO en tiempo real.<br/><br/>' +
        'Desde esta vista puedes:<br/>' +
        '• Ver el estado actual de todos los pines BCM (nivel, función, pull)<br/>' +
        '• Configurar el modo de un pin: <code>INPUT</code> / <code>OUTPUT</code><br/>' +
        '• Configurar la resistencia pull: <code>UP</code> / <code>DOWN</code> / <code>NONE</code><br/>' +
        '• Escribir nivel digital: <code>1 (alto)</code> / <code>0 (bajo)</code><br/><br/>' +
        'Usa <code>raspi-gpio</code> vía SSH sin necesidad de scripts.',
      side: 'right',
      align: 'start',
    },
  },

  // ── 17 · Arduino Domótica (NUEVO) ── flotante
  {
    popover: {
      title: icon('<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>') + 'Arduino — Domótica',
      description:
        '⚡ Bridge Arduino — Comunícate con un Arduino conectado al puerto serial de la Raspberry Pi.<br/><br/>' +
        'Todo el tráfico va por SSH sin abrir puertos extras:<br/>' +
        '• Estado del bridge: Puerto serial detectado, si está abierto<br/>' +
        '• Enviar comando: Manda strings al Arduino (ej: <code>LUZ1 ON</code>, <code>PING</code>)<br/>' +
        '• Leer buffer: Lee respuestas espontáneas del Arduino<br/><br/>' +
        'Ver <code>docs/arduino_domotica.md</code> para instalar el servicio en la Pi.',
      side: 'right',
      align: 'start',
    },
  },

  // ── 18 · Mis comandos ────────────────────────────────────────────────────
  {
    element: '[data-page="snippets"]',
    popover: {
      title: icon('<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>') + 'Mis comandos',
      description:
        'En «Esta sesión», Mis comandos guarda comandos útiles para reutilizarlos. Organízalos con etiquetas y ejecútalos con un clic desde el terminal.',
      side: 'right',
      align: 'start',
    },
  },

  // ── 19 · Equipos guardados y registros (en Conexiones) ─────────────────
  {
    element: '[data-page="connect"]',
    popover: {
      title: icon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>') + 'Equipos guardados y registros',
      description:
        'En Conexiones quedan tus equipos guardados (con la contraseña cifrada en este computador) y, en la pestaña Registros, todas tus sesiones SSH:<br/>' +
        '• Revisar el historial de comandos de sesiones anteriores<br/>' +
        '• Exportar sesiones como PDF para entregas o evidencia<br/>' +
        '• Buscar por usuario o equipo',
      side: 'right',
      align: 'start',
    },
  },

  // ── 20 · Temas (en el menú del usuario, abajo en la barra) ───────────────
  {
    element: '[data-tour="sidebar-usuario"]',
    popover: {
      title: icon('<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>') + 'Temas',
      description:
        'Personaliza la apariencia de la aplicación con múltiples temas: abre el menú de tu usuario y elige Temas. Incluye opciones de colores, tipografías y estilos del terminal.',
      side: 'right',
      align: 'start',
    },
  },

  // ── 21 · Próximos pasos (actualizado) ───────────────────────────────────
  {
    popover: {
      title: icon('<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>') + 'Próximos pasos',
      description:
        '¡Ya conoces la aplicación! Te recomendamos:<br/>' +
        '1. Ve a Prácticas de Laboratorio y selecciona tu práctica asignada<br/>' +
        '2. Usa el Agente AI en modo <em>Ejecutar</em> para tareas rápidas en el servidor<br/>' +
        '3. Usa el modo <em>Plan</em> antes de instalar o modificar algo importante<br/>' +
        '4. Guarda tus comandos favoritos en Mis comandos<br/>' +
        '5. Explora el Escritorio Remoto (VNC) para tareas gráficas',
      side: 'left',
      align: 'start',
    },
  },

  // ── 22 · ¡Tour completado! ───────────────────────────────────────────────
  {
    popover: {
      title: icon('<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>') + '¡Tour Completado!',
      description:
        '¡Gracias por completar el tour! Puedes volver a iniciarlo en cualquier momento desde la página de inicio.<br/><br/>' +
        'Si necesitas ayuda adicional, el asistente de IA está siempre disponible en el terminal.',
      side: 'left',
      align: 'start',
    },
  },
];
