# 🎨 Guía de Uso de Colores - Cliente SSH Desktop

> **Última actualización:** 18 de Octubre, 2025  
> **Estado:** Sistema de diseño v2.0 - Expandido

---

## 📚 Índice

1. [Variables CSS Base](#variables-css-base)
2. [Paleta Expandida](#paleta-expandida)
3. [Uso por Componente](#uso-por-componente)
4. [Temas Disponibles](#temas-disponibles)
5. [Mejores Prácticas](#mejores-prácticas)
6. [Accesibilidad](#accesibilidad)

---

## 🎯 Variables CSS Base

### **Fondos (Backgrounds)**

```css
--background-primary: #0B1220;     /* Fondo principal de la app */
--background-secondary: #0F172A;   /* Paneles, cards, modales */
--background-tertiary: #111827;    /* Inputs, código, áreas elevadas */

/* Alias de superficies (mismo valor, diferente semántica) */
--surface-0: var(--background-primary);   /* Nivel base */
--surface-1: var(--background-secondary); /* Elevación 1 */
--surface-2: var(--background-tertiary);  /* Elevación 2 */
--surface-3: #1A202E;                     /* Elevación 3 (nuevo) */
--surface-overlay: rgba(0, 0, 0, 0.5);    /* Fondos de modales */
```

**Cuándo usar cada uno:**
- `--background-primary` → Layout principal, contenedor de la app
- `--background-secondary` → Cards, paneles, sidebar, header
- `--background-tertiary` → Inputs, áreas de código, tablas
- `--surface-3` → Componentes muy elevados (tooltips, dropdowns)

---

### **Textos (Text Colors)**

```css
--text-primary: #E5E7EB;        /* Texto principal, títulos */
--text-secondary: #9CA3AF;      /* Subtítulos, labels, metadata */
--text-tertiary: #6B7280;       /* 🆕 Texto de apoyo, timestamps */
--text-muted: #4B5563;          /* 🆕 Placeholders, texto muy sutil */
--text-disabled: #374151;       /* 🆕 Elementos deshabilitados */
--text-inverse: #0B1220;        /* 🆕 Texto sobre fondos claros/acentos */
```

**Jerarquía de uso:**
1. **Primary** → Títulos principales, contenido importante
2. **Secondary** → Subtítulos, descripciones, labels de formularios
3. **Tertiary** → Timestamps, metadatos, información secundaria
4. **Muted** → Placeholders de inputs, hints
5. **Disabled** → Elementos no interactuables
6. **Inverse** → Texto sobre botones primarios, badges de acento

---

### **Acentos (Accent Colors)**

```css
--accent-primary: #10B981;              /* Color de marca principal */
--accent-primary-hover: #059669;        /* Estado hover */
--accent-primary-light: #34D399;        /* 🆕 Versión suave */
--accent-primary-dark: #047857;         /* 🆕 Versión intensa */
--accent-primary-subtle: rgba(16, 185, 129, 0.12); /* 🆕 Fondos sutiles */

--accent-secondary: #3B82F6;            /* 🆕 Azul complementario */
--accent-tertiary: #8B5CF6;             /* 🆕 Morado de apoyo */
--accent-warm: #F59E0B;                 /* 🆕 Acento cálido/naranja */
```

**Uso recomendado:**
- `accent-primary` → Botones CTA, links principales, indicadores activos
- `accent-primary-hover` → Estados hover/focus
- `accent-primary-light` → Badges, chips, fondos de notificaciones
- `accent-primary-dark` → Bordes de focus, sombras de acento
- `accent-primary-subtle` → Fondos de items hover, selección suave
- `accent-secondary` → Botones secundarios, iconos informativos
- `accent-tertiary` → Tags, categorías, elementos decorativos
- `accent-warm` → Notificaciones, advertencias suaves

---

### **Estados (Status Colors)**

#### **✅ Success (Éxito)**
```css
--success: #22C55E;                     /* Color principal */
--success-bg: rgba(34, 197, 94, 0.12);  /* 🆕 Fondo de alerta */
--success-border: rgba(34, 197, 94, 0.3); /* 🆕 Borde de alerta */
--success-text: #4ADE80;                /* 🆕 Texto sobre fondo oscuro */
```

**Ejemplos de uso:**
- Mensaje de conexión exitosa
- Badge de "Activo" o "Conectado"
- Notificación de guardado exitoso

#### **⚠️ Warning (Advertencia)**
```css
--warning: #F59E0B;
--warning-bg: rgba(245, 158, 11, 0.12);  /* 🆕 */
--warning-border: rgba(245, 158, 11, 0.3); /* 🆕 */
--warning-text: #FBBF24;                 /* 🆕 */
```

**Ejemplos de uso:**
- Advertencias de configuración
- Acciones que requieren atención
- Mensajes informativos importantes

#### **🔴 Danger (Peligro)**
```css
--danger: #EF4444;
--danger-bg: rgba(239, 68, 68, 0.12);    /* 🆕 */
--danger-border: rgba(239, 68, 68, 0.3); /* 🆕 */
--danger-text: #F87171;                  /* 🆕 */
```

**Ejemplos de uso:**
- Botones de eliminar/desconectar
- Mensajes de error
- Confirmaciones destructivas

#### **ℹ️ Info (Información)**
```css
--info: #22D3EE;
--info-bg: rgba(34, 211, 238, 0.12);     /* 🆕 */
--info-border: rgba(34, 211, 238, 0.3);  /* 🆕 */
--info-text: #67E8F9;                    /* 🆕 */
```

**Ejemplos de uso:**
- Tips y ayudas contextuales
- Notificaciones informativas
- Mensajes del sistema

---

### **Bordes (Borders)**

```css
--border-subtle: rgba(255,255,255,0.08);  /* Muy sutil, apenas visible */
--border-color: #1F2937;                  /* Borde estándar */
--border-strong: rgba(255,255,255,0.18);  /* Más visible, para enfatizar */
```

**Uso por contexto:**
- `subtle` → Separadores internos, cards en reposo
- `color` → Borders principales de inputs, modales
- `strong` → Borders de elementos activos, hover states

---

### **Interacción (Interactive States)**

```css
--interactive-bg: transparent;              /* Base transparente */
--interactive-hover: rgba(255,255,255,0.06); /* Hover sutil */
--interactive-active: rgba(255,255,255,0.09); /* Click/presionado */
--interactive-selected: rgba(255,255,255,0.10); /* Seleccionado */
```

**Uso en componentes:**
```css
.list-item {
  background: var(--interactive-bg);
}

.list-item:hover {
  background: var(--interactive-hover);
}

.list-item:active {
  background: var(--interactive-active);
}

.list-item.selected {
  background: var(--interactive-selected);
}
```

---

## 🧩 Uso por Componente

### **1. Botones**

#### **Botón Primario (CTA)**
```css
.btn-primary {
  background: var(--accent-primary);
  color: var(--text-inverse);
  border: none;
}

.btn-primary:hover {
  background: var(--accent-primary-hover);
}

.btn-primary:disabled {
  background: var(--text-disabled);
  color: var(--text-muted);
}
```

#### **Botón Secundario**
```css
.btn-secondary {
  background: var(--surface-2);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
}

.btn-secondary:hover {
  background: var(--interactive-hover);
  border-color: var(--border-strong);
}
```

#### **Botón de Peligro**
```css
.btn-danger {
  background: var(--danger-bg);
  color: var(--danger-text);
  border: 1px solid var(--danger-border);
}

.btn-danger:hover {
  background: var(--danger);
  color: white;
  border-color: var(--danger);
}
```

#### **Botón Ghost**
```css
.btn-ghost {
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid transparent;
}

.btn-ghost:hover {
  background: var(--interactive-hover);
  color: var(--text-primary);
}
```

---

### **2. Inputs y Formularios**

```css
.input {
  background: var(--surface-2);
  color: var(--text-primary);
  border: 1px solid var(--border-subtle);
  placeholder: var(--text-muted);
}

.input:focus {
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 3px var(--accent-primary-subtle);
}

.input:disabled {
  background: var(--surface-1);
  color: var(--text-disabled);
  border-color: var(--border-subtle);
  cursor: not-allowed;
}

.input.error {
  border-color: var(--danger);
  box-shadow: 0 0 0 3px var(--danger-bg);
}

.input.success {
  border-color: var(--success);
  box-shadow: 0 0 0 3px var(--success-bg);
}
```

**Placeholder styling:**
```css
.input::placeholder {
  color: var(--text-muted);
  opacity: 1;
}
```

---

### **3. Cards y Paneles**

```css
/* Card básico */
.card {
  background: var(--surface-1);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

/* Card elevado */
.card.elevated {
  background: var(--surface-2);
  border-color: var(--border-color);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
}

/* Card interactivo */
.card.interactive:hover {
  border-color: var(--border-strong);
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.2);
  transform: translateY(-2px);
}

/* Card seleccionado */
.card.selected {
  border-color: var(--accent-primary);
  background: linear-gradient(
    135deg,
    var(--surface-1) 0%,
    color-mix(in srgb, var(--surface-1) 95%, var(--accent-primary) 5%) 100%
  );
}
```

---

### **4. Mensajes de Alerta**

```css
/* Alerta de éxito */
.alert-success {
  background: var(--success-bg);
  border: 1px solid var(--success-border);
  border-left: 4px solid var(--success);
  color: var(--text-primary);
}

.alert-success .icon {
  color: var(--success-text);
}

/* Alerta de advertencia */
.alert-warning {
  background: var(--warning-bg);
  border: 1px solid var(--warning-border);
  border-left: 4px solid var(--warning);
}

/* Alerta de peligro */
.alert-danger {
  background: var(--danger-bg);
  border: 1px solid var(--danger-border);
  border-left: 4px solid var(--danger);
}

/* Alerta de información */
.alert-info {
  background: var(--info-bg);
  border: 1px solid var(--info-border);
  border-left: 4px solid var(--info);
}
```

---

### **5. Badges y Tags**

```css
/* Badge primario */
.badge-primary {
  background: var(--accent-primary-subtle);
  color: var(--accent-primary-light);
  border: 1px solid var(--accent-primary-dark);
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
}

/* Badge de estado - Conectado */
.badge-success {
  background: var(--success-bg);
  color: var(--success-text);
  border: 1px solid var(--success-border);
}

/* Badge de estado - Desconectado */
.badge-danger {
  background: var(--danger-bg);
  color: var(--danger-text);
  border: 1px solid var(--danger-border);
}

/* Badge neutro */
.badge-neutral {
  background: var(--surface-2);
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
}
```

---

### **6. Modales**

```css
/* Overlay del modal */
.modal-overlay {
  background: var(--surface-overlay);
  backdrop-filter: blur(8px);
}

/* Contenido del modal */
.modal-content {
  background: var(--surface-2);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
}

/* Header del modal */
.modal-header {
  border-bottom: 1px solid var(--border-subtle);
  padding: 20px 24px;
}

.modal-title {
  color: var(--text-primary);
  font-size: 20px;
  font-weight: 600;
}

/* Body del modal */
.modal-body {
  padding: 24px;
  color: var(--text-secondary);
}

/* Footer del modal */
.modal-footer {
  border-top: 1px solid var(--border-subtle);
  padding: 16px 24px;
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}
```

---

### **7. Tablas**

```css
.table {
  background: var(--surface-1);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  overflow: hidden;
}

.table thead th {
  background: var(--surface-2);
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-color);
  padding: 12px 16px;
  font-weight: 600;
  text-transform: uppercase;
  font-size: 11px;
  letter-spacing: 0.5px;
}

.table tbody td {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-subtle);
  color: var(--text-primary);
}

.table tbody tr:hover {
  background: var(--interactive-hover);
}

.table tbody tr:active {
  background: var(--interactive-active);
}

.table tbody tr.selected {
  background: var(--interactive-selected);
  box-shadow: inset 0 0 0 2px var(--accent-primary-subtle);
}
```

---

### **8. Terminal y Código**

```css
.terminal {
  background: var(--surface-0); /* Nivel base para contraste máximo */
  color: var(--terminal-foreground);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  font-family: var(--terminal-font-family);
  font-size: var(--terminal-font-size);
  padding: 12px;
}

.code-block {
  background: var(--surface-2);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  overflow: hidden;
}

.code-block-header {
  background: var(--surface-3);
  border-bottom: 1px solid var(--border-color);
  padding: 8px 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.code-block-language {
  color: var(--text-tertiary);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.code-block-content {
  padding: 16px;
  color: var(--text-primary);
  font-family: var(--terminal-font-family);
  overflow-x: auto;
}
```

---

### **9. Navegación (Sidebar)**

```css
.sidebar {
  background: var(--surface-1);
  border-right: 1px solid var(--border-subtle);
}

.nav-item {
  color: var(--text-secondary);
  padding: 10px 16px;
  border-radius: 8px;
  transition: all 0.2s ease;
}

.nav-item:hover {
  background: var(--interactive-hover);
  color: var(--text-primary);
}

.nav-item.active {
  background: var(--accent-primary-subtle);
  color: var(--accent-primary-light);
  border-left: 3px solid var(--accent-primary);
}

.nav-item.active::before {
  content: "";
  position: absolute;
  left: 0;
  width: 3px;
  height: 100%;
  background: var(--accent-primary);
}
```

---

### **10. Header**

```css
.app-header {
  background: var(--surface-1);
  border-bottom: 1px solid var(--border-subtle);
  backdrop-filter: blur(10px);
  height: 50px;
  display: flex;
  align-items: center;
  padding: 0 16px;
}

.tab {
  color: var(--text-secondary);
  padding: 0 16px;
  height: 100%;
  display: flex;
  align-items: center;
  border-right: 1px solid var(--border-subtle);
  transition: all 0.2s ease;
}

.tab:hover {
  background: var(--interactive-hover);
  color: var(--text-primary);
}

.tab.active {
  background: var(--surface-0);
  color: var(--text-primary);
  border-bottom: 2px solid var(--accent-primary);
}
```

---

## 🎨 Temas Disponibles

### **Temas Oscuros (17 temas)**

| Nombre | Personalidad | Acento Principal | Uso Recomendado |
|--------|--------------|------------------|-----------------|
| Default | Profesional/Neutro | Verde esmeralda | Uso general, productividad |
| Dracula | Retro/Vibrante | Rosa fuerte | Desarrolladores, terminal |
| Midnight Muse | Elegante/Moderno | Verde menta | Diseño, UI/UX |
| Obsidian Rose | Dramático/Intenso | Rosa oscuro | Creativos, nocturnos |
| Aurora Coral | Cálido/Acogedor | Coral/Naranja | Sesiones largas, confort |
| Verdant Neon | Neón/Ciberpunk | Verde neón | Gaming, estética futurista |
| Sunset Blush | Romántico/Cálido | Rosa sunset | Sesiones nocturnas |
| Moody Purple | Misterioso/Profundo | Morado intenso | Artístico, creativo |
| Oceanic Teal | Fresco/Tranquilo | Teal oceánico | Desarrollo, focus |
| Ruby Night | Intenso/Pasional | Rojo rubí | Alertas, intensidad |
| Forest Moss | Natural/Relajante | Verde musgo | Largo tiempo de uso |
| Berry Soda | Dulce/Vibrante | Rosa berry | Casual, divertido |
| Violet Ember | Místico/Elegante | Violeta ember | Diseño, creativo |
| Glass Water | Limpio/Cristalino | Cyan agua | Productividad, focus |
| Metro Gray | Neutro/Industrial | Gris/Azul | Minimalista, profesional |
| Ember Dawn | Cálido/Amanecer | Naranja ember | Mañanas, energía |
| Nebula Ink | Espacial/Profundo | Púrpura nebulosa | Nocturno, contemplativo |

### **Temas Claros (9 temas)**

| Nombre | Personalidad | Acento Principal | Uso Recomendado |
|--------|--------------|------------------|-----------------|
| Light | Limpio/Profesional | Cyan | Oficina, día claro |
| Mist Harbor | Suave/Tranquilo | Teal suave | Lectura, documentación |
| Paper Sand | Cálido/Acogedor | Arena/Naranja | Escritura, confort |
| Polar Mint | Fresco/Energizante | Menta polar | Mañanas, energía |
| Midday Azure | Brillante/Claro | Azul cielo | Máxima luminosidad |
| Sakura Blush | Delicado/Suave | Rosa sakura | Diseño, estético |
| Cosmic Latte | Cremoso/Vintage | Amarillo dorado | Lectura prolongada |
| Sepia Paper | Vintage/Nostálgico | Sepia/Marrón | Documentos, escritura |
| Granite Fog | Neutro/Medio | Verde bosque | Contraste medio |

### **Temas Especiales (2 temas)**

| Nombre | Personalidad | Descripción |
|--------|--------------|-------------|
| Sunburst Rainbow | Festivo/Colorido | Gradientes cálidos multi-color |
| Bold Rainbow | Saturado/Vibrante | Colores intensos animados |

---

## ✨ Mejores Prácticas

### **1. Jerarquía Visual**

**Usar la escala de elevación correctamente:**
```
surface-0 (base) → surface-1 (cards) → surface-2 (modales) → surface-3 (tooltips)
```

### **2. Contraste de Texto**

**Siempre verificar WCAG 2.1 AA:**
- Texto normal: mínimo 4.5:1
- Texto grande (18px+): mínimo 3:1
- Elementos gráficos/UI: mínimo 3:1

### **3. Estados Interactivos**

**Siempre incluir los 4 estados:**
1. Default (estado base)
2. Hover (cursor encima)
3. Active (clic/presionado)
4. Focus (navegación por teclado)
5. Disabled (no interactuable)

### **4. Consistencia de Acentos**

**Usar accent-primary para:**
- Botones CTA principales
- Links importantes
- Indicadores de estado activo
- Bordes de focus

**Usar accent-secondary/tertiary para:**
- Elementos decorativos
- Tags y badges secundarios
- Iconos informativos

### **5. Espaciado y Respiración**

**Dejar espacio alrededor de elementos interactivos:**
```css
.clickable-element {
  padding: 12px 16px; /* Mínimo 44x44px para touch targets */
  margin: 8px 0;      /* Respiración vertical */
}
```

---

## ♿ Accesibilidad

### **Ratios de Contraste por Nivel**

#### **Nivel AAA (Óptimo)**
- Texto normal: 7:1
- Texto grande: 4.5:1

#### **Nivel AA (Mínimo)**
- Texto normal: 4.5:1
- Texto grande: 3:1

### **Validación de Temas**

**Todos los temas han sido validados con:**
- ✅ Contraste de texto primary sobre background
- ✅ Contraste de botones y elementos interactivos
- ✅ Legibilidad de estados de error/éxito
- ⚠️ Granite Fog mejorado para cumplir estándares

### **Focus Visible**

**Siempre incluir indicadores de focus:**
```css
.interactive:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--accent-primary-subtle);
  border-color: var(--accent-primary);
}
```

### **Reducción de Movimiento**

**Respetar preferencias del usuario:**
```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 🔗 Referencias Rápidas

### **Archivo Principal**
`apps/desktop/web/src/styles/globals.css`

### **Componentes de Referencia**
- Botones: `.btn`, `.btn-primary`, `.btn-secondary`
- Cards: `.card`, `.theme-card`
- Inputs: `.input`, `.select`
- Modales: `.modal-overlay`, `.modal-content`
- Tablas: `.table`, `.table tbody tr`

### **Herramientas de Desarrollo**
- Contrast Checker: https://webaim.org/resources/contrastchecker/
- Color Palette Generator: https://coolors.co/
- Accessibility Inspector: DevTools > Accessibility tab

---

## 📝 Changelog

### **v2.0 (Octubre 2025)**
- ✅ Expandido: +6 variables de texto (tertiary, muted, disabled, inverse)
- ✅ Expandido: +7 variables de acento (light, dark, subtle, secondary, tertiary, warm)
- ✅ Expandido: +12 variables de estado (bg, border, text para cada estado)
- ✅ Agregado: Variables de superficie (surface-0 a surface-3)
- ✅ Mejorado: Tema Granite Fog con mejor contraste
- ✅ Mejorado: Indicador visual de tema activo con checkmark

### **v1.0 (Inicial)**
- Variables base de 30 temas
- Sistema de colores por categoría
- Documentación de componentes base

---

## 💡 Soporte

Para dudas o sugerencias sobre el sistema de diseño:
1. Consultar `AGENTS.md` para directrices de agentes de IA
2. Revisar `globals.css` para variables disponibles
3. Verificar `ThemesPage.tsx` para lista de temas

---

**Última revisión:** 18/10/2025  
**Mantenedores:** Equipo de Frontend
