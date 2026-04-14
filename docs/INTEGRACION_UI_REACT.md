# Integración UI React - Sistema de Prácticas con Moodle

## 📋 Pasos para Integrar el Componente PracticeProgress

### 1. Modificar `TerminalView.tsx`

Agregar el hook de historial de comandos y el componente de progreso:

```tsx
// En: apps/desktop/web/src/components/terminal/TerminalView.tsx

import React, { useEffect, useState, useRef } from 'react';
import PracticeProgress from '../practice/PracticeProgress';
import { useCommandHistory } from '../../hooks/useCommandHistory';
import './TerminalView.css';
// ... otros imports

interface TerminalViewProps {
  sessionId: string;
  activeView?: 'terminal' | 'escritorio';
  isCameraOpen?: boolean;
  isChatOpen?: boolean;
  onCloseChat?: () => void;
  isTabActive?: boolean;
  practiceId?: string | null;
  student?: { id: number; username: string; fullname: string; email: string } | null;
  assignmentId?: number; // ← AGREGAR
}

const TerminalView: React.FC<TerminalViewProps> = ({
  sessionId,
  activeView = 'terminal',
  isCameraOpen = false,
  isChatOpen = false,
  onCloseChat = () => {},
  isTabActive = true,
  practiceId = null,
  student = null,
  assignmentId, // ← AGREGAR
}) => {
  // Hook para capturar comandos
  const { commandHistory, processTerminalData, clearHistory } = useCommandHistory();

  // Limpiar historial cuando cambia la sesión
  useEffect(() => {
    clearHistory();
  }, [sessionId, clearHistory]);

  // ... resto del código existente

  return (
    <div className="terminal-view">
      {/* ... código existente de camera y terminal ... */}

      {/* Panel de Progreso de Práctica */}
      {practiceId && assignmentId && student && (
        <div className="practice-progress-sidebar">
          <PracticeProgress
            practiceId={practiceId}
            assignmentId={assignmentId}
            student={student}
            commandHistory={commandHistory}
            onSubmitSuccess={() => {
              console.log('Práctica entregada exitosamente');
              // Opcional: mostrar notificación, cerrar sesión, etc.
            }}
          />
        </div>
      )}
    </div>
  );
};

export default TerminalView;
```

### 2. Modificar `useTerminal.ts`

Agregar callback para procesar datos y extraer comandos:

```tsx
// En: apps/desktop/web/src/components/terminal/useTerminal.ts

export function useTerminal(
  sessionId: string | null, 
  containerRef: RefObject<HTMLDivElement>, 
  theme: string,
  onTerminalData?: (data: string) => void // ← AGREGAR parámetro
) {
  // ... código existente ...

  // En el listener de ssh_out, agregar callback:
  listen<string>(`ssh_out_${safe}`, (event) => {
    if (event.payload) {
      bytesReceived += event.payload.length;
      term.write(event.payload, () => {
        setTimeout(checkAndHideLoading, 100);
        setTimeout(() => captureSnapshot(), 150);
      });
      
      // ← AGREGAR: Notificar datos recibidos
      if (onTerminalData) {
        onTerminalData(event.payload);
      }
      
      // ... resto del código
    }
  }).then(un => { unlistenRef.current = un }).catch(() => {});

  // ... resto del código
}
```

### 3. Conectar el Hook en `TerminalPane.tsx`

```tsx
// En: apps/desktop/web/src/components/terminal/TerminalPane.tsx

import { useTerminal } from './useTerminal';

interface TerminalPaneProps {
  sessionId: string;
  onTerminalData?: (data: string) => void; // ← AGREGAR
}

const TerminalPane: React.FC<TerminalPaneProps> = ({ 
  sessionId,
  onTerminalData // ← AGREGAR
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [theme] = useState('dark');

  const { isLoading, isFadingOut, waitingForPrompt } = useTerminal(
    sessionId, 
    containerRef, 
    theme,
    onTerminalData // ← PASAR callback
  );

  // ... resto del código
};
```

### 4. Actualizar `TerminalView.tsx` para conectar todo

```tsx
// En TerminalView.tsx (versión completa)

const TerminalView: React.FC<TerminalViewProps> = ({
  sessionId,
  practiceId,
  student,
  assignmentId,
  // ... otros props
}) => {
  const { commandHistory, processTerminalData } = useCommandHistory();

  return (
    <div className="terminal-view">
      <div className="terminal-stack">
        {/* Terminal con callback */}
        <TerminalPane 
          sessionId={sessionId}
          onTerminalData={processTerminalData} // ← Conectar
        />

        {/* Panel de progreso */}
        {practiceId && (
          <PracticeProgress
            practiceId={practiceId}
            assignmentId={assignmentId}
            student={student}
            commandHistory={commandHistory}
          />
        )}
      </div>
    </div>
  );
};
```

### 5. Agregar Estilos CSS

```css
/* En: apps/desktop/web/src/components/terminal/TerminalView.css */

.terminal-view {
  display: flex;
  width: 100%;
  height: 100%;
  position: relative;
}

.terminal-stack {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.practice-progress-sidebar {
  width: 350px;
  max-width: 400px;
  min-width: 300px;
  background: rgba(20, 20, 20, 0.98);
  border-left: 1px solid rgba(255, 255, 255, 0.1);
  overflow-y: auto;
  overflow-x: hidden;
}

/* Responsive: ocultar en pantallas pequeñas */
@media (max-width: 1200px) {
  .practice-progress-sidebar {
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    z-index: 100;
    box-shadow: -4px 0 12px rgba(0, 0, 0, 0.3);
  }
}
```

---

## 🔧 Configuración de Assignment IDs

### Opción A: Desde `.env.practicas`

Modificar `practicas.rs` para incluir el assignment_id:

```rust
// En: src/cmd/practicas.rs

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Practice {
    pub id: String,
    pub name: String,
    pub description: String,
    pub difficulty: String,
    pub connection: PracticeConnection,
    pub terminal: TerminalConfig,
    pub panels: PanelConfig,
    pub moodle_assignment_id: Option<u32>, // ← AGREGAR
}

// En build_categories():
eve3_practices.push(Practice {
    id: "eve3-p1".into(),
    name: p1_name,
    // ... otros campos
    moodle_assignment_id: vars.get("PRACTICE_EVE3_P1_MOODLE_ASSIGNMENT_ID")
        .and_then(|v| v.parse().ok()), // ← AGREGAR
});
```

### Opción B: Desde el Frontend

Crear un mapeo en React:

```typescript
// En: apps/desktop/web/src/config/practiceAssignments.ts

export const PRACTICE_ASSIGNMENTS: Record<string, number> = {
  'eve3-p1': 123, // ID de la tarea en Moodle
  'eve3-p2': 124,
  // ... más prácticas
};

// Uso:
const assignmentId = PRACTICE_ASSIGNMENTS[practiceId];
```

---

## 🧪 Testing

### 1. Verificar Captura de Comandos

```tsx
// En TerminalView.tsx (temporal para debug)
useEffect(() => {
  console.log('Historial de comandos:', commandHistory);
}, [commandHistory]);
```

### 2. Simular Comandos (sin SSH)

```tsx
// Para testing sin conexión SSH
const mockCommands = ['ls', 'python flechas.py'];

<PracticeProgress
  practiceId="eve3-p1"
  assignmentId={123}
  student={{ id: 1, username: 'test', fullname: 'Test User', email: 'test@test.com' }}
  commandHistory={mockCommands}
/>
```

### 3. Verificar Validación

```tsx
// En DevTools Console
invoke('validate_practice_progress', {
  practiceId: 'eve3-p1',
  commandHistory: ['ls', 'python flechas.py']
}).then(console.log);
```

---

## 🎨 Personalización UI

### Cambiar Posición del Panel

```css
/* Panel flotante en lugar de sidebar */
.practice-progress-sidebar {
  position: fixed;
  bottom: 20px;
  right: 20px;
  width: 320px;
  max-height: 500px;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}
```

### Panel Colapsable

```tsx
const [isPanelOpen, setIsPanelOpen] = useState(true);

<div className={`practice-progress-sidebar ${isPanelOpen ? 'open' : 'collapsed'}`}>
  <button onClick={() => setIsPanelOpen(!isPanelOpen)}>
    {isPanelOpen ? '→' : '←'}
  </button>
  {isPanelOpen && <PracticeProgress {...props} />}
</div>
```

---

## 📊 Eventos y Callbacks

### Escuchar Eventos de Progreso

```tsx
<PracticeProgress
  practiceId={practiceId}
  assignmentId={assignmentId}
  student={student}
  commandHistory={commandHistory}
  onSubmitSuccess={() => {
    // Mostrar notificación
    alert('¡Práctica entregada!');
    
    // Cerrar sesión automáticamente
    invoke('ssh_disconnect', { id: sessionId });
    
    // Navegar a otra vista
    navigate('/practicas');
  }}
/>
```

### Notificaciones Toast

```tsx
import { toast } from 'react-hot-toast';

<PracticeProgress
  onSubmitSuccess={() => {
    toast.success('¡Práctica entregada exitosamente!', {
      duration: 4000,
      icon: '🎉',
    });
  }}
/>
```

---

## 🔍 Debugging

### Ver Datos del Terminal

```tsx
const { commandHistory, processTerminalData } = useCommandHistory();

// Log cada dato recibido
const handleTerminalData = (data: string) => {
  console.log('Terminal data:', data);
  processTerminalData(data);
};

<TerminalPane onTerminalData={handleTerminalData} />
```

### Ver Estado de Validación

```tsx
// En PracticeProgress.tsx, agregar:
useEffect(() => {
  console.log('Validation:', validation);
}, [validation]);
```

---

## ⚠️ Consideraciones

1. **Performance**: El hook `useCommandHistory` procesa cada byte recibido. Para sesiones muy largas, considera limitar el tamaño del historial.

2. **Precisión**: La extracción de comandos usa heurísticas simples. Para mayor precisión, considera usar el historial de bash (`history` command).

3. **Seguridad**: Nunca envíes contraseñas o datos sensibles en el `commandHistory`.

4. **UX**: Muestra feedback visual claro cuando el estudiante completa objetivos.

---

## 📚 Recursos

- Componente: `apps/desktop/web/src/components/practice/PracticeProgress.tsx`
- Hook: `apps/desktop/web/src/hooks/useCommandHistory.ts`
- Estilos: `apps/desktop/web/src/components/practice/PracticeProgress.css`
- Validador: `apps/desktop/src-tauri/src/cmd/practice_validator.rs`
