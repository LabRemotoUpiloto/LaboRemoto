import { driver, type Driver, type Config } from 'driver.js';
import { tourSteps } from './tourSteps';
import 'driver.js/dist/driver.css';
import './tourStyles.css';

let driverInstance: Driver | null = null;
let onPageChangeCallback: ((page: string) => void) | null = null;

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

    // 2) Navegación automática cuando el paso corresponde a una página específica
    //    - Para elementos con data-tour del contenido de Connect, forzar navegación a 'connect'
    const tourKind = tourAttr || tourClosestAttr;
    if (onPageChangeCallback && tourKind && (tourKind === 'connect-form' || tourKind === 'quick-hosts-panel')) {
      // Pequeño delay para no interrumpir el highlight actual
      setTimeout(() => onPageChangeCallback('connect'), 50);
    }

    //    - Para elementos de la barra lateral (data-page), seleccionar ese botón y cambiar de página
    if (pageAttr) {
      // Disparar el onClick real sobre el owner del atributo data-page
      try { setTimeout(() => pageHost?.click?.(), 25); } catch {}
      // Además, invocar el callback de navegación para asegurar el estado
      if (onPageChangeCallback) {
        setTimeout(() => onPageChangeCallback(pageAttr), 50);
      }
    }
  },
  
  onDestroyStarted: () => {
    if (driverInstance) {
      driverInstance.destroy();
      driverInstance = null;
    }
  },
  
  onDestroyed: () => {
    // Limpiar cualquier estado si es necesario
    console.log('Tour finalizado');
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
    
    const config = createDriverConfig();
    driverInstance = driver(config);
    driverInstance.drive();
  };

  /**
   * Continúa el tour desde un paso específico
   */
  const continueTour = (stepIndex: number) => {
    if (driverInstance) {
      driverInstance.destroy();
    }
    
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
