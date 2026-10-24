# LaboRemoto

Plataforma de **laboratorio remoto** de la Universidad Piloto de Colombia. Permite a estudiantes, docentes y personal del laboratorio trabajar con equipos reales (Raspberry Pi, robots EV3, cámaras, Arduino) desde una aplicación de escritorio: terminal SSH, escritorio gráfico remoto, archivos, prácticas guiadas con validación automática, cursos de Moodle y un asistente de IA.

La aplicación es [`Cliente-Rust`](./Cliente-Rust): un cliente **Tauri 2** (backend en Rust, interfaz en React + TypeScript). Los servicios que la acompañan en la red del laboratorio están en [`infra/`](./infra).

## Qué se puede hacer

La barra lateral de la aplicación agrupa todo en cinco bloques:

| Bloque | Páginas | Para qué sirve |
|---|---|---|
| **Aprender** | Inicio, Prácticas, Mis cursos, Reservas | Portada con el estado del laboratorio o el avance del estudiante; prácticas de Linux y EV3 con guía paso a paso, validación, insignias y encuesta final; cursos y entregas de Moodle; reserva de horas (prototipo). |
| **Conectar** | Conexiones | Equipos guardados (con credenciales cifradas), nueva conexión y registros de sesiones anteriores. |
| **Laboratorio** | Monitoreo, Vigilancia | Rendimiento de la Raspberry Pi del laboratorio; cámaras del laboratorio con control PTZ. |
| **Personas** | Actividad, Usuarios | Sesiones, dispositivos conectados y encuestas; gestión de usuarios y roles. |
| **Esta sesión** | Terminal, Chat, Cámara, Escritorio, Pines, Archivos, Comandos | Herramientas que se abren dentro de una conexión SSH y se reacomodan arrastrándolas (mosaico). |

Además: menú de usuario (perfil, ajustes, temas), tutorial de bienvenida narrado, actualizaciones automáticas en Windows y enlaces `laboremoto://` desde Moodle que abren una práctica.

Lo que ve cada persona depende de su **rol** (`admin_lab`, `jefe_laboratorio`, `coordinador_laboratorio`, `laboratorista`, `semillerista`, `docente`, `estudiante`); ver [`Cliente-Rust/README.md`](./Cliente-Rust/README.md#roles).

## Cómo está organizado el repositorio

| Carpeta | Contenido |
|---|---|
| [`Cliente-Rust/`](./Cliente-Rust) | La aplicación: `backend/` (Rust + Tauri), `frontend/` (React), `scripts/`, `tools/` (guiones de los videos). |
| [`infra/`](./infra) | Servicios del laboratorio: brokers HTTP (`broker-*`), agente de conexiones, vigilante de Shinobi, contenido de las prácticas (`practicas-linux`, `practicas-ev3`), tema de login de Keycloak. |
| [`docs/`](./docs) | Notas de infraestructura y planes. |
| [`.github/workflows/`](./.github/workflows) | CI de cada PR, borrado de ramas fusionadas y publicación de versiones. |
| [`AGENTS.md`](./AGENTS.md) / [`CLAUDE.md`](./CLAUDE.md) | Contexto para asistentes de código: estructura, comandos, reglas y trampas conocidas. |

## Arrancar en desarrollo

Requisitos: Rust estable, Node.js 20 y las dependencias de sistema de [Tauri 2](https://v2.tauri.app/start/prerequisites/).

```bash
cd Cliente-Rust
npm run install:all          # dependencias de la raíz y del frontend
cp .env.example .env         # completa los valores (ver "Configuración" en Cliente-Rust/README.md)
npm run dev                  # libera los puertos 5174 y 1420 y lanza `cargo tauri dev`
```

`npm run dev` usa un script de PowerShell (`scripts/dev.ps1`). En otros sistemas lanza por separado `npm run dev:frontend` y `npm run dev:backend`.

## Comprobaciones antes de abrir un PR

```bash
cd Cliente-Rust
node scripts/check-comandos.mjs                       # comandos de Tauri vs. frontend
cd frontend && npx tsc --noEmit && npx vitest run     # tipos y pruebas del frontend
cd ../backend && cargo check --all-targets && cargo test --lib
```

El CI repite estas comprobaciones en cada PR hacia `Desarrollo`, `Produccion` o `Pruebas(QA)`.

## Documentación

- [`Cliente-Rust/README.md`](./Cliente-Rust/README.md): arquitectura, interfaz, módulos del backend y frontend, configuración y desarrollo.
- [`infra/broker-gateway/README.md`](./infra/broker-gateway/README.md): índice de la arquitectura de brokers.
- [`Cliente-Rust/CONFIGURACION-ALUMNOS.md`](./Cliente-Rust/CONFIGURACION-ALUMNOS.md): dónde dejar el `.env` en la aplicación instalada.
- [`AGENTS.md`](./AGENTS.md): reglas de trabajo del repositorio.

## Capturas

Las capturas anteriores correspondían a una versión antigua de la interfaz y se retiraron. Para añadir nuevas, guárdalas en `docs/imagenes/` y enlázalas aquí.
