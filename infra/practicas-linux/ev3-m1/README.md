# Módulo `ev3-m1` — Panel de control EV3 (API)

Módulo de la API de prácticas (`/opt/practicas-linux-api/` en la Pi4, puerto 8770).
La app lo muestra en la tarjeta **Eve3** porque su id empieza por `ev3-`
(`module_category` en `backend/src/cmd/practices/linux_api.rs`).

## Archivos

| Archivo | Va en la Pi4 |
|---|---|
| `module.json` | `/opt/practicas-linux-api/content/ev3-m1/module.json` |
| `quiz_answers.json` | `/opt/practicas-linux-api/data/ev3-m1/quiz_answers.json` |

## Qué hace distinto a un módulo de Linux

`module.json` trae un campo opcional `environment`:

- `panels.robot_dashboard` / `panels.camera`: la app abre el Panel EV3 y la cámara al conectar.
- `setup_commands`: comandos de arranque (robot y puente HTTP). Los ejecuta el backend de la
  app con la sesión SSH institucional del estudiante, **no** el frontend. Solo se aceptan los que
  empiezan por `bash /home/pi/ev3-hop-robot.sh ` o `bash /home/pi/ev3-hop-pi5.sh `, sin saltos de línea.

Requisito en la Pi4: los scripts `/home/pi/ev3-hop-robot.sh` y `/home/pi/ev3-hop-pi5.sh`
deben ser ejecutables (755) por las cuentas de los estudiantes.

## Despliegue (lo corre una persona con acceso a la Pi4)

```bash
# 1. Validar el JSON antes de subirlo
python -m json.tool module.json > /dev/null && python -m json.tool quiz_answers.json > /dev/null

# 2. En la Pi4: carpetas y respaldo si ya existían
sudo mkdir -p /opt/practicas-linux-api/content/ev3-m1 /opt/practicas-linux-api/data/ev3-m1
sudo cp -a /opt/practicas-linux-api/content/ev3-m1 /opt/practicas-linux-api/content/ev3-m1.bak.$(date +%s)

# 3. Copiar (scp desde este directorio) y dejar los mismos dueños que los demás módulos
sudo cp module.json /opt/practicas-linux-api/content/ev3-m1/
sudo cp quiz_answers.json /opt/practicas-linux-api/data/ev3-m1/
ls -l /opt/practicas-linux-api/content/ /opt/practicas-linux-api/data/   # copiar dueño/permisos de linux-m1

# 4. Verificar (los módulos se autodescubren; si el servicio cachea, reiniciarlo)
curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8770/practices | python -m json.tool | grep ev3-m1
curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8770/practices/ev3-m1 | python -m json.tool | head
```

La API la comparten otras personas del equipo: avisar antes de tocarla.

## Pendiente conocido

Al no tener reglas de comando, el quiz aparece junto al contenido al conectar
(no espera a que se termine de usar el panel).
