"""Genera las chuletas (pósters premio) de los módulos 2 a 7 de la práctica de Linux.

Cada póster es una página HTML con el estilo de los diagramas de la práctica (panal crema, títulos rojos) y el
color de la insignia del módulo; Edge sin ventana la convierte en PNG. Las tarjetas se agrandan solas hasta llenar
el póster (ver el <script> de `pagina`).

Uso (Windows): python generar_chuletas.py [m2 m3 ...]
Los PNG quedan en una carpeta temporal (no van al repo): se suben a la Pi en
`content/<módulo>/media/diagrams/chuleta-mN.png` y la app los lista en `posters.service.ts`.
"""
import html
import subprocess
import sys
import tempfile
from pathlib import Path

SALIDA = Path(tempfile.gettempdir()) / "chuletas-linux"
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
ANCHO, ALTO, ESCALA = 1600, 1000, 1.5


def c(cmd, desc):
    return ("cmd", cmd, desc)


# Cada tarjeta: (titulo, tipo, contenido). tipo: "cmds" (lista de c()), "html" (contenido ya armado),
# "extra" (lista de c(), borde punteado), "alerta" (html, borde rojo).
POSTERS = {
    "m2": {
        "modulo": "linux-m2", "codigo": "M2", "insignia": "Explorador", "color": "#2B6E6E",
        "titulo": "Navegación y archivos",
        "sub": "Dónde estás, cómo moverte por las carpetas y cómo crear tus primeros archivos.",
        "tarjetas": [
            ("¿Dónde estoy?", "cmds", [c("pwd", "Muestra la ruta completa de la carpeta donde estás.")]),
            ("Moverse", "cmds", [
                c("cd carpeta", "Entra a una carpeta que está aquí."),
                c("cd ..", "Sube un nivel: a la carpeta de arriba."),
                c("cd /home/tu-usuario", "Va directo con la ruta completa, desde la raíz."),
                c("cd", "Solo, sin nada: vuelve a tu carpeta personal."),
            ]),
            ("Mirar", "cmds", [
                c("ls", "Lista lo que hay en la carpeta donde estás."),
                c("ls /", "Lista otra carpeta sin moverte (aquí, la raíz)."),
            ]),
            ("Crear y mostrar", "cmds", [
                c("touch notas.txt", "Crea un archivo vacío. Si ya existe, no lo borra."),
                c('echo "hola mundo"', "Muestra en pantalla el texto entre comillas."),
            ]),
            ("Las rutas en 4 símbolos", "html", """
                <table class="tabla">
                  <tr><td><code>/</code></td><td>La raíz: de ahí cuelga todo el sistema.</td></tr>
                  <tr><td><code>..</code></td><td>La carpeta de arriba.</td></tr>
                  <tr><td><code>.</code></td><td>Esta carpeta, donde estás.</td></tr>
                  <tr><td><code>~</code></td><td>Tu carpeta personal.</td></tr>
                </table>"""),
            ("Relativa o absoluta", "html", """
                <p><b>Relativa</b>: depende de dónde estés. <code>cd fotos</code> solo funciona si <i>fotos</i> está aquí.</p>
                <p><b>Absoluta</b>: empieza con <code>/</code> y funciona desde cualquier lado.
                   <code>cd /home</code> siempre lleva al mismo sitio.</p>"""),
            ("Extra: para ir más lejos", "extra", [
                c("cd -", "Vuelve a la carpeta donde estabas antes."),
                c("ls ~", "Lista tu carpeta personal desde cualquier lado."),
                c("ls -l", "Lista con detalles (lo verás en el módulo 3)."),
            ]),
        ],
        "recuerda": "Antes de crear o mover algo, <code>pwd</code>: saber dónde estás evita la mitad de los errores.",
    },
    "m3": {
        "modulo": "linux-permisos", "codigo": "M3", "insignia": "Guardián", "color": "#B4531B",
        "titulo": "Permisos",
        "sub": "Mirar tus archivos de cerca, leer sus permisos y cambiarlos para ejecutar un programa.",
        "tarjetas": [
            ("Mirar de cerca", "cmds", [
                c("ls -l", "Lista larga: permisos, dueño, tamaño y fecha."),
                c("ls -a", "Muestra también los ocultos (empiezan con punto)."),
                c("file notas.txt", "Dice qué hay de verdad adentro del archivo."),
                c("clear", "Limpia la pantalla sin borrar nada."),
            ]),
            ("Cómo se leen los permisos", "html", """
                <div class="permiso"><span class="t">-</span><span class="d">rwx</span><span class="g">r-x</span><span class="o">r--</span></div>
                <table class="tabla">
                  <tr><td><code>-</code></td><td>Tipo: <code>-</code> archivo, <code>d</code> carpeta.</td></tr>
                  <tr><td><code class="d">rwx</code></td><td>Lo que puede el <b>dueño</b> (tú).</td></tr>
                  <tr><td><code class="g">r-x</code></td><td>Lo que puede el <b>grupo</b>.</td></tr>
                  <tr><td><code class="o">r--</code></td><td>Lo que pueden <b>los demás</b>.</td></tr>
                </table>
                <p><code>r</code> leer · <code>w</code> escribir · <code>x</code> ejecutar · <code>-</code> no puede.</p>"""),
            ("Permisos en número", "html", """
                <p class="grande"><code>r = 4</code> · <code>w = 2</code> · <code>x = 1</code></p>
                <table class="tabla">
                  <tr><td><code>7</code></td><td><code>rwx</code></td><td>todo (4+2+1)</td></tr>
                  <tr><td><code>6</code></td><td><code>rw-</code></td><td>leer y escribir</td></tr>
                  <tr><td><code>5</code></td><td><code>r-x</code></td><td>leer y ejecutar</td></tr>
                  <tr><td><code>4</code></td><td><code>r--</code></td><td>solo leer</td></tr>
                </table>
                <p><code>754</code> = <code class="d">rwx</code> dueño · <code class="g">r-x</code> grupo · <code class="o">r--</code> demás.</p>"""),
            ("Cambiar y ejecutar", "cmds", [
                c("chmod 754 mi-programa", "Cambia los permisos con números."),
                c("./mi-programa", "Ejecuta un programa de esta carpeta."),
            ]),
            ("Si dice «Permission denied»", "alerta", """
                <p>Es «permiso denegado»: al archivo le falta la <code>x</code>. Revisa con <code>ls -l</code>, dale el
                permiso con <code>chmod</code> y vuelve a intentar.</p>"""),
            ("Extra: para ir más lejos", "extra", [
                c("chmod +x archivo", "Agrega la x sin tocar lo demás (módulo 6)."),
                c("chmod 644 notas.txt", "El típico de un texto: rw-r--r--."),
                c("stat notas.txt", "Todos los datos del archivo, en una lista."),
            ]),
        ],
        "recuerda": "Un programa necesita la <code>x</code> para ejecutarse con <code>./</code>: sin ella, Linux responde «Permission denied».",
    },
    "m4": {
        "modulo": "linux-m3", "codigo": "M4", "insignia": "Editor", "color": "#5B3A8E",
        "titulo": "Editor sin miedo y tuberías",
        "sub": "Escribir archivos con nano, contar lo que tienen y encadenar comandos.",
        "tarjetas": [
            ("Editar con nano", "cmds", [c("nano notas.txt", "Abre el archivo en el editor (si no existe, lo crea).")]),
            ("Atajos de nano", "html", """
                <p class="nota">En la franja de abajo, <code>^</code> es Ctrl y <code>M-</code> es Alt.</p>
                <table class="tabla atajos">
                  <tr><td><kbd>Ctrl</kbd>+<kbd>O</kbd> <kbd>Enter</kbd></td><td>Guardar</td></tr>
                  <tr><td><kbd>Ctrl</kbd>+<kbd>X</kbd></td><td>Salir</td></tr>
                  <tr><td><kbd>Ctrl</kbd>+<kbd>K</kbd></td><td>Cortar la línea</td></tr>
                  <tr><td><kbd>Ctrl</kbd>+<kbd>U</kbd></td><td>Pegar</td></tr>
                  <tr><td><kbd>Alt</kbd>+<kbd>6</kbd></td><td>Copiar la línea</td></tr>
                  <tr><td><kbd>Alt</kbd>+<kbd>U</kbd></td><td>Deshacer</td></tr>
                  <tr><td><kbd>Ctrl</kbd>+<kbd>W</kbd></td><td>Buscar</td></tr>
                  <tr><td><kbd>Alt</kbd>+<kbd>G</kbd></td><td>Ir a una línea</td></tr>
                </table>"""),
            ("Contar", "cmds", [
                c("wc -l notas.txt", "Cuenta las líneas del archivo."),
                c("wc -w notas.txt", "Cuenta las palabras."),
            ]),
            ("Tuberías  |", "cmds", [
                c('echo "uno dos tres" | wc -w', "Da 3: el texto no sale en pantalla, entra a wc."),
                c("ls /etc | wc -l", "Cuenta cuántos archivos hay en /etc."),
            ]),
            ("La idea de la tubería", "html", """
                <p>La salida del comando de la izquierda se vuelve la entrada del de la derecha, como una manguera.</p>
                <p class="nota"><b>Ojo:</b> <code>ls -l | wc -l</code> da uno más, por la línea «total».</p>"""),
            ("Extra: para ir más lejos", "extra", [
                c("head -n 3 notas.txt", "Muestra solo las primeras 3 líneas."),
                c("ls /etc | sort -r", "Ordena la lista al revés."),
                c("history | tail -n 5", "Tus últimos 5 comandos."),
            ]),
        ],
        "recuerda": "¿Quedaste atrapado dentro de nano? <kbd>Ctrl</kbd>+<kbd>X</kbd> siempre te saca. Si borraste algo, <kbd>Alt</kbd>+<kbd>U</kbd>.",
    },
    "m5": {
        "modulo": "linux-archivos", "codigo": "M5", "insignia": "Administrador jr.", "color": "#1F6B45",
        "titulo": "Tu espacio de trabajo",
        "sub": "Crear, copiar, mover, renombrar y borrar archivos y carpetas.",
        "tarjetas": [
            ("Ubicarse", "cmds", [
                c("cd", "Vuelve a tu carpeta personal."),
                c("cd proyecto", "Entra a la carpeta proyecto."),
                c("pwd", "Muestra dónde estás."),
            ]),
            ("Crear", "cmds", [
                c("mkdir proyecto", "Crea una carpeta."),
                c("mkdir borradores final", "Crea varias a la vez."),
                c('echo "Informe del proyecto" > informe.txt', "Crea un archivo con ese texto. Si existía, lo reemplaza."),
            ]),
            ("Ver", "cmds", [
                c("ls", "Lo que hay donde estás."),
                c("ls borradores", "Lo que hay adentro de otra carpeta, sin entrar."),
                c("cat informe.txt", "Muestra lo que tiene adentro un archivo."),
            ]),
            ("Copiar, mover y renombrar", "cmds", [
                c("cp informe.txt borradores/informe-v1.txt", "Copia: el original se queda donde estaba."),
                c("mv informe.txt final", "Mueve el archivo adentro de la carpeta final."),
                c("mv viejo.txt nuevo.txt", "Renombra: mismo lugar, otro nombre."),
            ]),
            ("Origen → destino", "html", """
                <p><code>cp</code> y <code>mv</code> reciben primero <b>qué</b> y después <b>adónde</b>.</p>
                <p><code>borradores/informe-v1.txt</code> se lee «el archivo <i>informe-v1.txt</i> adentro de <i>borradores</i>».</p>"""),
            ("rm no tiene papelera", "alerta", """
                <p><code>rm informe.txt</code> borra el archivo <b>para siempre</b>. Revisa con <code>ls</code> antes de borrar.</p>"""),
            ("Extra: para ir más lejos", "extra", [
                c('echo "otra línea" >> informe.txt', "Con >> agrega al final sin borrar lo anterior."),
                c("cp -r proyecto copia", "Copia una carpeta entera."),
                c("rmdir borradores", "Borra una carpeta, solo si está vacía."),
            ]),
        ],
        "recuerda": "Cuando un comando sale bien, muchas veces no dice nada: en Linux, el silencio es buena señal.",
    },
    "m6": {
        "modulo": "linux-programa", "codigo": "M6", "insignia": "Programador jr.", "color": "#A32D5B",
        "titulo": "Tu primer programa",
        "sub": "Escribir un script de bash, darle permiso y ejecutarlo de las dos formas.",
        "tarjetas": [
            ("hola.sh", "html", """
                <pre class="codigo"><span class="sb">#!/bin/bash</span>
echo "Hola desde mi primer programa"
whoami
echo "Estoy en la computadora:"
hostname</pre>
                <p class="nota">La primera línea dice qué programa lee el archivo: el <b>intérprete</b> (aquí, bash).</p>"""),
            ("El camino completo", "cmds", [
                c("nano hola.sh", "1. Escribirlo. Ctrl+O, Enter y Ctrl+X."),
                c("cat hola.sh", "2. Revisar lo que quedó guardado."),
                c("chmod +x hola.sh", "3. Darle permiso de ejecutar."),
                c("ls -l hola.sh", "4. Comprobar que ya tiene la x."),
                c("./hola.sh", "5. Ejecutarlo."),
            ]),
            ("Dos formas de ejecutar", "html", """
                <table class="tabla">
                  <tr><td><code>bash hola.sh</code></td><td>Bash lee el archivo. No necesita la <code>x</code>.</td></tr>
                  <tr><td><code>./hola.sh</code></td><td>Lo ejecuta el sistema: necesita la <code>x</code> y la línea <code>#!/bin/bash</code>.</td></tr>
                </table>"""),
            ("Si algo falla", "alerta", """
                <p>«Permission denied» → falta la <code>x</code>: <code>chmod +x hola.sh</code>.</p>
                <p>«command not found» al escribir <code>hola.sh</code> → falta el <code>./</code> delante.</p>"""),
            ("Extra: para ir más lejos", "extra", [
                c('nombre="Ana"', "Guarda un dato en una variable…"),
                c('echo "Hola $nombre"', "…y úsalo con $ delante."),
                c("./hola.sh Ana", "Dentro del script, $1 vale «Ana»."),
                c("date", "Agrégalo al script y muestra la fecha y la hora."),
            ]),
        ],
        "recuerda": "El permiso se queda con el archivo: si editas el script con nano, no hace falta volver a darle <code>chmod +x</code>.",
    },
    "m7": {
        "modulo": "linux-incidente", "codigo": "M7", "insignia": "Operador jr.", "color": "#0E5A8A",
        "titulo": "Resolver un incidente",
        "sub": "Un método para arreglar problemas y los mensajes de error que vas a ver más seguido.",
        "tarjetas": [
            ("El método en 5 pasos", "html", """
                <ol class="pasos">
                  <li><b>Ubícate</b>: <code>pwd</code> y <code>ls</code>.</li>
                  <li><b>Lee el error completo</b>: casi siempre dice qué pasa.</li>
                  <li><b>Arregla una cosa a la vez.</b></li>
                  <li><b>Comprueba</b>: vuelve a ejecutar lo que fallaba.</li>
                  <li><b>Respalda y anota</b> lo que hiciste.</li>
                </ol>"""),
            ("Qué dice el error y qué hacer", "html", """
                <div class="error"><code class="msg">Permission denied</code>
                  <span>Permiso denegado: falta la <code>x</code> → <code>chmod +x archivo</code></span></div>
                <div class="error"><code class="msg">No such file or directory</code>
                  <span>El nombre o la ruta están mal, o no estás en esa carpeta → <code>pwd</code> y <code>ls</code></span></div>
                <div class="error"><code class="msg">command not found</code>
                  <span>Comando mal escrito, o te faltó el <code>./</code> → revisa y prueba <code>./programa</code></span></div>
                <div class="error"><code class="msg">File exists</code>
                  <span>Ya existía → sigue con el paso siguiente.</span></div>
                <div class="error"><code class="msg">Is a directory</code>
                  <span>Es una carpeta, no un archivo → <code>ls carpeta</code></span></div>"""),
            ("Lo que usaste en el incidente", "cmds", [
                c("chmod +x reporte.sh", "Le diste el permiso que faltaba."),
                c("./reporte.sh", "Comprobaste que ya funciona."),
                c("cp reporte.sh respaldo", "Guardaste una copia."),
                c("cat respaldo/reporte.sh", "Revisaste la copia."),
                c('echo "Arregle los permisos" > notas.txt', "Dejaste anotado qué hiciste."),
                c("ls | wc -l", "Contaste lo que hay en la carpeta."),
            ]),
            ("Todo lo que ya sabes", "html", """
                <table class="tabla indice">
                  <tr><td>M1</td><td><code>whoami</code> <code>hostname</code> <code>clear</code> <code>uname -a</code></td></tr>
                  <tr><td>M2</td><td><code>pwd</code> <code>cd</code> <code>ls</code> <code>touch</code> <code>echo</code></td></tr>
                  <tr><td>M3</td><td><code>ls -l</code> <code>ls -a</code> <code>file</code> <code>chmod</code></td></tr>
                  <tr><td>M4</td><td><code>nano</code> <code>wc</code> <code>|</code></td></tr>
                  <tr><td>M5</td><td><code>mkdir</code> <code>cat</code> <code>cp</code> <code>mv</code> <code>rm</code> <code>&gt;</code></td></tr>
                  <tr><td>M6</td><td><code>bash</code> <code>./</code> <code>chmod +x</code> <code>#!/bin/bash</code></td></tr>
                </table>"""),
        ],
        "recuerda": "Ningún incidente se arregla adivinando: primero entiende qué pasa, después cambia una sola cosa y comprueba.",
    },
}

CSS = """
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: %(ancho)dpx; height: %(alto)dpx; overflow: hidden; }
body {
  font-family: 'Segoe UI', 'Segoe UI Variable', sans-serif; color: #1c1c1c;
  background-color: #F7F3E8;
  background-image: url("data:image/svg+xml,%%3Csvg xmlns='http://www.w3.org/2000/svg' width='112' height='194'%%3E%%3Cpath d='M56 130L0 97V32L56 0L112 32V97L56 130V194' fill='none' stroke='%%23E5DFD1' stroke-width='3'/%%3E%%3C/svg%%3E");
  background-size: 112px 194px;
  padding: 34px 44px 0;
  display: flex; flex-direction: column;
}
code, kbd, pre { font-family: 'Cascadia Mono', 'Consolas', monospace; }
.cabecera { display: flex; align-items: center; gap: 22px; }
.medalla { width: 92px; height: 92px; border-radius: 50%%; background: var(--c); display: grid; place-items: center; flex-shrink: 0;
  box-shadow: 0 6px 16px rgba(0,0,0,.18); }
.medalla span { width: 70px; height: 70px; border-radius: 50%%; background: #F7CD3D; display: grid; place-items: center;
  font-weight: 800; font-size: 26px; color: var(--c); border: 3px solid rgba(255,255,255,.55); }
.etiqueta { font-size: 14px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: var(--c); }
h1 { font-size: 44px; font-weight: 800; color: #E21F19; line-height: 1.1; margin-top: 2px; }
.sub { font-size: 19px; color: #4a4a4a; margin-top: 4px; }
.cuerpo { flex: 1; min-height: 0; overflow: hidden; column-count: 3; column-gap: 22px; margin-top: 22px; padding-bottom: 6px; }
.tarjeta { break-inside: avoid; background: #fff; border: 1.5px solid #1c1c1c; border-radius: 14px; padding: 13px 16px 12px;
  margin-bottom: 16px; box-shadow: 0 6px 14px rgba(0,0,0,.07); }
.tarjeta h2 { font-size: 13.5px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: var(--c); margin-bottom: 9px;
  white-space: pre; }
.tarjeta.extra { border-style: dashed; border-color: var(--c); background: rgba(255,255,255,.88); }
.tarjeta.alerta { border-color: #E21F19; border-width: 2px; }
.tarjeta.alerta h2 { color: #E21F19; }
.fila { margin-bottom: 8px; }
.fila:last-child { margin-bottom: 0; }
.fila code.cmd { display: inline-block; background: #211D16; color: #F4EAD0; border-radius: 7px; padding: 3px 9px; font-size: 15.5px; }
.fila .desc { display: block; font-size: 14.5px; color: #3a3a3a; margin: 3px 0 0 2px; line-height: 1.3; }
p { font-size: 14.5px; line-height: 1.4; color: #2a2a2a; margin-bottom: 6px; }
p:last-child { margin-bottom: 0; }
p code, td code, li code { white-space: nowrap; background: #F1EBDD; border-radius: 5px; padding: 0 5px; font-size: 14px; color: #7a2410; }
.nota { font-size: 13.5px; color: #555; }
.grande { font-size: 17px; }
.tabla { width: 100%%; border-collapse: collapse; margin-bottom: 6px; }
.tabla td { font-size: 14.5px; padding: 4px 6px 4px 0; vertical-align: top; border-bottom: 1px solid #EEE7D8; line-height: 1.3; }
.tabla tr:last-child td { border-bottom: 0; }
.tabla td:first-child { white-space: nowrap; }
.error { padding: 5px 0 6px; border-bottom: 1px solid #EEE7D8; }
.error:last-child { border-bottom: 0; padding-bottom: 0; }
.error code.msg { font-size: 14.5px; font-weight: 700; color: #B3160F; }
.error span { display: block; font-size: 14px; color: #2a2a2a; line-height: 1.35; margin-top: 1px; }
.errores td:first-child { font-family: 'Cascadia Mono', 'Consolas', monospace; font-size: 13px; color: #B3160F; white-space: normal; width: 34%%; }
.errores td:last-child { white-space: nowrap; }
.indice td:first-child { font-weight: 800; color: var(--c); width: 38px; }
.indice code { margin-right: 3px; line-height: 1.9; }
kbd { display: inline-block; background: #fff; border: 1.5px solid #1c1c1c; border-bottom-width: 3px; border-radius: 6px; padding: 0 6px;
  font-size: 13px; color: #1c1c1c; line-height: 1.45; }
.atajos td { padding: 3px 6px 3px 0; }
.permiso { font-family: 'Cascadia Mono', 'Consolas', monospace; font-size: 30px; font-weight: 700; margin-bottom: 8px; letter-spacing: .04em; }
.permiso .t { color: #555; } .permiso .d, code.d { color: #2B6E6E; } .permiso .g, code.g { color: #B4531B; } .permiso .o, code.o { color: #5B3A8E; }
.codigo { background: #211D16; color: #F4EAD0; border-radius: 10px; padding: 10px 12px; font-size: 12.5px; line-height: 1.5; margin-bottom: 8px;
  white-space: pre; overflow: hidden; }
.codigo .sb { color: #F7CD3D; }
.pasos { padding-left: 22px; } .pasos li { font-size: 15px; line-height: 1.45; margin-bottom: 4px; }
.pie { display: flex; justify-content: space-between; align-items: center; border-top: 1.5px solid #D9D1BF; margin: 0 -44px; padding: 12px 44px 16px;
  background: rgba(247,243,232,.92); }
.recuerda { font-size: 16px; color: #1c1c1c; }
.recuerda b { color: #E21F19; text-transform: uppercase; letter-spacing: .08em; font-size: 13.5px; margin-right: 8px; }
.marca { font-size: 12.5px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: #7c7c7c; white-space: nowrap; margin-left: 24px; }
"""


def tarjeta(titulo, tipo, contenido):
    clase = {"extra": "tarjeta extra", "alerta": "tarjeta alerta"}.get(tipo, "tarjeta")
    if tipo in ("cmds", "extra"):
        cuerpo = "".join(
            f'<div class="fila"><code class="cmd">{html.escape(cmd)}</code><span class="desc">{html.escape(desc)}</span></div>'
            for _, cmd, desc in contenido
        )
    else:
        cuerpo = contenido
    return f'<section class="{clase}"><h2>{html.escape(titulo)}</h2>{cuerpo}</section>'


def pagina(p):
    tarjetas = "".join(tarjeta(*t) for t in p["tarjetas"])
    return f"""<!doctype html><html lang="es"><head><meta charset="utf-8"><style>{CSS % {'ancho': ANCHO, 'alto': ALTO}}</style></head>
<body style="--c:{p['color']}">
  <header class="cabecera">
    <div class="medalla"><span>{p['codigo']}</span></div>
    <div>
      <div class="etiqueta">Póster premio · Insignia {html.escape(p['insignia'])}</div>
      <h1>Chuleta del módulo {p['codigo'][1:]}: {html.escape(p['titulo'])}</h1>
      <div class="sub">{html.escape(p['sub'])}</div>
    </div>
  </header>
  <main class="cuerpo">{tarjetas}</main>
  <footer class="pie">
    <div class="recuerda"><b>Recuerda</b>{p['recuerda']}</div>
    <div class="marca">Bitácora del operador — {p['codigo']}</div>
  </footer>
  <script>
    // Agranda las tarjetas hasta llenar el póster sin que nada se salga (cada módulo tiene distinto texto).
    const cuerpo = document.querySelector('.cuerpo');
    const tarjetas = [...document.querySelectorAll('.tarjeta')];
    const poner = (z) => tarjetas.forEach((t) => {{ t.style.zoom = z; }});
    const anchos = [...document.querySelectorAll('.codigo, .fila code.cmd')];
    const cabe = () => cuerpo.scrollWidth <= cuerpo.clientWidth + 1 && cuerpo.scrollHeight <= cuerpo.clientHeight + 1
      && anchos.every((e) => e.scrollWidth <= e.clientWidth + 1 && e.getBoundingClientRect().right <= e.closest('.tarjeta').getBoundingClientRect().right);
    let z = 1;
    while (z < 1.7) {{ poner(z + 0.02); if (!cabe()) {{ poner(z); break; }} z += 0.02; }}
  </script>
</body></html>"""


def main():
    SALIDA.mkdir(exist_ok=True)
    claves = sys.argv[1:] or list(POSTERS)
    for clave in claves:
        p = POSTERS[clave]
        fuente = SALIDA / f"{clave}.html"
        fuente.write_text(pagina(p), encoding="utf-8")
        png = SALIDA / f"chuleta-{clave}.png"
        subprocess.run([
            EDGE, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
            f"--user-data-dir={SALIDA / 'perfil-edge'}",
            f"--force-device-scale-factor={ESCALA}", f"--window-size={ANCHO},{ALTO}",
            f"--screenshot={png}", fuente.as_uri(),
        ], check=True, capture_output=True, timeout=90)
        print(f"{clave}: {png} ({png.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
