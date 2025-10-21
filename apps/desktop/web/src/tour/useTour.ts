import { driver, type Driver, type Config } from 'driver.js';
import { tourSteps } from './tourSteps';
import 'driver.js/dist/driver.css';
import './tourStyles.css';

let driverInstance: Driver | null = null;

/**
 * Configuración del driver.js con estilos personalizados
 */
const driverConfig: Config = {
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
  
  // Overlay
  overlayColor: 'rgba(0, 0, 0, 0.7)',
  
  // Callbacks para gestión de estado
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
};

/**
 * Hook personalizado para gestionar el tour
 */
export const useTour = () => {
  /**
   * Inicia el tour desde el principio
   */
  const startTour = () => {
    if (driverInstance) {
      driverInstance.destroy();
    }
    
    driverInstance = driver(driverConfig);
    driverInstance.drive();
  };

  /**
   * Continúa el tour desde un paso específico
   */
  const continueTour = (stepIndex: number) => {
    if (driverInstance) {
      driverInstance.destroy();
    }
    
    const config = { ...driverConfig };
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
