# broker-moodle

Cursos y prácticas desde Moodle sin que el cliente vea el token de Moodle. Valida el JWT de Keycloak, toma la identidad de
`preferred_username` (debe coincidir con el username de Moodle) y limita cada consulta a lo que esa persona puede ver: el
usuario de servicio de Moodle ve todo, así que la autorización se aplica aquí. Forma parte de los brokers (ver
`../broker-gateway/README.md`). Puede correr en otra máquina que los demás: solo necesita alcanzar a Moodle y al JWKS de
Keycloak (y que el gateway sepa su dirección, `UPSTREAM_MOODLE`).

## Endpoints (públicos como `/nvr/moodle/…`)
- `GET /nvr/moodle/cursos` — cursos de la persona con su rol (`docente` | `estudiante`); `enMoodle:false` si aún no tiene cuenta.
- `GET /nvr/moodle/cursos/:id/practicas` — tareas del curso cuyo *ID number* empieza por `labo:` (= prácticas); exige estar matriculado.
- `POST /nvr/moodle/resultado` — `{cmid, nota 0-100, resumen, log?}`. Deja nota provisional y comentario en estado «listo para
  revisar»; el docente decide en Moodle. Con `log: {gzipBase64}` (el HTML completo del registro de la sesión, comprimido), lo
  adjunta como **archivo de comentarios** dentro de un `.zip` (y con una política de contenido que bloquea scripts al abrirlo): Moodle
  muestra los `.html` subidos dentro de su propio sitio sin aislarlos, así que nunca se sube un HTML suelto. Si la subida falla, la
  nota se envía igual y la respuesta lo dice en `registro` (`adjuntado` | `no_enviado` | `fallo_la_subida` | `no_valido` | `subida_no_disponible`). Rechaza: tarea sin flujo de calificación (409), ya en revisión o calificada (409),
  docente (403), actividad que no es práctica (404). El resumen se escapa (sin HTML).

- `GET /nvr/moodle/abrir/:práctica` — **pública** (sin JWT, sin datos de nadie). Página puente que lanza `laboremoto://practica/<id>`
  para abrir la app en esa práctica. Moodle no permite enlaces con un esquema propio en la descripción de una tarea, pero sí `http(s)`:
  el docente pega `http://<servidor>/nvr/moodle/abrir/ev3-m3` (el botón «Copiar enlace» de «Mis cursos» lo da hecho). Solo acepta ids
  `[A-Za-z0-9._-]{1,100}`; el enlace solo **navega** (nunca arranca la práctica por sí solo).

## Convención práctica ↔ tarea
La práctica `ev3-m3` se vincula a una tarea de Moodle con *ID number* `labo:ev3-m3` y **flujo de calificación activado**.

## Configuración (ver `moodle.env.example`)
`MOODLE_URL`, `MOODLE_TOKEN`, `MOODLE_HOST_HEADER` (el wwwroot de Moodle; si no coincide, Moodle redirige), `PORT` (8094) y
las de Keycloak. Sin `MOODLE_URL`/`MOODLE_TOKEN` responde 503 `moodle_no_configurado`.

## Qué necesita el usuario de servicio de Moodle
Funciones del servicio web: `core_webservice_get_site_info`, `core_user_get_users_by_field`, `core_enrol_get_users_courses`,
`core_user_get_course_user_profiles`, `core_course_get_contents`, `core_course_get_course_module`,
`mod_assign_get_assignments`, `mod_assign_get_submission_status`, `mod_assign_save_grade`. Permiso `moodle/course:manageactivities`
(sin él Moodle no devuelve el `idnumber`).

Para adjuntar el registro de la sesión además hace falta, en Moodle:
- En el servicio web `labremoto`: marcar **«Puede subir archivos»** (`uploadfiles`); sin eso `webservice/upload.php` responde `accessexception`.
- En el rol del usuario de servicio: `moodle/user:manageownfiles` y `repository/upload:view`.
- En cada tarea: **«Archivos de comentarios»** activado (en Administración del sitio → Plugins → Tareas → Plugins de comentarios se puede dejar
  activado por defecto para las tareas nuevas). Sin eso la nota se envía igual, solo sin el archivo.
