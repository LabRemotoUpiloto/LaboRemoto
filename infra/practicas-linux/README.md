# Práctica de Linux

Contenido de la práctica de Linux que sirve la API de prácticas de la Raspberry Pi (puerto 8770, por el túnel SSH de la app). Cada módulo es una carpeta con dos archivos:

- `module.json`: el módulo (bloques de texto, imágenes, videos, pasos con comando, preguntas y reglas de validación).
- `quiz_answers.json`: la respuesta correcta de cada pregunta. En la Pi vive aparte, en `data/<módulo>/`, y nunca viaja a la app.

| Módulo | Orden | Tema |
|---|---|---|
| `linux-m1` | 1 | ¿Qué es Linux? Primeros pasos en la terminal |
| `linux-m2` | 2 | Navegación y archivos |
| `linux-permisos` | 3 | Tus archivos de cerca: permisos |
| `linux-m3` | 4 | Editor sin miedo y tuberías |
| `linux-archivos` | 5 | Tu espacio de trabajo: crear, copiar, mover y borrar (insignia «Administrador jr.») |
| `linux-programa` | 6 | Tu primer programa: un script con nano, `chmod +x` y `./` (insignia «Programador jr.») |
| `linux-incidente` | 7 | Tu primer incidente: proyecto integrador sin los comandos a la vista (insignia «Operador jr.») |

El orden en que se muestran lo da el campo `order`, no el nombre de la carpeta.

## Qué está aquí y qué no

Esta carpeta es la **fuente** del texto, las preguntas y las reglas. Los videos y los diagramas (`media/`) pesan demasiado para git y viven solo en la Pi, en `content/<módulo>/media/`. Un bloque `media` solo nombra el archivo; si el archivo no está en la Pi, el bloque queda roto.

## Pósters premio

Al terminar un módulo, después de la insignia, se desbloquea un póster que queda en el Perfil (catálogo en `Cliente-Rust/frontend/src/features/practicas/posters.service.ts`). El del M1 es `diagrams/cheatsheet_bonus.png`; los de los módulos 2 a 7 son chuletas con los comandos de cada módulo, en `diagrams/chuleta-m2.png` … `chuleta-m7.png` de su carpeta en la Pi.

Las chuletas se generan con `python posters/generar_chuletas.py [m2 m3 …]` (Windows, usa Edge sin ventana): el texto está en ese archivo. Si cambian los comandos de un módulo, edita su entrada, regenera y sube el PNG a `content/<módulo>/media/diagrams/` con el mismo nombre.

## Cómo se edita

1. Edita `module.json` y `quiz_answers.json` aquí.
2. Corre `python test_content_integrity.py`: comprueba que el checkpoint nombre todas las reglas, que cada paso tenga una regla alcanzable y que cada pregunta tenga una respuesta que sea una de sus opciones. No juzga la calidad pedagógica.
3. Antes de subir a la Pi, compara con lo que hay vivo: otras personas también editan esos archivos allí y los pisan si copias una versión vieja. Haz un respaldo (`*.bak.<fecha>`) y verifica después con `GET /practices` y `GET /practices/<módulo>` por el túnel.

## Reglas del contenido

- Las preguntas tienen 4 opciones de largo parecido y la correcta repartida entre a, b, c y d. La opción correcta no debe ser la más larga.
- Un término nuevo se explica la primera vez que aparece (por ejemplo `sudo` o *argumento*).
- Un texto no repite lo que ya dijo el video del mismo paso.
- La validación de un comando lo compara como lo entiende bash (`validation.py`): no importan los espacios de más, el tipo de comillas, el orden de las opciones cortas (`ls -la` = `ls -l -a`), el `./` o la `/` final de una ruta, ni `cd ~` frente a `cd`; una línea con `;` o `&&` cuenta cada comando. Sí importan las mayúsculas (salvo en el texto de `echo`), así que el `target` va tal cual se escribe en bash. `"fuzzy": true` además acepta el target como parte del comando: úsalo en desafíos abiertos. Pruebas: `python test_validation.py`.
- Los textos usan voseo, como el resto del módulo.
