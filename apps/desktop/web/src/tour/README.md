# Sistema de Tour/Tutorial

Este módulo implementa un sistema de tour interactivo para la aplicación usando [driver.js](https://driverjs.com/).

## Estructura

```
src/tour/
├── index.ts          # Punto de entrada, exports públicos
├── useTour.ts        # Hook React para gestionar el tour
├── tourSteps.ts      # Configuración de pasos del tour
├── tourStyles.css    # Estilos personalizados para el popover
└── README.md         # Esta documentación
```

## Uso

### Iniciar el tour desde cualquier componente

```tsx
import { useTour } from '@/tour';

function MyComponent() {
  const { startTour, stopTour, isTourActive } = useTour();
  
  return (
    <button onClick={startTour}>
      Iniciar Tutorial
    </button>
  );
}
```

### Métodos disponibles

- **`startTour()`**: Inicia el tour desde el principio
- **`continueTour(stepIndex)`**: Continúa desde un paso específico
- **`stopTour()`**: Detiene el tour manualmente
- **`isTourActive()`**: Verifica si el tour está activo

## Configuración de pasos

Los pasos del tour se definen en `tourSteps.ts`. Cada paso puede:

1. **Destacar un elemento**: Usa `element` con un selector CSS
2. **Mostrar información general**: Omite `element` para un paso flotante

### Ejemplo de paso con elemento

```typescript
{
  element: '.my-element',
  popover: {
    title: 'Título del paso',
    description: 'Descripción detallada...',
    side: 'right',  // 'top' | 'right' | 'bottom' | 'left'
    align: 'start', // 'start' | 'center' | 'end'
  },
}
```

### Ejemplo de paso flotante

```typescript
{
  popover: {
    title: 'Información general',
    description: 'Sin elemento destacado...',
    side: 'left',
    align: 'start',
  },
}
```

## Personalización de estilos

Los estilos se definen en `tourStyles.css` y respetan las variables CSS del tema:

- `--background-primary/secondary/tertiary`
- `--text-primary/secondary/tertiary`
- `--accent-primary/hover`
- `--font-sans/mono`

### Estructura HTML del popover

```
.driver-popover
  ├── .driver-popover-title
  ├── .driver-popover-description
  ├── .driver-popover-footer
  │   ├── .driver-popover-progress-text
  │   ├── .driver-popover-prev-btn
  │   └── .driver-popover-next-btn
  └── .driver-popover-close-btn
```

## Características

✅ **16 pasos** cubriendo todas las funcionalidades  
✅ **Estilos adaptados** al sistema de temas de la app  
✅ **Responsive** para móviles y tablets  
✅ **Animaciones suaves** con CSS transitions  
✅ **Progreso visual** mostrando "X de Y"  
✅ **Navegación completa** (siguiente, anterior, cerrar)  
✅ **Overlay oscuro** con blur para enfocar atención  
✅ **HTML en descripciones** para formateo avanzado

## Integración con páginas

Para que los selectores funcionen, asegúrate de agregar atributos `data-page` en los botones de navegación:

```tsx
<button data-page="connect" onClick={() => setPage('connect')}>
  Conectar
</button>
```

## Agregar nuevos pasos

1. Abre `tourSteps.ts`
2. Agrega un nuevo objeto al array `tourSteps`
3. Define el selector y el contenido del popover
4. Los cambios se reflejan automáticamente

## Notas técnicas

- **Singleton**: Solo una instancia del tour puede estar activa
- **Cleanup**: El tour se destruye automáticamente al finalizar
- **Smooth scroll**: Desplazamiento suave a elementos destacados
- **Escape key**: Presionar ESC cierra el tour

## Ejemplo completo

```tsx
import { useTour } from '@/tour';

export function LandingPage() {
  const { startTour } = useTour();
  
  return (
    <div className="landing">
      <h1>Bienvenido</h1>
      <button 
        className="cta-button"
        onClick={startTour}
      >
        Iniciar Tutorial
      </button>
    </div>
  );
}
```

## Referencias

- [driver.js Documentation](https://driverjs.com/)
- [driver.js GitHub](https://github.com/kamranahmedse/driver.js)
