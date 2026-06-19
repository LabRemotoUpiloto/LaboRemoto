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

## Pasos del Tour

El tour cubre **24 pasos** organizados en el siguiente orden:

| # | Sección | Elemento | Descripción |
|---|---|---|---|
| 0 | Barra de Navegación | `[data-tour="sidebar-header"]` | Contracción/expansión del sidebar |
| 1 | Página de Inicio | `[data-page="landing"]` | Accesos rápidos y botón de tutorial |
| 2 | **Prácticas de Laboratorio** | `[data-page="practices"]` | Eve3, Linux, Circuitos, validación automática |
| 3 | Conectar a Servidor | `[data-page="connect"]` | Entrada al formulario SSH |
| 4 | Formulario de Conexión | `.connect-form` | Campos host/puerto/usuario/contraseña |
| 5 | Hosts Rápidos | `[data-tour="quick-hosts-panel"]` | Servidores preconfigurados |
| 6 | Conéctate ahora ⚠️ | `.connect-form` | **Paso validado**: requiere sesión SSH activa |
| 7 | Terminal | `.terminal-stack` | Atajos de teclado, PTY interactivo |
| 8 | Chat de IA ⚠️ | `.chat-pane` | **Paso validado**: requiere mensaje del asistente |
| 9 | **Agente AI — Ejecutar** | `.chat-pane` | Loop tool_use: ejecuta comandos SSH reales |
| 10 | **Agente AI — Plan** | `.chat-pane` | Inspecciona el servidor y genera plan (read-only) |
| 11 | Hosts Guardados | `[data-page="hosts"]` | Cifrado ChaCha20Poly1305 |
| 12 | Explorador SFTP | `[data-page="sftp"]` | Intro al explorador de archivos |
| 13 | Panel Local (SFTP) | `[data-tour="sftp-panel-local"]` | Archivos de la PC local |
| 14 | Panel Remoto (SFTP) | `[data-tour="sftp-panel-remote"]` | Archivos del servidor |
| 15 | Transferir Archivos | `.sftp-icon-btn--primary` | Subir ↑ / Descargar ↓ |
| 16 | **Escritorio Remoto VNC** | `[data-page="vnc"]` | Xvfb + LXDE + noVNC via SSH |
| 17 | **GPIO Raspberry Pi** | `[data-page="raspberry"]` | Control de pines BCM en tiempo real |
| 18 | **Arduino — Domótica** | `[data-page="arduino"]` | Bridge HTTP→Serial sobre SSH |
| 19 | Historial de Logs | `[data-page="logs"]` | Sesiones guardadas y exportación PDF |
| 20 | Snippets | `[data-page="snippets"]` | Comandos reutilizables |
| 21 | Temas | `[data-page="themes"]` | Personalización visual |
| 22 | Próximos Pasos | *(flotante)* | Recomendaciones finales |
| 23 | ¡Tour Completado! | *(flotante)* | Cierre del tour |

> **Nota:** Los pasos marcados con ⚠️ tienen validación: el usuario no puede avanzar sin completar la acción requerida.

## Validaciones activas en `useTour.ts`

```typescript
// Paso índice 4 ("Formulario") → 5 ("Hosts Rápidos"):
// Verifica que [data-tour="quick-hosts-panel"] esté en DOM; si no, navega a connect y espera.

// Paso índice 6 ("Conéctate ahora") — requiere sesión SSH activa
if (opts.state.activeIndex === 6) {
  const hasActiveSession = document.querySelector('.tab.session-tab.active') !== null;
  if (!hasActiveSession) { /* bloquear avance */ }
}

// Paso índice 7 ("Terminal") → 8 ("Chat de IA"):
// Despacha tour:open-chat y espera a que .chat-pane aparezca en DOM antes de avanzar.

// Paso índice 8 ("Chat de IA") — requiere respuesta del asistente
if (opts.state.activeIndex === 8) {
  const chatMessages = document.querySelectorAll('.chat-messages .message--assistant');
  if (chatMessages.length === 0) { /* bloquear avance */ }
}
```

> ⚠️ Si cambias el orden de pasos en `tourSteps.ts`, actualiza estos índices en `useTour.ts`.

## Navegación automática de páginas

El hook `useTour.ts` implementa navegación automática basada en el elemento destacado:

| Condición | Página navegada |
|---|---|
| `data-tour="connect-form"` o `data-tour="quick-hosts-panel"` | `connect` |
| Clase `.terminal-stack` | `terminal` |
| Clase `.chat-pane` | `terminal` |
| Clase `.sftp-page`, `.sftp-panel` o `.sftp-icon-btn--primary` | `sftp` |
| `data-page="*"` | La página correspondiente (dispara click + callback) |

El MutationObserver (activo solo en el paso 5) detecta cuando el terminal se monta tras la conexión SSH y salta automáticamente al paso del terminal.

## Configuración de pasos

Los pasos del tour se definen en `tourSteps.ts`. Cada paso puede:

1. **Destacar un elemento**: Usa `element` con un selector CSS
2. **Mostrar información general**: Omite `element` para un paso flotante

### Ejemplo de paso con elemento

```typescript
{
  element: '[data-page="practices"]',
  popover: {
    title: '🧪 Prácticas de Laboratorio',
    description: 'Accede a tus prácticas configuradas...',
    side: 'right',   // 'top' | 'right' | 'bottom' | 'left'
    align: 'start',  // 'start' | 'center' | 'end'
  },
}
```

### Ejemplo de paso flotante (sin elemento)

```typescript
{
  popover: {
    title: '¡Tour Completado!',
    description: 'Gracias por completar el tour...',
    side: 'left',
    align: 'start',
  },
}
```

## Características

✅ **24 pasos** cubriendo todas las funcionalidades (incluye Prácticas, Agente AI, VNC, GPIO, Arduino)  
✅ **Estilos adaptados** al sistema de temas de la app  
✅ **Responsive** para móviles y tablets  
✅ **Animaciones suaves** con CSS transitions  
✅ **Progreso visual** mostrando "X de Y"  
✅ **Navegación completa** (siguiente, anterior, cerrar)  
✅ **Overlay oscuro** con blur para enfocar atención  
✅ **HTML en descripciones** para formateo avanzado  
✅ **Validación interactiva** en pasos clave (conexión SSH, prueba de chat)  
✅ **Navegación automática** entre páginas durante el tour  
✅ **MutationObserver** para detectar montaje del terminal tras conexión  

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

## Integración con páginas

Para que los selectores funcionen, asegúrate de agregar atributos `data-page` en los botones de navegación del sidebar:

```tsx
<button data-page="practices" onClick={() => setPage('practices')}>
  Prácticas
</button>
<button data-page="vnc" onClick={() => setPage('vnc')}>
  Escritorio Remoto
</button>
```

## Agregar nuevos pasos

1. Abre `tourSteps.ts`
2. Agrega un nuevo objeto al array `tourSteps`
3. Define el selector y el contenido del popover
4. Si el paso requiere validación, agrega la lógica en `useTour.ts` (función `onNextClick`)
5. Actualiza esta tabla de la sección **Pasos del Tour**

## Notas técnicas

- **Singleton**: Solo una instancia del tour puede estar activa
- **Cleanup**: El tour se destruye automáticamente al finalizar
- **MutationObserver**: Se activa únicamente en el paso 5 (conexión) para detectar el montaje del terminal
- **Smooth scroll**: Desplazamiento suave a elementos destacados
- **Escape key**: Desactivado (`allowClose: false`) — el usuario debe usar el botón X

## Referencias

- [driver.js Documentation](https://driverjs.com/)
- [driver.js GitHub](https://github.com/kamranahmedse/driver.js)
