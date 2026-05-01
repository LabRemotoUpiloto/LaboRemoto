# Sesiones Gráficas Remotas

**Feature Design Document — Cliente SSH Unipiloto**  
Versión 1.0 · Marzo 2026 · Tauri + Rust + noVNC

---

## 1. Descripción de la Feature

Esta feature extiende el Cliente SSH Unipiloto con la capacidad de iniciar sesiones de escritorio gráfico completamente aisladas sobre una conexión SSH existente. El modelo de sesión es stateless: cada conexión genera un entorno gráfico nuevo y al desconectarse todo es destruido, exactamente igual que una sesión SSH de terminal.

El objetivo de rendimiento es lograr una experiencia fluida y de baja latencia comparable a herramientas de escritorio remoto modernas, manteniendo la arquitectura del cliente dentro del WebView de Tauri sin dependencias nativas adicionales en el cliente.

---

## 2. Modelo de Sesión

Cada usuario conectado obtiene un entorno completamente independiente:

| SSH Terminal (actual) | SSH Gráfico (nueva feature) |
|---|---|
| Shell propia por usuario | Escritorio propio por usuario |
| Stateless al desconectar | Stateless al desconectar |
| Procesos aislados | Display virtual aislado |
| Texto en terminal | GUI completa en WebView |

---

## 3. Stack Técnico Seleccionado

Después de evaluar X11 Forwarding, Xpra, VNC clásico y streaming con WebRTC, el stack elegido es:

| Componente | Rol | Por qué |
|---|---|---|
| **Xvfb** | Display virtual por sesión | Aisla cada usuario en su propio display |
| **Openbox** | Gestor de ventanas ligero | Arranca en < 1s, mínimo uso de RAM |
| **x11vnc** | Expone el display por VNC (localhost) | Solo accesible desde el tunnel SSH |
| **noVNC** | Cliente VNC en JavaScript/Canvas | Funciona directo en el WebView de Tauri |
| **Rust** | Backend Tauri — control de sesión | Ejecuta comandos SSH, abre tunnel, limpia |

Este stack no requiere ningún proceso corriendo permanentemente en el servidor. Solo necesita los binarios instalados. El cliente Tauri es quien orquesta el ciclo de vida completo.

---

## 4. Arquitectura de la Solución

### 4.1 Diagrama de flujo de sesión

```
[Cliente Tauri]
     Usuario autenticado por SSH
         ↓
[Rust Backend]
     ejecuta Xvfb :N  →  openbox  →  x11vnc :port
     abre tunnel SSH localhost:port → servidor:port
         ↓
[WebView]
     noVNC apunta a ws://localhost:port
     renderiza escritorio en <canvas>
         ↓  (al cerrar)
[Rust Backend]
     mata tunnel + pkill x11vnc Xvfb openbox
     display destruido, sesión limpia
```

### 4.2 Responsabilidades por capa

**Rust (Backend Tauri)**

- Ejecutar comandos remotos vía SSH para levantar Xvfb, Openbox y x11vnc
- Detectar puertos y displays disponibles dinámicamente
- Abrir y mantener el tunnel SSH (port forwarding local → remoto)
- Destruir todos los procesos y liberar recursos al desconectar

**JavaScript (WebView)**

- Cargar la librería noVNC apuntando al tunnel que Rust ya estableció
- Capturar eventos de mouse y teclado para enviarlos al servidor
- Renderizar el escritorio remoto en un elemento canvas

---

## 5. Comparativa de Tecnologías Evaluadas

| Tecnología | Escritorio completo | Sin estado | WebView | Rendimiento |
|---|---|---|---|---|
| X11 Forwarding | ❌ | ✅ | ❌ | Medio |
| VNC clásico | ✅ | ✅ | ✅ | Medio |
| Xpra | ✅ | ❌ | ✅ | Bueno |
| **Xvfb + x11vnc ✓** | **✅** | **✅** | **✅** | **Muy bueno** |

> El stack seleccionado es la única opción que cumple simultáneamente los cuatro criterios requeridos: escritorio completo, stateless, compatible con WebView y alto rendimiento.

---

## 6. Requisitos en el Servidor

### 6.1 Dependencias a instalar

No se requiere ningún servicio corriendo de forma permanente. Solo los binarios disponibles:

```bash
# Ubuntu / Debian
sudo apt install xvfb x11vnc openbox

# Fedora / RHEL
sudo dnf install xorg-x11-server-Xvfb x11vnc openbox
```

### 6.2 Compatibilidad

- **Sistema operativo:** Linux únicamente (Ubuntu, Debian, Fedora, RHEL y derivados)
- **Windows Server:** no compatible con este stack
- **macOS Server:** compatible parcialmente con adaptaciones adicionales
- Acceso SSH estándar ya habilitado en el servidor

---

## 7. Ciclo de Vida de una Sesión

| # | Evento | Acción |
|---|---|---|
| 1 | Usuario conecta | Rust ejecuta Xvfb, Openbox y x11vnc en el servidor vía SSH |
| 2 | Tunnel establecido | Rust hace port forwarding SSH del puerto VNC al localhost del cliente |
| 3 | WebView listo | JS carga noVNC apuntando a `ws://localhost:{puerto}` |
| 4 | Sesión activa | Usuario interactúa con el escritorio en el canvas del WebView |
| 5 | Usuario desconecta | Rust mata tunnel + procesos remotos; display destruido |
| 6 | Nueva conexión | Se repite desde el paso 1 con un display y puerto nuevos |

---

## 8. Plan de Implementación

### Fase 1 — Backend Rust

- Detectar display y puerto VNC libre en el servidor
- Ejecutar secuencia Xvfb → Openbox → x11vnc vía SSH
- Abrir tunnel SSH con port forwarding
- Emitir evento Tauri al frontend con el puerto local listo
- Registrar cleanup handler para cierre de ventana o desconexión

### Fase 2 — Frontend JavaScript

- Recibir el evento de puerto listo desde Rust
- Inicializar noVNC en un elemento canvas
- Implementar controles básicos: resolución, calidad, pantalla completa
- Manejar reconexión y errores de red

### Fase 3 — Integración y UX

- Añadir botón / opción en la UI del cliente SSH para iniciar sesión gráfica
- Indicador de estado de sesión y latencia
- Cleanup robusto al cerrar pestaña, ventana o sesión SSH padre

---

## 9. Notas y Decisiones de Diseño

- La **persistencia de sesión fue descartada deliberadamente** para mantener el modelo mental de SSH: stateless, predecible, sin estado huérfano.
- **noVNC fue elegido** sobre soluciones nativas porque funciona sin dependencias adicionales en el cliente y vive 100% en el WebView existente de Tauri.
- El **backend Rust es responsable de todo el ciclo de vida**; JavaScript solo renderiza. Esto garantiza cleanup correcto incluso si el WebView crashea.
- El escritorio por defecto será **Openbox** por su peso mínimo (~2 MB RAM) y tiempo de arranque inferior a 1 segundo. El usuario puede cambiar esto en configuración.1