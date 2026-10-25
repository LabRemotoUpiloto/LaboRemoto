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

El orden en que se muestran lo da el campo `order`, no el nombre de la carpeta.

## Qué está aquí y qué no

Esta carpeta es la **fuente** del texto, las preguntas y las reglas. Los videos y los diagramas (`media/`) pesan demasiado para git y viven solo en la Pi, en `content/<módulo>/media/`. Un bloque `media` solo nombra el archivo; si el archivo no está en la Pi, el bloque queda roto.

## Cómo se edita

1. Edita `module.json` y `quiz_answers.json` aquí.
2. Corre `python test_content_integrity.py`: comprueba que el checkpoint nombre todas las reglas, que cada paso tenga una regla alcanzable y que cada pregunta tenga una respuesta que sea una de sus opciones. No juzga la calidad pedagógica.
3. Antes de subir a la Pi, compara con lo que hay vivo: otras personas también editan esos archivos allí y los pisan si copias una versión vieja. Haz un respaldo (`*.bak.<fecha>`) y verifica después con `GET /practices` y `GET /practices/<módulo>` por el túnel.

## Reglas del contenido

- Las preguntas tienen 4 opciones de largo parecido y la correcta repartida entre a, b, c y d. La opción correcta no debe ser la más larga.
- Un término nuevo se explica la primera vez que aparece (por ejemplo `sudo` o *argumento*).
- Un texto no repite lo que ya dijo el video del mismo paso.
- La validación de un comando exige coincidir exacto (sin importar mayúsculas ni espacios alrededor de `|`). `"fuzzy": true` la vuelve parcial: úsalo en desafíos abiertos o cuando haya varias formas válidas de escribir lo mismo.
- Los textos usan voseo, como el resto del módulo.
