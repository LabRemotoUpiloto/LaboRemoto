# broker-sesiones

Registro central de sesiones de práctica. La app reporta inicio, latido (cada 60 s) y fin de cada práctica; la identidad
sale del JWT de Keycloak, la IP de `X-Forwarded-For` (el gateway lo reenvía intacto) y la ciudad de ipinfo.io o del
dispositivo. Forma parte de los brokers (ver `../broker-gateway/README.md`).

## Endpoints (públicos como `/nvr/sesiones/…`)
- `POST /nvr/sesiones/evento` — `{tipo: inicio|latido|fin|ubicacion, sesion_id, practica_id?, practica_nombre?, lat?, lon?, precision_m?}`.
  201 si la sesión es nueva, 200 en un reintento.
- `POST /nvr/sesiones/app` — `{tipo: inicio|latido|fin, sesion_id}`: la app abierta, con o sin práctica. Queda en el mismo
  registro con `clase: "app"` (las prácticas, `clase: "practica"`) y **no** va al Excel. Ruta aparte a propósito: un broker
  sin ella responde 404 y la app deja de intentar, así nunca aparece como práctica.
- `GET /nvr/sesiones/resumen?dias=N` — solo `admin_lab`, `jefe_laboratorio`, `coordinador_laboratorio` o `laboratorista`
  (debe coincidir con `SUPERVISION` en `Cliente-Rust/frontend/src/features/cuenta/usePermissions.ts`). Trae prácticas y uso de la app.

Ubicación: la del equipo (si la app la manda) es la principal, pero la de la IP y su operador (`org` de ipinfo) se guardan
**aparte** (`ip_ciudad`, `ip_pais`, `ip_lat`, `ip_lon`, `ip_org`; en dispositivos, `ipCiudad`…): si no cuadran, Actividad lo marca como
ubicación dudosa. Al arrancar se completan los registros guardados que no la tenían (una consulta por IP distinta).

Datos en `sesiones.jsonl` (`SESIONES_FILE`), solo los últimos 90 días. Con `SESIONES_WEBHOOK_URL` reenvía cada inicio y fin
al mismo flujo de Power Automate de `RegistroExcel.sh`; el Excel queda como registro permanente (campos y cambios del
flujo en `../registro-excel/README.md`).

## Conexiones SSH a dispositivos (`dispositivos.js`)
Alimenta «Trabajando por SSH» en Actividad (una conexión que coincide con una práctica de la misma persona cuenta solo como práctica). Es aparte de las prácticas: no usa el webhook ni el Excel, y solo guarda
conexiones **nuevas** (no importa historial). Lo alimenta `../agente-conexiones` (corre en la Pi4 y lee `auth.log`).
- `POST /nvr/dispositivos/evento` — `{tipo: entrada|salida|latido, …}` con la cabecera `X-Dispositivo-Token`. **Solo local**: el gateway no
  la publica (404 desde internet).
- `GET /nvr/dispositivos/resumen?dias=N` — mismos roles que el resumen de sesiones. Por dispositivo: en línea, conectados ahora,
  conexiones (usuario, entrada, salida, IP, ubicación), cuentas compartidas (`pi`, solo se cuentan) y cuentas no reconocidas.
- Las cuentas del LDAP (`UPILOTO\x`, `UPILOTOx`, `x@upiloto.edu`, `x@upc.edu.co`) se normalizan a `UPILOTO\persona`.
- Datos en `dispositivos.jsonl` (`DISPOSITIVOS_FILE`, 90 días). En el log solo se escribe el id de sesión y la persona, nunca la IP ni el token.

## Registros de la terminal de las prácticas (`registros.js`)
Lo que cada estudiante hizo en la terminal durante una práctica de Linux, guardado aquí (antes solo quedaba en el equipo donde la
hizo). Un **intento** es una práctica abierta en una pestaña de la app: la app lo manda al **aprobarla**, al **cerrar la pestaña** sin
terminarla y al **cerrar la app**, y cada 2 minutos deja una copia en el equipo por si se cuelga (se manda al volver a iniciar sesión).
- `POST /nvr/registros` — `{id, practica, practicaNombre?, estado: terminada|sin_terminar|app_cerrada, inicio, fin, nota?, gzipBase64}`.
  Cualquier persona con sesión, **solo en su carpeta** (sale del token). Un envío del mismo `id` **reemplaza** el archivo: un archivo por
  intento. Aprobada una vez, queda «terminada». Tope: 1 MB por petición, lo que deja pasar el nginx de AWS; si el registro comprimido no cabe, la app recorta el principio
  (queda lo más reciente) y lo avisa dentro del registro.
- `GET /nvr/registros?dias=N` y `GET /nvr/registros/archivo?carpeta=C&id=I` — solo `admin_lab`, `semillerista` y `docente` (rol o
  `user_type`; debe coincidir con `REGISTROS_ESTUDIANTES` en `usePermissions.ts`). En la app: Conexiones → «Prácticas de estudiantes».
- Archivos: `REGISTROS_DIR/<usuario>/<Nombre-Del-Estudiante>_<practica>_<AAAA-MM-DD_HH-MM-SS>.html` (hora de inicio, Bogotá) y el
  índice `registros.jsonl`. Se borran a los **20 días** (revisión cada hora).

## Configuración (ver `sesiones.env.example`)
`PORT` (8093), `SESIONES_FILE`, `SESIONES_WEBHOOK_URL`, `IPINFO_TOKEN`, `DISPOSITIVOS_JSON`, `DISPOSITIVOS_FILE`, `REGISTROS_DIR` y las de Keycloak.
