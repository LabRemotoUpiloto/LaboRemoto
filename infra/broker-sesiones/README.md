# broker-sesiones

Registro central de sesiones de práctica. La app reporta inicio, latido (cada 60 s) y fin de cada práctica; la identidad
sale del JWT de Keycloak, la IP de `X-Forwarded-For` (el gateway lo reenvía intacto) y la ciudad de ipinfo.io o del
dispositivo. Forma parte de los brokers (ver `../broker-gateway/README.md`).

## Endpoints (públicos como `/nvr/sesiones/…`)
- `POST /nvr/sesiones/evento` — `{tipo: inicio|latido|fin|ubicacion, sesion_id, practica_id?, practica_nombre?, lat?, lon?, precision_m?}`.
  201 si la sesión es nueva, 200 en un reintento.
- `GET /nvr/sesiones/resumen?dias=N` — solo `admin_lab`, `jefe_laboratorio`, `coordinador_laboratorio` o `laboratorista`
  (debe coincidir con `SUPERVISION` en `Cliente-Rust/frontend/src/hooks/usePermissions.ts`).

Datos en `sesiones.jsonl` (`SESIONES_FILE`), solo los últimos 90 días. Con `SESIONES_WEBHOOK_URL` reenvía cada inicio y fin
al mismo flujo de Power Automate de `RegistroExcel.sh`; el Excel queda como registro permanente (campos y cambios del
flujo en `../registro-excel/README.md`).

## Conexiones SSH a dispositivos (`dispositivos.js`)
Alimenta la pestaña **Dispositivos** de Actividad. Es aparte de las prácticas: no usa el webhook ni el Excel, y solo guarda
conexiones **nuevas** (no importa historial). Lo alimenta `../agente-conexiones` (corre en la Pi4 y lee `auth.log`).
- `POST /nvr/dispositivos/evento` — `{tipo: entrada|salida|latido, …}` con la cabecera `X-Dispositivo-Token`. **Solo local**: el gateway no
  la publica (404 desde internet).
- `GET /nvr/dispositivos/resumen?dias=N` — mismos roles que el resumen de sesiones. Por dispositivo: en línea, conectados ahora,
  conexiones (usuario, entrada, salida, IP, ubicación), cuentas compartidas (`pi`, solo se cuentan) y cuentas no reconocidas.
- Las cuentas del LDAP (`UPILOTO\x`, `UPILOTOx`, `x@upiloto.edu`, `x@upc.edu.co`) se normalizan a `UPILOTO\persona`.
- Datos en `dispositivos.jsonl` (`DISPOSITIVOS_FILE`, 90 días). En el log solo se escribe el id de sesión y la persona, nunca la IP ni el token.

## Configuración (ver `sesiones.env.example`)
`PORT` (8093), `SESIONES_FILE`, `SESIONES_WEBHOOK_URL`, `IPINFO_TOKEN`, `DISPOSITIVOS_JSON`, `DISPOSITIVOS_FILE` y las de Keycloak.
