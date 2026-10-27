"""Tapa el nombre de usuario de la tarjeta de la barra lateral (abajo a la izquierda) en una captura de la app.

    python scripts/tapar-usuario.py captura.png salida.png [nombre-que-se-muestra]

Las capturas reales (scripts/capturar-ventana.ps1) muestran el usuario con el que se inició sesión. Antes de
publicarlas se sustituye por un nombre genérico. Las coordenadas son las de una ventana de 1920 px de ancho con la
barra lateral desplegada; si la ventana es de otro tamaño, el script se detiene en vez de tapar un sitio equivocado.
"""
import sys
from PIL import Image, ImageDraw, ImageFont

ANCHO_ESPERADO = 1920
# (izquierda, arriba, derecha, abajo) de la línea del nombre, medida sobre la ventana completa
CAJA_NOMBRE = (78, 946, 262, 970)


def fuente(tam):
    for nombre in ('arialbd.ttf', 'arial.ttf', 'segoeuib.ttf'):
        try:
            return ImageFont.truetype(nombre, tam)
        except OSError:
            continue
    return ImageFont.load_default()


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    entrada, salida = sys.argv[1], sys.argv[2]
    nombre = sys.argv[3] if len(sys.argv) > 3 else 'usuario'
    img = Image.open(entrada).convert('RGB')
    if img.width != ANCHO_ESPERADO:
        sys.exit(f'La captura mide {img.width} px de ancho y se esperaban {ANCHO_ESPERADO}: no se tapa nada.')
    izq, arr, der, aba = CAJA_NOMBRE
    fondo = img.getpixel((izq - 3, arr + 2))        # color de la tarjeta, justo a la izquierda del texto
    dib = ImageDraw.Draw(img)
    dib.rectangle(CAJA_NOMBRE, fill=fondo)
    dib.text((izq + 3, arr + 2), nombre, fill=(34, 34, 34), font=fuente(15))
    img.save(salida)
    print('Guardada', salida)


if __name__ == '__main__':
    main()
