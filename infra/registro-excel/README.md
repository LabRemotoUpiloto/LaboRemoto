# Registro de conexiones y sesiones → Excel

Un solo flujo de Power Automate ("Cuando se recibe una solicitud HTTP") recibe
dos fuentes y las guarda en el mismo archivo, `/Registros_Raspberry.xlsx`
(OneDrive), en tablas separadas:

| Fuente | Qué registra | `origen` | Tabla |
|---|---|---|---|
| `RegistroExcel.sh` (Pi4, servicio `registroExcel`) | Cada conexión SSH con contraseña, leída de `auth.log` | *(no lo manda)* | `Registros` |
| Broker `broker-sesiones` (Pi4, servicio `broker-sesiones`, antes `nvr-broker`) | Cada práctica abierta desde la app, con el estudiante de Keycloak | `app` | `SesionesApp` |

Van en tablas separadas porque el flujo "Envio automatico de asistencia
labIOT" arma el correo de asistencia leyendo `Registros`. Si las sesiones de la
app cayeran ahí, saldrían en el correo, y las de Linux, dobles (la conexión SSH
más la sesión de la app).

Las dos fuentes mandan cada registro **dos veces con el mismo `ID`**: al
conectarse (`hora_desconexion: "Activo"`) y al desconectarse (con la hora). El
flujo crea la fila la primera vez y la actualiza por `ID` la segunda.

El Excel es el registro permanente. El broker solo guarda los últimos 90 días
(`/opt/laboremoto-brokers/data/sesiones.jsonl`) para el dashboard de la app.

## Actualizar el flujo para recibir las sesiones de la app

1. **Tabla nueva en el Excel.** En `Registros_Raspberry.xlsx`, crea una hoja
   `SesionesApp` con estos encabezados en la fila 1, selecciónalos,
   *Insertar → Tabla* (marca "La tabla tiene encabezados") y en *Diseño de
   tabla* ponle de nombre `SesionesApp`:

   `ID` · `usuario` · `session_id` · `hora_conexion` · `hora_desconexion` ·
   `ip` · `nombre` · `correo` · `practica` · `duracion_min` · `ciudad` ·
   `region` · `pais` · `lat` · `lon` · `fuente_ubicacion` · `precision_m`

   | Columna | Contenido |
   |---|---|
   | `usuario` | Usuario de Keycloak (el de la app, no la cuenta SSH) |
   | `nombre`, `correo` | Nombre y correo institucional del estudiante |
   | `practica` | Nombre de la práctica (Linux, EV3, …) |
   | `duracion_min` | Minutos de práctica; vacío mientras está `Activo` |
   | `ciudad` | Barrio y ciudad, o solo ciudad si es aproximada por IP |
   | `region`, `pais` | Departamento y código de país (`CO`) |
   | `lat`, `lon` | Coordenadas (redondeadas a ~100 m si vienen del equipo) |
   | `fuente_ubicacion` | `dispositivo` (servicio de ubicación del equipo) o `ip` (aproximada) |
   | `precision_m` | Precisión en metros que reportó el equipo |

   La tabla `Registros` no se toca.

2. **Esquema del disparador**: reemplázalo por este. Solo los seis campos
   originales son obligatorios, porque el script no manda los demás.

   ```json
   {
     "type": "object",
     "properties": {
       "ID": { "type": "string" },
       "usuario": { "type": "string" },
       "session_id": { "type": "string" },
       "hora_conexion": { "type": "string" },
       "hora_desconexion": { "type": "string" },
       "ip": { "type": "string" },
       "origen": { "type": "string" },
       "nombre": { "type": "string" },
       "correo": { "type": "string" },
       "practica": { "type": "string" },
       "duracion_min": { "type": "string" },
       "ciudad": { "type": "string" },
       "region": { "type": "string" },
       "pais": { "type": "string" },
       "lat": { "type": "string" },
       "lon": { "type": "string" },
       "fuente_ubicacion": { "type": "string" },
       "precision_m": { "type": "string" }
     },
     "required": ["ID", "usuario", "session_id", "hora_conexion", "hora_desconexion", "ip"]
   }
   ```

   El broker manda todo como texto y `""` cuando falta un dato, para que
   nunca choque con el esquema.

3. **Separar por `origen`.** El flujo (`httpTEST1Lu`) tiene una Condición
   `hora_desconexion = "Activo"`: en *Sí* agrega la fila a `Registros` y
   avisa en Teams; en *No* obtiene la fila por `ID` y la actualiza. Envuélvela
   en una Condición nueva, justo después del disparador: `origen` *es igual
   a* `app`.
   - **No (False)**: arrastra aquí la Condición que ya existía, sin cambios
     salvo uno: en *Actualizar una fila*, la columna `USUARIO` usaba
     `triggerBody()?['Usuario']` y el script manda `usuario` en minúscula;
     cámbiala por el campo `usuario`.
   - **Sí (True)**: hacia `SesionesApp` y sin Teams, dos pasos:
     1. *Actualizar una fila* → tabla `SesionesApp`, columna clave `ID`,
        valor el `ID` del disparador.
     2. *Agregar una fila a una tabla* → `SesionesApp`, con *Configuración →
        Ejecutar después de* solo en **"Ha fallado"**.

     Al inicio la fila no existe: la actualización falla y el segundo paso
     la crea. Al cierre la fila ya existe y se actualiza. Si se perdió el
     envío del inicio, el cierre la crea igual.

     En los dos, cada columna con el campo del disparador del mismo nombre.

   No renombres las columnas de `Registros`: `HORA DESCONEXIÓN ` lleva un
   espacio al final y el flujo de asistencia depende de esos nombres.

4. **Activar el envío** en la Pi4. Hazlo solo después de guardar el flujo.
   Usa la misma URL que ya tiene `/etc/registroExcel.env`:

   ```bash
   sudo systemctl edit broker-sesiones
   # [Service]
   # Environment=SESIONES_WEBHOOK_URL=<misma URL de /etc/registroExcel.env>
   sudo systemctl restart broker-sesiones
   journalctl -u broker-sesiones -f   # "[sesiones] webhook falló" si el flujo rechaza algo
   ```
