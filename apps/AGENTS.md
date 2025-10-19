# Directrices para Agentes de IA

> **⚠️ LECTURA OBLIGATORIA**: Este documento DEBE ser revisado antes de realizar cualquier modificación en el código.

## 🎯 Principios Fundamentales

### 1. **REUTILIZACIÓN ANTES QUE CREACIÓN**

Antes de crear cualquier componente, función o utilidad nueva, **SIEMPRE** debes:

1. **Buscar componentes existentes** que puedan ser reutilizados o extendidos
2. **Revisar archivos de utilidades** para evitar duplicar lógica
3. **Consultar el sistema de diseño** para usar componentes base
4. **Verificar patrones establecidos** en el código existente

#### ❌ NO hacer:
```typescript
// Crear un nuevo botón desde cero
function MyNewButton() {
  return <button style={{...}}>Click</button>
}
```

#### ✅ SÍ hacer:
```typescript
// Primero buscar: ¿Existe un componente Button reutilizable?
// Si existe, úsalo. Si no, créalo como componente base y úsalo.
import { Button } from '@/components/ui/Button';

function MyFeature() {
  return <Button variant="primary">Click</Button>
}
```

---

## 🎨 Sistema de Temas (OBLIGATORIO)

### Regla de Oro de Temas
**TODOS los componentes frontend DEBEN usar variables CSS de tema en lugar de colores hardcodeados.**

#### Variables de Tema Disponibles (`globals.css`)

```css
/* Fondos y Superficies */
--background-primary      /* Fondo principal */
--background-secondary    /* Fondo secundario */
--background-tertiary     /* Fondo terciario */
--surface-0               /* Nivel base (alias de primary) */
--surface-1               /* Elevado 1 (alias de secondary) */
--surface-2               /* Elevado 2 (alias de tertiary) */
--surface-3               /* 🆕 Elevado 3 (tooltips, dropdowns) */
--surface-overlay         /* 🆕 Fondos de modales */

/* Textos (Jerarquía Expandida) */
--text-primary           /* Texto principal, títulos */
--text-secondary         /* Subtítulos, labels */
--text-tertiary          /* 🆕 Texto de apoyo, timestamps */
--text-muted             /* 🆕 Placeholders (mejorado) */
--text-disabled          /* 🆕 Elementos deshabilitados */
--text-inverse           /* 🆕 Texto sobre fondos claros/acentos */

/* Acentos (Sistema Expandido) */
--accent-primary         /* Color de marca principal */
--accent-primary-hover   /* Estado hover */
--accent-primary-light   /* 🆕 Versión suave */
--accent-primary-dark    /* 🆕 Versión intensa */
--accent-primary-subtle  /* 🆕 Fondos sutiles con acento */
--accent-secondary       /* 🆕 Azul complementario */
--accent-tertiary        /* 🆕 Morado de apoyo */
--accent-warm            /* 🆕 Acento cálido/naranja */

/* Bordes */
--border-color           /* Borde principal */
--border-subtle          /* Borde sutil */
--border-strong          /* Borde fuerte */

/* Estados (Con Variantes) */
--success                /* Verde éxito */
--success-bg             /* 🆕 Fondo de éxito */
--success-border         /* 🆕 Borde de éxito */
--success-text           /* 🆕 Texto de éxito */

--warning                /* Amarillo advertencia */
--warning-bg             /* 🆕 Fondo de advertencia */
--warning-border         /* 🆕 Borde de advertencia */
--warning-text           /* 🆕 Texto de advertencia */

--danger                 /* Rojo peligro */
--danger-bg              /* 🆕 Fondo de peligro */
--danger-border          /* 🆕 Borde de peligro */
--danger-text            /* 🆕 Texto de peligro */

--info                   /* Cyan información */
--info-bg                /* 🆕 Fondo de información */
--info-border            /* 🆕 Borde de información */
--info-text              /* 🆕 Texto de información */

/* Interacción */
--interactive-bg         /* Fondo interactivo base */
--interactive-hover      /* Fondo hover */
--interactive-active     /* Fondo activo/presionado */
--interactive-selected   /* Fondo seleccionado */

/* Terminal */
--terminal-foreground    /* Color de texto del terminal */
--terminal-font-family   /* Fuente monospace */
--terminal-font-size     /* Tamaño de fuente */
```

> **📘 NOTA:** Para una guía completa de uso de colores por componente, consultar `COLOR_GUIDE.md` en la raíz del proyecto.

#### ❌ NUNCA hacer:
```css
.my-button {
  background: #10B981;      /* ❌ Color hardcodeado */
  color: #E5E7EB;          /* ❌ No usar colores directos */
  border: 1px solid #333;  /* ❌ Evitar valores fijos */
}
```

#### ✅ SIEMPRE hacer:
```css
.my-button {
  background: var(--accent-primary);        /* ✅ Variable de tema */
  color: var(--text-primary);              /* ✅ Adaptable al tema */
  border: 1px solid var(--border-color);   /* ✅ Consistente */
}

.my-button:hover {
  background: var(--accent-primary-hover); /* ✅ Estado hover con variable */
}
```

---

## 📁 Estructura de Archivos Frontend

### Ubicación de Componentes

```
apps/desktop/web/src/
├── components/           # Componentes de la app
│   ├── ui/              # Componentes UI reutilizables (REVISAR PRIMERO)
│   ├── chat/            # Componentes específicos del chat
│   ├── chatModes/       # Handlers de modos de chat
│   └── [Feature]/       # Componentes por feature
├── styles/              # Estilos globales
│   └── globals.css      # Variables de tema (FUENTE DE VERDAD)
├── hooks/               # Hooks personalizados reutilizables
├── lib/                 # Utilidades y helpers
└── api/                 # Funciones de API Tauri
```

### Checklist Antes de Crear un Componente

- [ ] ¿Ya existe un componente similar en `components/ui/`?
- [ ] ¿Puedo extender un componente existente con props?
- [ ] ¿Este componente será reutilizable? → Crear en `components/ui/`
- [ ] ¿Es específico de una feature? → Crear en carpeta de feature
- [ ] ¿Usa variables CSS de tema en TODOS los estilos?
- [ ] ¿Tiene estados hover/active/disabled con variables de tema?
- [ ] ¿Es responsive y accesible (aria-labels, roles)?

---

## 🔧 Patrones Establecidos

### 1. Componentes de Botones

Antes de crear un botón personalizado, revisar:
- `components/ui/` - ¿Existe un componente Button base?
- Patrones existentes en `ChatPane.tsx` header
- Estilos de botones en `ChatPane.css`

**Estructura esperada de un botón:**
```tsx
interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
}
```

### 2. Bloques de Código

**Componente establecido**: `components/chat/CodeBlock.tsx`

Si necesitas mostrar código, **USAR** este componente. Ya incluye:
- Botones de copiar y ejecutar
- Syntax highlighting visual
- Tema integrado
- Validaciones de seguridad

### 3. Modales y Diálogos

**Componente establecido**: `components/ConfirmModal.tsx`

Para confirmaciones, **EXTENDER** este componente en lugar de crear nuevos modales.

### 4. Scroll y Navegación

Revisar `ChatPane.tsx` para patrones de:
- Auto-scroll inteligente
- Botón "scroll to bottom"
- Detección de posición del usuario

---

## 🎨 Estilos y CSS

### Principios de Estilo

1. **Mobile-first**: Estilos base para móvil, media queries para escritorio
2. **Variables CSS**: SIEMPRE usar variables de tema
3. **Selectores semánticos**: Usar clases descriptivas, evitar IDs
4. **Prefijos consistentes**: 
   - `.chat-*` para componentes de chat
   - `.code-*` para bloques de código
   - `.terminal-*` para terminal
   - `.modal-*` para modales

### Estructura de un Archivo CSS

```css
/* 1. Contenedor principal */
.component-wrapper {
  /* Layout */
  display: flex;
  position: relative;
  
  /* Espaciado */
  padding: 12px;
  margin: 8px 0;
  
  /* Visual */
  background: var(--background-secondary);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  
  /* Transiciones */
  transition: all 0.2s ease;
}

/* 2. Estados */
.component-wrapper:hover {
  border-color: var(--border-strong);
}

.component-wrapper.active {
  background: var(--interactive-active);
}

/* 3. Elementos hijos */
.component-header {
  /* ... */
}

.component-content {
  /* ... */
}

/* 4. Responsive */
@media (max-width: 640px) {
  .component-wrapper {
    padding: 8px;
  }
}
```

---

## 🔍 Proceso de Revisión Pre-Implementación

### Antes de Crear Cualquier Componente Frontend:

1. **Búsqueda de Reutilización** (5 minutos)
   ```bash
   # Buscar componentes similares
   grep -r "Button" apps/desktop/web/src/components/
   grep -r "Modal" apps/desktop/web/src/components/
   grep -r "className.*scroll" apps/desktop/web/src/
   ```

2. **Revisar Sistema de Temas** (2 minutos)
   - Abrir `apps/desktop/web/src/styles/globals.css`
   - Identificar variables CSS necesarias
   - Verificar que existan las variables de color/espaciado

3. **Revisar Patrones Existentes** (3 minutos)
   - Ver componentes similares en la misma carpeta
   - Copiar estructura de archivos CSS
   - Mantener convenciones de nombres

4. **Planificar Reutilización** (2 minutos)
   - ¿Este componente será usado en múltiples lugares? → `components/ui/`
   - ¿Es específico de una feature? → Carpeta de feature
   - ¿Extiende un componente existente? → Usar composición

---

## 📋 Checklist Completo de Implementación

### Antes de Empezar
- [ ] Leí este documento completamente
- [ ] Busqué componentes reutilizables
- [ ] Revisé el sistema de temas en `globals.css`
- [ ] Identifiqué patrones existentes similares

### Durante la Implementación
- [ ] Uso variables CSS de tema (NO colores hardcodeados)
- [ ] Componente es responsive (mobile-first)
- [ ] Incluí estados hover/active/disabled
- [ ] Agregué aria-labels y roles de accesibilidad
- [ ] Seguí convenciones de nombres establecidas
- [ ] CSS está organizado (contenedor → estados → hijos → responsive)

### Después de Implementar
- [ ] Probé en diferentes tamaños de pantalla
- [ ] Verifiqué que funciona con el tema oscuro
- [ ] Documenté props/interfaces si es reutilizable
- [ ] Actualicé este archivo si creé un nuevo patrón establecido

---

## 🚫 Anti-Patrones (Evitar)

### ❌ Duplicación de Código
```tsx
// ❌ Crear un nuevo componente de botón cuando ya existe uno
function MyFeatureButton() {
  return <button className="custom-btn">...</button>
}
```

### ❌ Colores Hardcodeados
```css
/* ❌ NO usar colores directos */
.my-element {
  color: #10B981;
  background: #0B1220;
}
```

### ❌ Estilos Inline sin Variables
```tsx
// ❌ Estilos inline con valores fijos
<div style={{ color: '#E5E7EB', padding: '12px' }}>
```

### ❌ Componentes No Reutilizables
```tsx
// ❌ Componente muy específico que debería ser genérico
function SpecificChatButtonWithHardcodedText() {
  return <button>Enviar Mensaje de Chat</button>
}
```

---

## ✅ Patrones Recomendados

### ✅ Composición de Componentes
```tsx
// ✅ Componente base reutilizable
function Button({ variant, children, ...props }) {
  return (
    <button className={`btn btn-${variant}`} {...props}>
      {children}
    </button>
  )
}

// ✅ Usar en features específicas
function ChatSendButton() {
  return <Button variant="primary">Enviar</Button>
}
```

### ✅ Uso Correcto de Variables de Tema
```css
/* ✅ Todas las propiedades usan variables */
.button {
  background: var(--accent-primary);
  color: var(--text-primary);
  border: 1px solid var(--border-subtle);
  padding: var(--spacing-sm, 8px) var(--spacing-md, 12px);
}

.button:hover {
  background: var(--accent-primary-hover);
  border-color: var(--border-strong);
}
```

### ✅ Componentes Reutilizables con Props
```tsx
// ✅ Flexible y reutilizable
interface IconButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
}

function IconButton({ icon, label, onClick, variant = 'primary', disabled }: IconButtonProps) {
  return (
    <button 
      className={`icon-btn icon-btn-${variant}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
    >
      {icon}
      <span className="icon-btn-label">{label}</span>
    </button>
  )
}
```

---

## 🔄 Mantenimiento de Este Documento

### Cuándo Actualizar AGENTS.md

- ✨ Se crea un nuevo componente reutilizable importante
- 🎨 Se agregan nuevas variables de tema a `globals.css`
- 📐 Se establece un nuevo patrón de diseño
- 🚫 Se identifica un nuevo anti-patrón a evitar
- 📁 Cambia la estructura de carpetas

### Formato para Nuevas Entradas

Al agregar un nuevo patrón establecido:

```markdown
### [Número]. [Nombre del Patrón]

**Componente establecido**: `ruta/al/componente.tsx`

Descripción breve del componente y cuándo usarlo.

**Incluye:**
- Feature 1
- Feature 2
- Feature 3

**Ejemplo de uso:**
\`\`\`tsx
// Código de ejemplo
\`\`\`
```

---

## 📚 Recursos de Referencia

### Archivos Clave para Consultar

1. **Sistema de Temas**: `apps/desktop/web/src/styles/globals.css`
2. **Componentes UI Base**: `apps/desktop/web/src/components/ui/`
3. **Patrones de Chat**: `apps/desktop/web/src/components/ChatPane.tsx`
4. **Bloques de Código**: `apps/desktop/web/src/components/chat/CodeBlock.tsx`
5. **Estilos de Chat**: `apps/desktop/web/src/components/ChatPane.css`

### Comandos Útiles de Búsqueda

```bash
# Buscar componentes Button existentes
grep -r "function.*Button" apps/desktop/web/src/components/

# Buscar uso de variables CSS
grep -r "var(--" apps/desktop/web/src/

# Buscar componentes reutilizables
ls -la apps/desktop/web/src/components/ui/

# Buscar estilos de un elemento específico
grep -r "\.chat-header" apps/desktop/web/src/
```

---

## 🎯 Objetivo Final

**Mantener un código:**
- ✅ **Consistente**: Mismo estilo y patrones en todo el proyecto
- ✅ **Reutilizable**: Componentes que se pueden usar en múltiples lugares
- ✅ **Mantenible**: Fácil de modificar y extender
- ✅ **Temático**: Todos los componentes respetan el sistema de temas
- ✅ **Accesible**: Componentes usables con teclado y lectores de pantalla

---

**Última actualización**: 2025-10-11  
**Versión**: 1.0.0

---

## ⚡ TL;DR (Resumen Ejecutivo)

1. **BUSCA ANTES DE CREAR**: Revisa `components/ui/` y código existente
2. **USA VARIABLES DE TEMA**: NUNCA colores hardcodeados, siempre `var(--variable)`
3. **REUTILIZA COMPONENTES**: Extiende con props en lugar de duplicar
4. **SIGUE PATRONES**: Mantén consistencia con código existente
5. **LEE globals.css**: Es tu fuente de verdad para colores y espaciado
