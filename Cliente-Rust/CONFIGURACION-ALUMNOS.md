# Configuración de la app instalada (alumnos)

La versión que se descarga de GitHub **no trae claves**: el modelo de IA y las prácticas de Linux
no funcionan hasta que la app encuentre un archivo `.env` en su carpeta de configuración.
Ese archivo lo entrega el docente por un canal privado (por ejemplo el curso en Moodle); nunca va
en el instalador ni en el repositorio.

## Dónde dejarlo

| Sistema | Ruta |
|---|---|
| Windows | `%APPDATA%\co.unipiloto.sshclient\.env` (pégala en el Explorador de archivos) |
| Linux | `~/.config/co.unipiloto.sshclient/.env` |
| macOS | `~/Library/Application Support/co.unipiloto.sshclient/.env` |

También se acepta un `.env` junto al ejecutable. Si la carpeta no existe, créala.
**Después de dejar el archivo hay que cerrar y volver a abrir la app** (se lee al arrancar).

## Qué lleva

Ver [`config-alumno.env.example`](config-alumno.env.example): los nombres de las variables, sin
valores. Los valores los entrega el docente.

- Se puede crear con el Bloc de notas (guardar como "Todos los archivos", nombre `.env`) o con
  PowerShell; la app acepta UTF-8 y UTF-16.
- Una variable que ya esté definida en el sistema tiene prioridad sobre el archivo.

## Si falla

- Chat sin respuesta: el error dice `GROQ_API_KEY no encontrada` y la ruta donde debe estar el archivo.
- Prácticas de Linux sin módulos: el error dice qué variable falta (`PRACTICE_LINUX_...`) y la ruta.

## Para quien administra

Esta es una solución **temporal**: las claves quedan en cada equipo (revocar la de Groq al terminar el
curso y rotar la contraseña de la cuenta `svc-practicas`). El reemplazo correcto es un servidor
intermedio autenticado con Keycloak (como el broker de cámaras) que guarde las claves; ver
`infra/nvr-broker`. Código: `Cliente-Rust/backend/src/user_config.rs`.
