# Módulos `ev3-m1` a `ev3-m9` (tarjeta Eve3)

Módulos de la API de prácticas (`/opt/practicas-linux-api/` en la Pi4, puerto 8770).
La app los muestra en la tarjeta **Eve3** porque su id empieza por `ev3-`
(`module_category` en `backend/src/cmd/practices/linux_api.rs`).

| Id | Módulo |
|---|---|
| `ev3-m1` | Conociendo el EV3 |
| `ev3-m2` | Sensores en acción |
| `ev3-m3` | Movimiento preciso y trayectorias |
| `ev3-m4` | Comportamientos reactivos |
| `ev3-m5` | Python para robots |
| `ev3-m6` | Depuración y diagnóstico |
| `ev3-m7` | Usar el laboratorio remoto con criterio |
| `ev3-m8` | Proyecto integrador |
| `ev3-m9` | Panel de control EV3 (API) |

Los módulos 1 a 8 vienen del antiguo visor "Aprendizaje" del panel (componentes React,
ya eliminados); el 9 es la práctica de uso del panel.

## Archivos

Cada carpeta `ev3-mN/` tiene:

| Archivo | Va en la Pi4 |
|---|---|
| `module.json` | `/opt/practicas-linux-api/content/ev3-mN/module.json` |
| `quiz_answers.json` | `/opt/practicas-linux-api/data/ev3-mN/quiz_answers.json` |

## Qué los hace distintos a un módulo de Linux

- Campo opcional `environment`: `panels` (Panel EV3 y cámara se abren al conectar) y
  `setup_commands` (arranque del robot y del puente). Los ejecuta el backend de la app con la
  sesión SSH institucional del estudiante. Solo se aceptan los que empiezan por
  `bash /home/pi/ev3-hop-robot.sh ` o `bash /home/pi/ev3-hop-pi5.sh `, sin saltos de línea.
  Los scripts de salto deben ser ejecutables (755) por las cuentas de los estudiantes.
- Bloque `code_block` (`{ type, id, language, code, caption? }`) para los fragmentos de Python.
  Las apps anteriores a este cambio lo ignoran (no se rompen, solo no ven el código).
- Sin reglas de comando: solo quiz. Como el validador exige todo el quiz correcto, cada
  pregunta cuenta. Los textos usan solo **negrita** y `código` en línea.

## Despliegue (lo corre una persona con acceso a la Pi4)

```bash
# 1. Validar el JSON
for f in ev3-m*/module.json ev3-m*/quiz_answers.json; do python -m json.tool "$f" > /dev/null || echo "MAL: $f"; done

# 2. En la Pi4, respaldar el ev3-m1 que ya exista (era "Panel de control EV3 (API)", hoy ev3-m9)
cp -a /opt/practicas-linux-api/content/ev3-m1 /opt/practicas-linux-api/content.ev3-m1.bak.$(date +%s)

# 3. Copiar cada carpeta (scp a /tmp y luego install, con dueño pi:pi y 644, como linux-m1)
# 4. Verificar (los módulos se autodescubren)
curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8770/practices | python -m json.tool | grep ev3-
```

El respaldo va **fuera** de `content/`: el listado busca `*/module.json` y una carpeta
`ev3-m1.bak.*` con módulo adentro aparecería como práctica.

La API la comparten otras personas del equipo: avisar antes de tocarla.

## Limitación conocida

Sin pasos de comando, el chat entrega todo el contenido de golpe al conectar y agrupa las
preguntas al final, en un solo mensaje.
