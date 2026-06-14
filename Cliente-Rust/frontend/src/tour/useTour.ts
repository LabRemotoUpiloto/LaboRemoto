import { driver, type Driver, type Config } from 'driver.js';
import { tourSteps } from './tourSteps';
import 'driver.js/dist/driver.css';
import './tourStyles.css';

let driverInstance: Driver | null = null;
let onPageChangeCallback: ((page: string) => void) | null = null;
let tourObserver: MutationObserver | null = null;
let hasJumpedToTerminal = false;
let jumpTimer: any = null;
let chatOpenTimer: any = null;

/**
 * Configuración del driver.js con estilos personalizados
 */
const createDriverConfig = (): Config => ({
  showProgress: true,
  steps: tourSteps,
  nextBtnText: 'Siguiente →',
  prevBtnText: '← Anterior',
  doneBtnText: '¡Entendido! ✓',
  progressText: '{{current}} de {{total}}',
  showButtons: ['next', 'previous', 'close'],
  
  // Configuración de animación
  animate: true,
  smoothScroll: true,
  
  // Overlay oscuro para resaltar el elemento
  overlayColor: 'rgba(0, 0, 0, 0.85)',
  
  // Padding alrededor del elemento destacado (un poco de espacio para no "tocar" el objetivo)
  stagePadding: 8,
  
  // Desactivar recorte para mantener la sidebar visible
  stageRadius: 0,
  
  // Configuración de posicionamiento: separa el popover del elemento
  popoverOffset: 36,
  
  // IMPEDIR CIERRE AL HACER CLIC FUERA DEL MODAL - Solo permitir cierre con botón X
  allowClose: false,
  
  // Callback antes de avanzar al siguiente paso
  onNextClick: (element, step, opts) => {

    // Paso 4 (Formulario) → 5 (Hosts Rápidos):
    // Asegurar que estamos en la página de connect y el elemento existe
    if (opts.state.activeIndex === 4) {
      const quickHostsEl = document.querySelector('[data-tour="quick-hosts-panel"]');
      if (!quickHostsEl) {
        // Navegar a connect y esperar que el elemento aparezca
        window.dispatchEvent(new CustomEvent('app:open-panel', { detail: 'connect' }));
        if (onPageChangeCallback) onPageChangeCallback('connect');
        let waited = 0;
        const interval = setInterval(() => {
          waited += 60;
          const el = document.querySelector('[data-tour="quick-hosts-panel"]');
          if (el || waited >= 900) {
            clearInterval(interval);
            if (driverInstance) driverInstance.moveNext();
          }
        }, 60);
        return;
      }
    }

    // Paso 6 (índice 6 - "Conéctate ahora"), verificar que haya sesión SSH
    if (opts.state.activeIndex === 6) {
      // Buscar si existe alguna pestaña de sesión activa en el DOM
      const hasActiveSession = document.querySelector('.tab.session-tab.active') !== null;
      
      if (!hasActiveSession) {
        // Mostrar notificación temporal en el popover
        const popoverDesc = document.querySelector('.driver-popover-description');
        if (popoverDesc) {
          // Verificar si ya hay una alerta mostrada (evitar duplicados)
          const existingAlert = popoverDesc.querySelector('.tour-validation-alert');
          if (existingAlert) {
            // Ya hay una alerta, no agregar otra
            return;
          }
          
          const originalContent = popoverDesc.innerHTML;
          popoverDesc.innerHTML = `
            <div class="tour-validation-alert">
              <div style="color: #ff6b6b; font-weight: 600; margin-bottom: 12px; padding: 12px; background: rgba(255, 107, 107, 0.1); border-radius: 8px; border: 1px solid #ff6b6b;">
                ⚠️ Debes conectarte primero antes de continuar
              </div>
            </div>
            ${originalContent}
          `;
          
          // Restaurar el contenido original después de 3 segundos
          setTimeout(() => {
            popoverDesc.innerHTML = originalContent;
          }, 3000);
        }
        
        // Prevenir el avance al siguiente paso
        return;
      }
    }
    
    // Si estamos en el paso 9 (índice 8 - "Chat de IA"), verificar que se haya probado el chat
    if (opts.state.activeIndex === 8) {
      // Verificar si hay mensajes en el chat (buscar burbujas de mensajes del asistente)
      const chatMessages = document.querySelectorAll('.chat-messages .message--assistant');
      const hasTestedChat = chatMessages.length > 0;
      
      if (!hasTestedChat) {
        // Mostrar notificación temporal en el popover
        const popoverDesc = document.querySelector('.driver-popover-description');
        if (popoverDesc) {
          // Verificar si ya hay una alerta mostrada (evitar duplicados)
          const existingAlert = popoverDesc.querySelector('.tour-validation-alert');
          if (existingAlert) {
            // Ya hay una alerta, no agregar otra
            return;
          }
          
          const originalContent = popoverDesc.innerHTML;
          popoverDesc.innerHTML = `
            <div class="tour-validation-alert">
              <div style="color: #ff6b6b; font-weight: 600; margin-bottom: 12px; padding: 12px; background: rgba(255, 107, 107, 0.1); border-radius: 8px; border: 1px solid #ff6b6b;">
                ⚠️ Debes probar el Chat de IA primero
              </div>
              <div style="color: #ffd93d; font-weight: 500; margin-bottom: 8px; padding: 8px; background: rgba(255, 217, 61, 0.1); border-radius: 6px;">
                💡 Escribe en el chat: "¿Quién eres?" y espera la respuesta del asistente
              </div>
            </div>
            ${originalContent}
          `;
          
          // Restaurar el contenido original después de 5 segundos
          setTimeout(() => {
            popoverDesc.innerHTML = originalContent;
          }, 5000);
        }
        
        // Prevenir el avance al siguiente paso
        return;
      }
    }
    
    // Paso 7 (Terminal) → 8 (Chat IA):
    // Abrir el chat ANTES de que driver.js intente destacar .chat-pane
    if (opts.state.activeIndex === 7) {
      const chatAlreadyOpen = !!document.querySelector('.chat-pane');
      if (chatAlreadyOpen) {
        // Ya está abierto, avanzar directamente
        if (driverInstance) driverInstance.moveNext();
        return;
      }
      // Disparar el evento para que App.tsx llame setIsChatOpen(true)
      window.dispatchEvent(new CustomEvent('tour:open-chat'));
      // Polling: esperar hasta 2s a que React monte el ChatPane en el DOM
      let attempts = 0;
      const MAX_ATTEMPTS = 25; // 25 × 80ms = 2000ms
      const poll = setInterval(() => {
        attempts++;
        const chatEl = document.querySelector('.chat-pane');
        if (chatEl || attempts >= MAX_ATTEMPTS) {
          clearInterval(poll);
          // Pequeño delay extra para que la animación de apertura termine
          setTimeout(() => {
            if (driverInstance) driverInstance.moveNext();
          }, 80);
        }
      }, 80);
      return; // No avanzar hasta que el chat esté montado (o timeout)
    }

    // Paso 15 (SFTP transfer) → 16 (VNC flotante):
    // Navegar al terminal para que se vea el estado de la sesión en el header
    if (opts.state.activeIndex === 15) {
      window.dispatchEvent(new CustomEvent('app:open-panel', { detail: 'terminal' }));
      if (onPageChangeCallback) onPageChangeCallback('terminal');
      setTimeout(() => {
        try {
          const sessionTab = document.querySelector('.h2-tab') as HTMLElement | null;
          if (sessionTab) sessionTab.click();
        } catch {}
      }, 80);
      setTimeout(() => { if (driverInstance) driverInstance.moveNext(); }, 250);
      return;
    }

    // Si no es un paso con validación o la validación pasa, permitir avanzar
    if (driverInstance) {
      driverInstance.moveNext();
    }
  },
  
  // Callbacks para gestión de estado y navegación
  onHighlighted: (element, step, opts) => {
    // Obtener atributos del elemento destacado
  const htmlElement = element as any;
  // Driver.js puede exponer el nodo en distintas propiedades; cubrir variantes
  const rawEl: HTMLElement | null = (htmlElement?.element || htmlElement?.node || htmlElement) ?? null;
  const domEl: HTMLElement | null = rawEl;
  // Detectar el botón de sidebar aunque el highlight envuelva un hijo
  const pageHost: HTMLElement | null = (domEl?.closest?.('[data-page]') as HTMLElement) || domEl;
  const pageAttr = pageHost?.getAttribute?.('data-page');
  const tourAttr = domEl?.getAttribute?.('data-tour');
  const tourClosestAttr = (domEl?.closest?.('[data-tour]') as HTMLElement | null)?.getAttribute?.('data-tour') || null;

    // 1) Accesibilidad: mover el foco real al elemento destacado
    if (domEl) {
      if (!domEl.hasAttribute('tabindex')) {
        domEl.setAttribute('tabindex', '-1');
      }
      try {
        // Usar un micro-delay para evitar conflictos con el layout del stage
        setTimeout(() => domEl.focus({ preventScroll: true }), 0);
      } catch {}
    }

    // ACTIVAR observer de terminal SOLO cuando se llega al paso 7 (índice 6 - "Conéctate ahora")
    if (opts.state.activeIndex === 6) {
      // Estamos en el paso de conexión, ahora SI observar si aparece la terminal
      try {
        if (tourObserver) tourObserver.disconnect();
        hasJumpedToTerminal = false;
        tourObserver = new MutationObserver(() => {
          // Evitar disparos múltiples por cambios dentro del terminal
          if (hasJumpedToTerminal) return;
          const isMounted = !!document.querySelector('.terminal-stack');
          if (!isMounted) return;
          hasJumpedToTerminal = true;
          if (tourObserver) { try { tourObserver.disconnect(); } catch {} tourObserver = null; }
          const idx = tourSteps.findIndex(s => (s as any).element === '.terminal-stack');
          if (driverInstance && driverInstance.isActive() && idx >= 0) {
            // Debounce para esperar a que el layout se estabilice
            jumpTimer = setTimeout(() => { try { driverInstance?.drive(idx); } catch {} }, 180);
          }
        });
        tourObserver.observe(document.body, { childList: true, subtree: true });
      } catch {}
    }

    // 2) Navegación automática cuando el paso corresponde a una página específica
    //    - Para elementos con data-tour del contenido de Connect, forzar navegación a 'connect'
    const tourKind = tourAttr || tourClosestAttr;
    if (onPageChangeCallback && tourKind && (tourKind === 'connect-form' || tourKind === 'quick-hosts-panel')) {
      // Pequeño delay para no interrumpir el highlight actual
      setTimeout(() => onPageChangeCallback('connect'), 50);
    }

    //    - Para el botón de Escritorio Remoto (VNC), navegar al terminal (el botón vive en H2)
    if (tourKind === 'btn-escritorio') {
      if (onPageChangeCallback) {
        setTimeout(() => onPageChangeCallback('terminal'), 50);
      }
    }

    //    - Si el elemento destacado es el terminal-stack, navegar a la página de terminal
    if (domEl?.classList?.contains('terminal-stack')) {
      if (onPageChangeCallback) {
        setTimeout(() => onPageChangeCallback('terminal'), 50);
      }
      // Dar foco al textarea de xterm
      setTimeout(() => {
        try {
          const ta = document.querySelector(
            '.terminal-pane .xterm textarea, .terminal-pane .xterm .xterm-helper-textarea'
          ) as HTMLTextAreaElement | null;
          if (ta) {
            ta.focus();
          } else {
            // Fallback: enfocar el contenedor del terminal (xterm se auto-enfocará si es posible)
            const pane = document.querySelector('.terminal-pane') as HTMLElement | null;
            pane?.focus?.();
          }
        } catch {}
      }, 200);
    }

    //    - Si el elemento destacado es el chat-pane, abrir el chat y navegar a terminal
    if (domEl?.classList?.contains('chat-pane')) {
      // Asegurar que estamos en la página de terminal
      if (onPageChangeCallback) {
        setTimeout(() => onPageChangeCallback('terminal'), 50);
      }
      // Forzar apertura del chat y scroll al elemento
      window.dispatchEvent(new CustomEvent('tour:open-chat'));
      // Dar foco al input del chat
      setTimeout(() => {
        try {
          const chatInput = document.querySelector(
            '.chat-pane textarea, .chat-pane input[type="text"], .chat-input-area textarea'
          ) as HTMLElement | null;
          chatInput?.focus?.();
          // Asegurar visibilidad
          domEl?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
        } catch {}
      }, 300);
    }

    //    - Si el elemento destacado es la página SFTP, navegar a SFTP
    if (domEl?.classList?.contains('sftp-page')) {
      if (onPageChangeCallback) {
        setTimeout(() => onPageChangeCallback('sftp'), 50);
      }
    }

    //    - Si el elemento destacado es un panel SFTP, navegar a SFTP
    if (domEl?.classList?.contains('sftp-panel') || domEl?.classList?.contains('sftp-icon-btn--primary')) {
      if (onPageChangeCallback) {
        setTimeout(() => onPageChangeCallback('sftp'), 50);
      }
    }


    //    - Para elementos de la barra lateral (data-page), seleccionar ese botón y cambiar de página
    if (pageAttr) {
      // Disparar el onClick real sobre el owner del atributo data-page
      try { setTimeout(() => pageHost?.click?.(), 25); } catch {}
      // Además, invocar el callback de navegación para asegurar el estado
      if (onPageChangeCallback) {
        setTimeout(() => onPageChangeCallback(pageAttr), 50);
      }
      // Foco específico: si el paso apunta a "Terminal", dar foco al textarea de xterm
      if (pageAttr === 'terminal') {
        // Esperar un instante a que el Terminal se monte/renderice
        setTimeout(() => {
          try {
            const ta = document.querySelector(
              '.terminal-pane .xterm textarea, .terminal-pane .xterm .xterm-helper-textarea'
            ) as HTMLTextAreaElement | null;
            if (ta) {
              ta.focus();
            } else {
              // Fallback: enfocar el contenedor del terminal (xterm se auto-enfocará si es posible)
              const pane = document.querySelector('.terminal-pane') as HTMLElement | null;
              pane?.focus?.();
            }
          } catch {}
        }, 200);
      }
    }
    // 3) En el paso de hosts rápidos: seleccionar el primer host y enfocar usuario
    if (tourKind === 'quick-hosts-panel') {
      setTimeout(() => {
        try {
          const firstPill = document.querySelector('.quick-hosts-scroller .quick-host-pill') as HTMLElement | null;
          firstPill?.click?.();
          const userInput = document.getElementById('field-user') as HTMLElement | null;
          userInput?.focus?.();
        } catch {}
      }, 100);
    }
  },
  
  onDestroyStarted: () => {
    if (driverInstance) {
      driverInstance.destroy();
      driverInstance = null;
    }
    if (tourObserver) { try { tourObserver.disconnect(); } catch {} tourObserver = null; }
    if (jumpTimer) { try { clearTimeout(jumpTimer); } catch {} jumpTimer = null; }
    if (chatOpenTimer) { try { clearTimeout(chatOpenTimer); } catch {} chatOpenTimer = null; }
    hasJumpedToTerminal = false;
  },
  
  onDestroyed: () => {
  },
});

/**
 * Hook personalizado para gestionar el tour
 */
export const useTour = (onPageChange?: (page: string) => void) => {
  // Guardar el callback de cambio de página
  if (onPageChange) {
    onPageChangeCallback = onPageChange;
  }
  
  /**
   * Inicia el tour desde el principio
   */
  const startTour = () => {
    if (driverInstance) {
      driverInstance.destroy();
    }
    
    // Limpiar observers previos
    if (tourObserver) { try { tourObserver.disconnect(); } catch {} tourObserver = null; }
    if (jumpTimer) { try { clearTimeout(jumpTimer); } catch {} jumpTimer = null; }
    hasJumpedToTerminal = false;
    
    const config = createDriverConfig();
    driverInstance = driver(config);
    
    // Iniciar siempre desde el paso 1
    driverInstance.drive(0);
  };

  /**
   * Continúa el tour desde un paso específico
   */
  const continueTour = (stepIndex: number) => {
    if (driverInstance) {
      driverInstance.destroy();
    }
    
    // Limpiar observers previos
    if (tourObserver) { try { tourObserver.disconnect(); } catch {} tourObserver = null; }
    if (jumpTimer) { try { clearTimeout(jumpTimer); } catch {} jumpTimer = null; }
    hasJumpedToTerminal = false;
    
    const config = createDriverConfig();
    driverInstance = driver(config);
    driverInstance.drive(stepIndex);
  };

  /**
   * Detiene el tour
   */
  const stopTour = () => {
    if (driverInstance) {
      driverInstance.destroy();
      driverInstance = null;
    }
    if (tourObserver) { try { tourObserver.disconnect(); } catch {} tourObserver = null; }
    if (jumpTimer) { try { clearTimeout(jumpTimer); } catch {} jumpTimer = null; }
    hasJumpedToTerminal = false;
  };

  /**
   * Verifica si el tour está activo
   */
  const isTourActive = () => {
    return driverInstance !== null && driverInstance.isActive();
  };

  return {
    startTour,
    continueTour,
    stopTour,
    isTourActive,
  };
};
