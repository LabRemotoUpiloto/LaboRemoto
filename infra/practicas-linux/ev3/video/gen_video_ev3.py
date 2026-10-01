#!/usr/bin/env python3
"""Video introductorio del módulo 1 de EV3 ("Conociendo el EV3").

Mismo estilo que el video del módulo 1 de Linux: escenas que alternan fondo
amarillo con la mascota Prof. Bee, fondo oscuro y fondo crema con panal,
tarjetas de colores y subtítulos en una barra oscura abajo. 1280x720 a 30 fps.

Uso:
  python gen_video_ev3.py --export-script frases_elevenlabs.txt   # guion para las voces
  python gen_video_ev3.py --sheet hoja.png                        # hoja de contacto (iterar el diseño)
  python gen_video_ev3.py --out borrador.mp4                      # sin voz: duraciones estimadas
  python gen_video_ev3.py --audio-dir <carpeta con 01.mp3..14.mp3> --out video.mp4

Con --audio-dir las escenas y los subtítulos se alinean a la duración real de
cada frase (se recortan los silencios de cada archivo). Necesita Pillow, numpy y
ffmpeg/ffprobe en el PATH. La mascota se toma de Cliente-Rust/frontend/public.
"""
from __future__ import annotations

import argparse
import math
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

W, H, FPS = 1280, 720, 30
SS = 1.5  # se dibuja a 1920x1080 y se reduce: bordes suaves
RW, RH = int(W * SS), int(H * SS)

REPO = Path(__file__).resolve().parents[4]
PUBLIC = REPO / "Cliente-Rust" / "frontend" / "public"
FONTS = Path("C:/Windows/Fonts")

# --- paleta (tomada del video de Linux) -------------------------------------
YELLOW, YELLOW_HEX = (248, 202, 65), (238, 188, 48)
DARK, DARK_HEX = (28, 26, 20), (38, 35, 27)
CREAM, CREAM_HEX = (248, 243, 231), (236, 229, 211)
RED = (214, 40, 40)
INK = (30, 28, 22)
WHITE = (246, 242, 236)
BAR = (26, 24, 19)
GREEN_C, BLUE_C, OCRE_C, RED_C = (59, 77, 69), (58, 68, 104), (154, 123, 46), (176, 74, 58)
ORANGE, SKY = (230, 150, 40), (60, 150, 220)

# --- guion -------------------------------------------------------------------
# (escena, texto del subtítulo, texto para la voz). En la voz las palabras en
# inglés se escriben como suenan (Línux, Páiton, Dáshbord, E-V tres).
PHRASES: list[tuple[int, str, str]] = [
    (0, "Bienvenido al primer módulo de robótica. Aquí vas a conocer al robot con el que vas a trabajar: el EV3.",
        "Bienvenido al primer módulo de robótica. Aquí vas a conocer al robot con el que vas a trabajar: el E-V tres."),
    (1, "El EV3 es un robot de LEGO para aprender robótica. Su pieza central es el ladrillo: una computadora pequeña con pantalla, botones y batería.",
        "El E-V tres es un robot de LEGO para aprender robótica. Su pieza central es el ladrillo: una computadora pequeña con pantalla, botones y batería."),
    (1, "Dentro del ladrillo corre Linux, con un programa en Python que escucha pedidos por la red.",
        "Dentro del ladrillo corre Línux, con un programa en Páiton que escucha pedidos por la red."),
    (2, "Por eso puedes controlarlo desde esta aplicación, aunque el robot esté en otro lugar. A eso se le llama laboratorio remoto.",
        "Por eso puedes controlarlo desde esta aplicación, aunque el robot esté en otro lugar. A eso se le llama laboratorio remoto."),
    (2, "Tu orden sale del panel, pasa por un puente y llega al robot.",
        "Tu orden sale del panel, pasa por un puente y llega al robot."),
    (3, "Todo robot necesita dos cosas: una forma de percibir el mundo y una forma de actuar sobre él.",
        "Todo robot necesita dos cosas: una forma de percibir el mundo y una forma de actuar sobre él."),
    (3, "Los sensores son sus sentidos: miden el contacto, la distancia, el color o el giro, y lo convierten en un número.",
        "Los sensores son sus sentidos: miden el contacto, la distancia, el color o el giro, y lo convierten en un número."),
    (3, "Los actuadores son sus músculos: reciben una orden y producen un movimiento. En el EV3, son los motores.",
        "Los actuadores son sus músculos: reciben una orden y producen un movimiento. En el E-V tres, son los motores."),
    (4, "Todo se conecta al ladrillo por ocho puertos. Los cuatro de arriba, de la A a la D, son para los motores.",
        "Todo se conecta al ladrillo por ocho puertos. Los cuatro de arriba, de la A a la D, son para los motores."),
    (4, "Los cuatro de abajo, del uno al cuatro, son para los sensores. Un motor recibe órdenes; un sensor solo informa.",
        "Los cuatro de abajo, del uno al cuatro, son para los sensores. Un motor recibe órdenes; un sensor solo informa."),
    (5, "Cada rueda tiene su propia potencia, desde menos cien hasta cien por ciento.",
        "Cada rueda tiene su propia potencia, desde menos cien hasta cien por ciento."),
    (5, "Si las dos giran igual, el robot avanza recto. Si giran en sentidos opuestos, gira en su sitio. Y si una es más lenta, traza una curva.",
        "Si las dos giran igual, el robot avanza recto. Si giran en sentidos opuestos, gira en su sitio. Y si una es más lenta, traza una curva."),
    (6, "Ahora abre el panel del EV3: en el Dashboard mueve un motor y mira cómo cambian los sensores.",
        "Ahora abre el panel del E-V tres: en el Dáshbord mueve un motor y mira cómo cambian los sensores."),
    (6, "Después responde las preguntas del módulo. ¡Vamos a practicar!",
        "Después responde las preguntas del módulo. ¡Vamos a practicar!"),
]
N_SCENES = 7
LEAD, GAP, TAIL = 0.6, 0.45, 1.4  # segundos: antes de la 1ª frase, entre frases, al final


# --- utilidades --------------------------------------------------------------
def clamp(v: float, a: float = 0.0, b: float = 1.0) -> float:
    return max(a, min(b, v))


def ease(p: float) -> float:
    p = clamp(p)
    return 1 - (1 - p) ** 3


def anim(t: float, t0: float, dur: float = 0.5) -> float:
    return ease((t - t0) / dur)


_FONTS: dict = {}
FONT_FILES = {"reg": "segoeui.ttf", "b": "segoeuib.ttf", "sb": "seguisb.ttf", "black": "seguibl.ttf", "mono": "consola.ttf", "monob": "consolab.ttf"}


def F(kind: str, size: float) -> ImageFont.FreeTypeFont:
    key = (kind, size)
    if key not in _FONTS:
        _FONTS[key] = ImageFont.truetype(str(FONTS / FONT_FILES[kind]), int(size * SS))
    return _FONTS[key]


_BG: dict = {}


def background(theme: str) -> Image.Image:
    """Fondo con panal (hexágonos de punta)."""
    if theme in _BG:
        return _BG[theme]
    base, line = {"yellow": (YELLOW, YELLOW_HEX), "dark": (DARK, DARK_HEX), "cream": (CREAM, CREAM_HEX)}[theme]
    img = Image.new("RGB", (RW, RH), base)
    d = ImageDraw.Draw(img)
    r = 46 * SS
    hw = r * math.sqrt(3) / 2
    row = 0
    y = 0.0
    while y < RH + r:
        x = (hw if row % 2 else 0.0)
        while x < RW + hw:
            pts = [(x + r * math.cos(math.radians(60 * k - 30)), y + r * math.sin(math.radians(60 * k - 30))) for k in range(6)]
            d.polygon(pts, outline=line)
            x += 2 * hw
        y += 1.5 * r
        row += 1
    _BG[theme] = img
    return img


_SPRITES: dict = {}


def load_prof() -> Image.Image:
    """Prof. Bee: el JPEG trae fondo blanco; se vuelve transparente desde los bordes."""
    src = Image.open(PUBLIC / "abeja-Profesor.jpeg").convert("RGB")
    key = (255, 0, 255)
    for corner in [(0, 0), (src.width - 1, 0), (0, src.height - 1), (src.width - 1, src.height - 1)]:
        ImageDraw.floodfill(src, corner, key, thresh=28)
    a = np.array(src)
    mask = ~((a[..., 0] == 255) & (a[..., 1] == 0) & (a[..., 2] == 255))
    rgba = np.dstack([a, (mask * 255).astype(np.uint8)])
    im = Image.fromarray(rgba, "RGBA")
    alpha = im.getchannel("A").filter(ImageFilterMin(3))
    im.putalpha(alpha)
    return im.crop(im.getbbox())


def ImageFilterMin(size: int):
    from PIL import ImageFilter
    return ImageFilter.MinFilter(size)


def sprite(name: str, height: float) -> Image.Image:
    key = (name, round(height))
    if key not in _SPRITES:
        if name not in _SPRITES:
            _SPRITES[name] = load_prof()
        base = _SPRITES[name]
        h = int(height * SS)
        _SPRITES[key] = base.resize((int(base.width * h / base.height), h), Image.LANCZOS)
    return _SPRITES[key]


class Canvas:
    """Lienzo en coordenadas de 1280x720 que dibuja a 1.5x."""

    def __init__(self, theme: str):
        self.img = background(theme).copy()
        self.d = ImageDraw.Draw(self.img, "RGBA")

    @staticmethod
    def _c(color, alpha):
        return (*color[:3], int(255 * clamp(alpha)))

    def text(self, xy, s, font, fill, anchor="la", alpha=1.0):
        self.d.text((xy[0] * SS, xy[1] * SS), s, font=font, fill=self._c(fill, alpha), anchor=anchor)

    def rrect(self, box, r, fill=None, outline=None, width=2, alpha=1.0):
        self.d.rounded_rectangle([v * SS for v in box], r * SS, fill=self._c(fill, alpha) if fill else None,
                                 outline=self._c(outline, alpha) if outline else None, width=int(width * SS))

    def rect(self, box, fill=None, outline=None, width=2, alpha=1.0):
        self.d.rectangle([v * SS for v in box], fill=self._c(fill, alpha) if fill else None,
                         outline=self._c(outline, alpha) if outline else None, width=int(width * SS))

    def ellipse(self, box, fill=None, outline=None, width=2, alpha=1.0):
        self.d.ellipse([v * SS for v in box], fill=self._c(fill, alpha) if fill else None,
                       outline=self._c(outline, alpha) if outline else None, width=int(width * SS))

    def line(self, pts, fill, width=2, alpha=1.0):
        self.d.line([(x * SS, y * SS) for x, y in pts], fill=self._c(fill, alpha), width=max(1, int(width * SS)))

    def poly(self, pts, fill, alpha=1.0):
        self.d.polygon([(x * SS, y * SS) for x, y in pts], fill=self._c(fill, alpha))

    def sprite(self, name, xy, height, alpha=1.0):
        sp = sprite(name, height)
        if alpha < 1:
            sp = sp.copy()
            sp.putalpha(sp.getchannel("A").point(lambda v: int(v * clamp(alpha))))
        self.img.paste(sp, (int(xy[0] * SS), int(xy[1] * SS)), sp)

    def text_width(self, s, font) -> float:
        return self.d.textlength(s, font=font) / SS


def title(c: Canvas, s: str, t: float, color, t0: float = 0.1):
    a = anim(t, t0, 0.5)
    c.text((56 - (1 - a) * 30, 40), s, F("b", 34), color, alpha=a)


def chip(c: Canvas, x, y, label, fill, t, t0, fg=WHITE, size=17):
    a = anim(t, t0, 0.4)
    if a <= 0:
        return 0
    w = c.text_width(label, F("sb", size)) + 34
    c.rrect((x, y + (1 - a) * 14, x + w, y + 38 + (1 - a) * 14), 19, fill=fill, alpha=a)
    c.text((x + w / 2, y + 19 + (1 - a) * 14), label, F("sb", size), fg, anchor="mm", alpha=a)
    return w


# --- dibujos -----------------------------------------------------------------
def draw_brick(c: Canvas, x, y, w, h, alpha=1.0, ports=False, hl_top=0.0, hl_bottom=0.0):
    """Ladrillo EV3 visto de frente (esquemático). `ports` dibuja las 8 entradas/salidas."""
    c.rrect((x + 6, y + 10, x + w + 6, y + h + 10), 22, fill=(0, 0, 0), alpha=0.22 * alpha)
    c.rrect((x, y, x + w, y + h), 22, fill=(206, 207, 209), outline=(120, 120, 126), width=3, alpha=alpha)
    c.rrect((x + w * 0.05, y + h * 0.07, x + w * 0.95, y + h * 0.93), 16, outline=(176, 176, 182), width=2, alpha=alpha)
    # pantalla
    sx0, sy0, sx1, sy1 = x + w * 0.30, y + h * 0.16, x + w * 0.70, y + h * 0.54
    c.rrect((sx0, sy0, sx1, sy1), 8, fill=(158, 182, 148), outline=(70, 80, 70), width=3, alpha=alpha)
    c.text(((sx0 + sx1) / 2, (sy0 + sy1) / 2 - 6), "EV3", F("monob", max(14, w * 0.075)), (50, 70, 50), anchor="mm", alpha=alpha)
    c.text(((sx0 + sx1) / 2, (sy0 + sy1) / 2 + w * 0.05), "^_^", F("monob", max(12, w * 0.06)), (50, 70, 50), anchor="mm", alpha=alpha)
    # botones
    bx, by, br = x + w * 0.5, y + h * 0.76, w * 0.05
    c.ellipse((bx - br, by - br, bx + br, by + br), fill=(60, 60, 64), alpha=alpha)
    for dx, dy in [(-2.3, 0), (2.3, 0), (0, -2.0), (0, 2.0)]:
        r2 = br * 0.78
        c.ellipse((bx + dx * br - r2, by + dy * br - r2, bx + dx * br + r2, by + dy * br + r2), fill=(76, 76, 82), alpha=alpha)
    if ports:
        pw, ph = w * 0.15, h * 0.12
        for i, lab in enumerate("ABCD"):
            px = x + w * (0.10 + i * 0.2125)
            glow = hl_top
            if glow > 0:
                c.rrect((px - 8, y - ph - 16, px + pw + 8, y + 4), 10, fill=ORANGE, alpha=0.35 * glow * alpha)
            c.rrect((px, y - ph - 4, px + pw, y + 2), 6, fill=ORANGE if glow > 0 else (150, 120, 70), outline=(70, 50, 20), width=2, alpha=alpha)
            c.text((px + pw / 2, y - ph - 26), lab, F("b", 22), (150, 90, 20) if glow > 0 else (120, 110, 100), anchor="mm", alpha=alpha)
        for i, lab in enumerate("1234"):
            px = x + w * (0.10 + i * 0.2125)
            glow = hl_bottom
            if glow > 0:
                c.rrect((px - 8, y + h - 4, px + pw + 8, y + h + ph + 16), 10, fill=SKY, alpha=0.35 * glow * alpha)
            c.rrect((px, y + h - 2, px + pw, y + h + ph + 4), 6, fill=SKY if glow > 0 else (96, 124, 150), outline=(30, 60, 90), width=2, alpha=alpha)
            c.text((px + pw / 2, y + h + ph + 26), lab, F("b", 22), (30, 90, 150) if glow > 0 else (120, 110, 100), anchor="mm", alpha=alpha)


def draw_eye(c, cx, cy, s, color, alpha=1.0):
    c.ellipse((cx - s, cy - s * 0.6, cx + s, cy + s * 0.6), outline=color, width=4, alpha=alpha)
    c.ellipse((cx - s * 0.32, cy - s * 0.32, cx + s * 0.32, cy + s * 0.32), fill=color, alpha=alpha)


def draw_gear(c, cx, cy, s, color, rot=0.0, alpha=1.0):
    for k in range(8):
        a = math.radians(45 * k) + rot
        px, py = cx + math.cos(a) * s * 0.92, cy + math.sin(a) * s * 0.92
        c.poly([(px + math.cos(a + 1.57) * s * 0.2 - math.cos(a) * s * 0.18, py + math.sin(a + 1.57) * s * 0.2 - math.sin(a) * s * 0.18),
                (px - math.cos(a + 1.57) * s * 0.2 - math.cos(a) * s * 0.18, py - math.sin(a + 1.57) * s * 0.2 - math.sin(a) * s * 0.18),
                (px - math.cos(a + 1.57) * s * 0.16 + math.cos(a) * s * 0.16, py - math.sin(a + 1.57) * s * 0.16 + math.sin(a) * s * 0.16),
                (px + math.cos(a + 1.57) * s * 0.16 + math.cos(a) * s * 0.16, py + math.sin(a + 1.57) * s * 0.16 + math.sin(a) * s * 0.16)], color, alpha)
    c.ellipse((cx - s * 0.78, cy - s * 0.78, cx + s * 0.78, cy + s * 0.78), fill=color, alpha=alpha)
    c.ellipse((cx - s * 0.32, cy - s * 0.32, cx + s * 0.32, cy + s * 0.32), fill=(28, 26, 20), alpha=alpha)


def draw_laptop(c, cx, cy, s, alpha=1.0):
    c.rrect((cx - s * 0.8, cy - s * 0.55, cx + s * 0.8, cy + s * 0.35), 8, fill=(40, 44, 60), outline=(180, 180, 190), width=3, alpha=alpha)
    c.rect((cx - s * 0.68, cy - s * 0.44, cx + s * 0.68, cy + s * 0.24), fill=(70, 110, 160), alpha=alpha)
    c.rect((cx - s * 0.6, cy - s * 0.36, cx - s * 0.1, cy - s * 0.2), fill=(220, 230, 240), alpha=alpha * 0.8)
    c.poly([(cx - s * 1.0, cy + s * 0.42), (cx + s * 1.0, cy + s * 0.42), (cx + s * 0.86, cy + s * 0.35), (cx - s * 0.86, cy + s * 0.35)], (170, 170, 180), alpha)


def draw_bridge(c, cx, cy, s, alpha=1.0):
    c.rrect((cx - s * 0.8, cy - s * 0.3, cx + s * 0.8, cy + s * 0.5), 10, fill=(56, 60, 76), outline=(180, 180, 190), width=3, alpha=alpha)
    for i in range(3):
        c.ellipse((cx - s * 0.5 + i * s * 0.34, cy + s * 0.12, cx - s * 0.5 + i * s * 0.34 + 10, cy + s * 0.12 + 10), fill=(120, 220, 120), alpha=alpha)
    for k, r in enumerate([0.35, 0.6, 0.85]):
        c.d.arc([(cx - r * s) * SS, (cy - s * 0.3 - r * s) * SS, (cx + r * s) * SS, (cy - s * 0.3 + r * s) * SS], 215, 325,
                fill=(*BLUE_C, int(255 * alpha)), width=int(4 * SS))


# --- escenas -----------------------------------------------------------------
def sc_hero(c: Canvas, t, cues, d):
    a = anim(t, 0.15, 0.6)
    c.text((88 - (1 - a) * 40, 212), "MÓDULO · ROBÓTICA CON EL EV3", F("b", 18), RED, alpha=a)
    c.rect((88, 240, 88 + 300 * a, 243), fill=RED, alpha=a)
    a2 = anim(t, 0.35, 0.6)
    c.text((88 - (1 - a2) * 40, 258), "E1 — Conociendo\nel EV3", F("black", 56), INK, alpha=a2)
    a3 = anim(t, 0.6, 0.6)
    bob = math.sin(t * 2.3) * 8
    c.sprite("prof", (700 + (1 - a3) * 260, 128 + bob), 470, alpha=a3)


def sc_brick(c: Canvas, t, cues, d):
    title(c, "¿Qué es el EV3?", t, YELLOW)
    a = anim(t, 0.2, 0.7)
    draw_brick(c, 70 - (1 - a) * 60, 170, 520, 340, alpha=a)
    # etiquetas con línea guía (frase 1); se van cuando entra la frase 2
    gone = 1 - anim(t, cues[1] - 0.1, 0.4)
    labels = [("Pantalla", (330, 255), (690, 190)), ("Botones", (330, 430), (690, 285)), ("Procesador y batería", (250, 485), (690, 380))]
    for i, (name, tip, pos) in enumerate(labels):
        la = anim(t, cues[0] + 0.5 + i * 0.9, 0.4) * gone
        if la <= 0:
            continue
        c.line([tip, (pos[0] - 10, pos[1] + 22)], YELLOW, 2, la)
        c.ellipse((tip[0] - 6, tip[1] - 6, tip[0] + 6, tip[1] + 6), fill=YELLOW, alpha=la)
        w = c.text_width(name, F("sb", 24)) + 36
        c.rrect((pos[0] - 10, pos[1], pos[0] - 10 + w, pos[1] + 46), 23, fill=(60, 56, 44), outline=YELLOW, width=2, alpha=la)
        c.text((pos[0] - 10 + w / 2, pos[1] + 23), name, F("sb", 24), WHITE, anchor="mm", alpha=la)
    # Linux + Python (frase 2)
    ca = anim(t, cues[1], 0.5)
    if ca > 0:
        dx = (1 - ca) * 60
        c.rrect((680 + dx, 170, 1230 + dx, 470), 24, fill=(48, 44, 34), outline=(90, 82, 60), width=2, alpha=ca)
        c.text((716 + dx, 196), "Dentro del ladrillo", F("b", 26), YELLOW, alpha=ca)
        w1 = chip(c, 716, 262, "Linux", GREEN_C, t, cues[1] + 0.3, size=26)
        c.text((716 + w1 + 18, 281), "el sistema", F("reg", 22), (214, 208, 190), anchor="lm", alpha=anim(t, cues[1] + 0.3, 0.4))
        w2 = chip(c, 716, 340, "Python", BLUE_C, t, cues[1] + 0.9, size=26)
        c.text((716 + w2 + 18, 359), "el programa que escucha", F("reg", 22), (214, 208, 190), anchor="lm", alpha=anim(t, cues[1] + 0.9, 0.4))
        c.text((716 + w2 + 18, 387), "pedidos por la red", F("reg", 22), (214, 208, 190), anchor="lm", alpha=anim(t, cues[1] + 0.9, 0.4))


def sc_remote(c: Canvas, t, cues, d):
    title(c, "Laboratorio remoto", t, RED)
    y0 = 215
    nodes = [(190, "Tu panel", GREEN_C, draw_laptop), (640, "Puente", BLUE_C, draw_bridge), (1090, "Robot EV3", OCRE_C, None)]
    for i, (x, name, color, fn) in enumerate(nodes):
        if i == 1:
            na = anim(t, cues[1] + 0.2, 0.5)
        elif i == 2:
            na = anim(t, cues[0] + 1.4, 0.5)
        else:
            na = anim(t, cues[0] + 0.2, 0.5)
        if na <= 0:
            continue
        c.rrect((x - 150, y0 - 30 + (1 - na) * 30, x + 150, y0 + 250 + (1 - na) * 30), 24, fill=color, alpha=na)
        if fn:
            fn(c, x, y0 + 85 + (1 - na) * 30, 78, na)
        else:
            draw_brick(c, x - 80, y0 + 30 + (1 - na) * 30, 160, 106, alpha=na)
        c.text((x, y0 + 200 + (1 - na) * 30), name, F("b", 32), WHITE, anchor="mm", alpha=na)
    # flechas
    for (xa, xb, tt) in [(350, 480, cues[1] + 0.6), (800, 930, cues[1] + 1.0)]:
        fa = anim(t, tt, 0.4)
        if fa <= 0:
            continue
        c.line([(xa, y0 + 90), (xa + (xb - xa) * fa, y0 + 90)], INK, 6, 1)
        if fa > 0.95:
            c.poly([(xb, y0 + 90), (xb - 18, y0 + 78), (xb - 18, y0 + 102)], INK)
    # paquete "orden"
    pk = clamp((t - (cues[1] + 1.6)) / 2.2)
    if 0 < pk < 1:
        px = 350 + (930 - 350) * pk
        c.rrect((px - 54, y0 + 62, px + 54, y0 + 118), 16, fill=RED)
        c.text((px, y0 + 90), "orden", F("b", 24), WHITE, anchor="mm")
    la = anim(t, cues[0] + 2.6, 0.5)
    c.text((640, 560), "A distancia, por internet", F("b", 30), INK, anchor="mm", alpha=la)


def sc_sensors(c: Canvas, t, cues, d):
    title(c, "Sensores y actuadores", t, YELLOW)
    a = anim(t, cues[0], 0.5)
    for i, (x, head, sub, color) in enumerate([(70, "Sensores", "los sentidos · perciben", BLUE_C), (680, "Actuadores", "los músculos · actúan", OCRE_C)]):
        c.rrect((x, 130 + (1 - a) * 40, x + 530, 590 + (1 - a) * 40), 24, fill=color, alpha=a)
        if i == 0:
            draw_eye(c, x + 76, 205 + (1 - a) * 40, 38, WHITE, a)
        else:
            draw_gear(c, x + 76, 205 + (1 - a) * 40, 36, WHITE, rot=t * 0.8, alpha=a)
        c.text((x + 140, 172 + (1 - a) * 40), head, F("black", 40), WHITE, alpha=a)
        c.text((x + 140, 224 + (1 - a) * 40), sub, F("reg", 22), (225, 225, 230), alpha=a)
    for i, name in enumerate(["Contacto", "Ultrasónico (distancia)", "Color", "Giroscópico"]):
        chip(c, 100, 285 + i * 64, name, (30, 40, 70), t, cues[1] + 0.3 + i * 0.7, size=24)
    c.text((100, 552), "→ un número que el programa lee", F("sb", 22), (225, 225, 230), anchor="lm", alpha=anim(t, cues[1] + 3.4, 0.5))
    for i, name in enumerate(["Motor grande", "Motor mediano"]):
        chip(c, 710, 285 + i * 64, name, (110, 84, 24), t, cues[2] + 0.5 + i * 0.9, size=24)
    c.text((710, 552), "→ una orden: girar", F("sb", 22), (240, 232, 210), anchor="lm", alpha=anim(t, cues[2] + 2.6, 0.5))


def sc_ports(c: Canvas, t, cues, d):
    title(c, "Los 8 puertos del ladrillo", t, RED)
    a = anim(t, 0.2, 0.7)
    top = anim(t, cues[0] + 0.3, 0.5)
    bot = anim(t, cues[1] + 0.3, 0.5)
    draw_brick(c, 340, 215, 600, 270, alpha=a, ports=True, hl_top=top, hl_bottom=bot)
    ta = anim(t, cues[0] + 0.6, 0.5)
    c.text((640, 118), "SALIDAS · out · motores", F("b", 30), (170, 100, 20), anchor="mm", alpha=ta)
    ba = anim(t, cues[1] + 0.6, 0.5)
    c.text((640, 586), "ENTRADAS · in · sensores", F("b", 30), (30, 100, 160), anchor="mm", alpha=ba)
    ca = anim(t, cues[1] + 3.2, 0.5)
    if ca > 0:
        c.text((170, 350), "Un motor\nrecibe órdenes", F("b", 28), (170, 100, 20), anchor="mm", alpha=ca)
        c.text((1110, 350), "Un sensor\nsolo informa", F("b", 28), (30, 100, 160), anchor="mm", alpha=ca)


CASES = [("Avanzar", 50, 50), ("Girar en su sitio", -50, 50), ("Curva", 30, 60)]


def sc_wheels(c: Canvas, t, cues, d):
    title(c, "Dos ruedas, cualquier movimiento", t, YELLOW)
    # arena
    ax0, ay0, ax1, ay1 = 70, 120, 700, 600
    c.rrect((ax0, ay0, ax1, ay1), 20, fill=(44, 41, 32), outline=(90, 82, 60), width=3)
    # barras de potencia (frase 0 las hace oscilar de -100 a 100; frase 1 muestra cada caso)
    t1 = cues[1]
    if t < t1:
        s = math.sin((t - cues[0]) * 1.6)
        left, right, case_name, k = 100 * s, 100 * math.sin((t - cues[0]) * 1.6 + 1.2), "De -100 % a 100 %", None
        local = 0.0
    else:
        seg = (d - t1) / 3
        k = min(2, int((t - t1) / seg))
        local = (t - t1 - k * seg)
        case_name, left, right = CASES[k]
    # panel derecho
    pa = anim(t, 0.4, 0.5)
    for i, (lab, v) in enumerate([("Rueda izquierda", left), ("Rueda derecha", right)]):
        y = 190 + i * 140
        c.text((760, y), lab, F("sb", 26), WHITE, alpha=pa)
        c.rrect((760, y + 38, 1220, y + 76), 12, fill=(52, 48, 38), alpha=pa)
        c.rect((990, y + 38, 992, y + 76), fill=(120, 112, 90), alpha=pa)
        wv = abs(v) / 100 * 230
        col = (90, 200, 120) if v >= 0 else (230, 110, 80)
        x0, x1 = (990, 990 + wv) if v >= 0 else (990 - wv, 990)
        c.rrect((x0, y + 40, max(x1, x0 + 4), y + 74), 10, fill=col, alpha=pa)
        c.text((1220, y), f"{v:+.0f} %", F("monob", 26), col, anchor="ra", alpha=pa)
    c.text((760, 470), case_name, F("black", 40), YELLOW, alpha=pa)
    # robot
    cx, cy = (ax0 + ax1) / 2, (ay0 + ay1) / 2 + 20
    if k is None:
        x, y, th = cx, cy, -90.0
    else:
        # integración sencilla con la potencia de cada rueda (solo ilustrativa)
        steps = max(1, int(local * 60))
        x, y, th = cx, cy, -90.0
        for _ in range(steps):
            v_ = (left + right) / 2 * 2.2
            w_ = (right - left) / 100 * 70
            rad = math.radians(th)
            x += v_ / 60 * math.cos(rad)
            y += v_ / 60 * math.sin(rad)
            th += w_ / 60
    x = min(max(x, ax0 + 90), ax1 - 90)
    y = min(max(y, ay0 + 90), ay1 - 90)
    rad = math.radians(th + 90)

    def rot(px, py):
        return (x + px * math.cos(rad) - py * math.sin(rad), y + px * math.sin(rad) + py * math.cos(rad))

    K = 1.9
    body = [rot(-26 * K, -34 * K), rot(26 * K, -34 * K), rot(26 * K, 34 * K), rot(-26 * K, 34 * K)]
    for sgn in (-1, 1):
        wheel = [rot(sgn * 34 * K - 7 * K, -22 * K), rot(sgn * 34 * K + 7 * K, -22 * K), rot(sgn * 34 * K + 7 * K, 22 * K), rot(sgn * 34 * K - 7 * K, 22 * K)]
        c.poly(wheel, (20, 20, 20))
    c.poly(body, (206, 207, 209))
    c.poly([rot(0, -46 * K), rot(-10 * K, -30 * K), rot(10 * K, -30 * K)], (90, 200, 120))
    c.text((x, y), "EV3", F("monob", 24), (60, 70, 60), anchor="mm")


def sc_closing(c: Canvas, t, cues, d):
    a = anim(t, 0.1, 0.6)
    c.text((80 - (1 - a) * 40, 96), "Ahora, a practicar", F("black", 48), RED, alpha=a)
    items = [("1", "Dashboard", "Mueve un motor y mira los sensores", cues[0] + 0.8), ("2", "Consola", "Ejecuta un programa en el robot", cues[0] + 3.4),
             ("3", "Preguntas", "Responde el quiz y cierra el módulo", cues[1] + 0.3)]
    for i, (n, head, sub, t0) in enumerate(items):
        ia = anim(t, t0, 0.5)
        if ia <= 0:
            continue
        y = 210 + i * 130
        c.rrect((80 - (1 - ia) * 50, y, 680 - (1 - ia) * 50, y + 108), 22, fill=INK, alpha=ia)
        c.ellipse((100 - (1 - ia) * 50, y + 24, 160 - (1 - ia) * 50, y + 84), fill=YELLOW, alpha=ia)
        c.text((130 - (1 - ia) * 50, y + 54), n, F("black", 30), INK, anchor="mm", alpha=ia)
        c.text((184 - (1 - ia) * 50, y + 18), head, F("b", 32), WHITE, alpha=ia)
        c.text((184 - (1 - ia) * 50, y + 62), sub, F("reg", 23), (225, 220, 205), alpha=ia)
    a3 = anim(t, 0.3, 0.6)
    bob = math.sin(t * 2.3) * 8
    c.sprite("prof", (770 + (1 - a3) * 240, 150 + bob), 470, alpha=a3)


SCENES = [("yellow", sc_hero), ("dark", sc_brick), ("cream", sc_remote), ("dark", sc_sensors), ("cream", sc_ports), ("dark", sc_wheels), ("yellow", sc_closing)]


# --- subtítulos --------------------------------------------------------------
def split_chunks(text: str, limit: int = 96) -> list[str]:
    """Parte una frase en trozos de subtítulo por comas y puntos, sin pasar de `limit`."""
    parts, cur = [], ""
    for tok in text.replace("; ", "; |").replace(", ", ", |").replace(". ", ". |").replace(": ", ": |").split("|"):
        if cur and len(cur) + len(tok) > limit:
            parts.append(cur.strip())
            cur = ""
        cur += tok
    if cur.strip():
        parts.append(cur.strip())
    return parts


def draw_subtitle(c: Canvas, text: str, alpha=1.0):
    font = F("reg", 21)
    c.rrect((48, 626, 1232, 686), 14, fill=BAR, alpha=0.93 * alpha)
    c.text((640, 656), text, font, WHITE, anchor="mm", alpha=alpha)


# --- línea de tiempo ---------------------------------------------------------
def estimate(text: str) -> float:
    return len(text) / 14.5 + 0.4


def build_timeline(durations: list[float]):
    starts, t = [], LEAD
    for dur in durations:
        starts.append(t)
        t += dur + GAP
    total = t - GAP + TAIL
    scenes = []  # (inicio, fin, [índices de frase])
    for s in range(N_SCENES):
        idx = [i for i, p in enumerate(PHRASES) if p[0] == s]
        a = 0.0 if s == 0 else starts[idx[0]] - GAP / 2
        b = total if s == N_SCENES - 1 else starts[idx[-1]] + durations[idx[-1]] + GAP / 2
        scenes.append((a, b, idx))
    return starts, scenes, total


def subtitle_at(t: float, starts, durations) -> str | None:
    for i, (s, dur) in enumerate(zip(starts, durations)):
        if s <= t < s + dur + 0.05:
            chunks = split_chunks(PHRASES[i][1])
            weights = [len(x) for x in chunks]
            acc, tot = 0.0, sum(weights)
            for ch, w in zip(chunks, weights):
                if t < s + (acc + w) / tot * dur + 1e-6:
                    return ch
                acc += w
            return chunks[-1]
    return None


def render_frame(t: float, starts, scenes, durations) -> Image.Image:
    si = next(i for i, (a, b, _) in enumerate(scenes) if a <= t < b) if t < scenes[-1][1] else N_SCENES - 1
    a, b, idx = scenes[si]
    theme, fn = SCENES[si]
    c = Canvas(theme)
    cues = [starts[i] - a for i in idx]
    fn(c, t - a, cues, b - a)
    sub = subtitle_at(t, starts, durations)
    if sub:
        draw_subtitle(c, sub)
    return c.img.resize((W, H), Image.LANCZOS)


# --- audio -------------------------------------------------------------------
def ffprobe_duration(p: Path) -> float:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(p)],
                         capture_output=True, text=True, check=True).stdout.strip()
    return float(out)


def prepare_audio(audio_dir: Path, workdir: Path) -> tuple[list[float], list[Path]]:
    """Recorta silencios de cada NN.mp3 y devuelve duraciones y wavs 48 kHz mono."""
    wavs, durs = [], []
    for i in range(1, len(PHRASES) + 1):
        src = next((p for p in [audio_dir / f"{i:02d}.mp3", audio_dir / f"{i:02d}.wav"] if p.exists()), None)
        if src is None:
            sys.exit(f"falta el audio {i:02d}.mp3 en {audio_dir}")
        out = workdir / f"{i:02d}.wav"
        af = ("silenceremove=start_periods=1:start_duration=0.02:start_threshold=-45dB,"
              "areverse,silenceremove=start_periods=1:start_duration=0.02:start_threshold=-45dB,areverse")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-af", af, "-ar", "48000", "-ac", "1", str(out)], check=True)
        wavs.append(out)
        durs.append(ffprobe_duration(out))
    return durs, wavs


def mix_audio(wavs: list[Path], starts: list[float], total: float, out: Path):
    n = int(total * 48000) + 48000
    mix = np.zeros(n, dtype=np.float32)
    for w, s in zip(wavs, starts):
        with wave.open(str(w), "rb") as wf:
            data = np.frombuffer(wf.readframes(wf.getnframes()), dtype=np.int16).astype(np.float32) / 32768
        i0 = int(s * 48000)
        mix[i0:i0 + len(data)] += data
    peak = max(1e-6, float(np.abs(mix).max()))
    mix = mix * min(1.0, 0.89 / peak)
    with wave.open(str(out), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(48000)
        wf.writeframes((mix * 32767).astype(np.int16).tobytes())


# --- salida ------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--audio-dir", type=Path)
    ap.add_argument("--out", type=Path)
    ap.add_argument("--sheet", type=Path, help="hoja de contacto con fotogramas de cada escena")
    ap.add_argument("--export-script", type=Path)
    args = ap.parse_args()

    if args.export_script:
        lines = ["# Guion del video del módulo 1 de EV3 para ElevenLabs.",
                 "# Genera un audio por frase y guárdalos como 01.mp3 ... %02d.mp3 en una carpeta." % len(PHRASES),
                 "# Las palabras en inglés ya están escritas como suenan (Línux, Páiton, Dáshbord, E-V tres).", ""]
        for i, (_, _, say) in enumerate(PHRASES, 1):
            lines += [f"{i:02d}", say, ""]
        args.export_script.write_text("\n".join(lines), encoding="utf-8")
        print("guion escrito en", args.export_script)
        if not (args.out or args.sheet):
            return

    workdir = Path(tempfile.mkdtemp(prefix="ev3video_"))
    wavs: list[Path] = []
    if args.audio_dir:
        durations, wavs = prepare_audio(args.audio_dir, workdir)
    else:
        durations = [estimate(p[1]) for p in PHRASES]
    starts, scenes, total = build_timeline(durations)
    print(f"duración total: {total:.1f} s ({'con voz' if wavs else 'estimada, sin voz'})")

    if args.sheet:
        frames = []
        for si, (a, b, idx) in enumerate(scenes):
            for frac in (0.18, 0.5, 0.92):
                frames.append(render_frame(a + (b - a) * frac, starts, scenes, durations).resize((640, 360), Image.LANCZOS))
        cols = 3
        rows = math.ceil(len(frames) / cols)
        sheet = Image.new("RGB", (cols * 640, rows * 360))
        for i, fr in enumerate(frames):
            sheet.paste(fr, ((i % cols) * 640, (i // cols) * 360))
        sheet.save(args.sheet)
        print("hoja guardada en", args.sheet)

    if args.out:
        audio = None
        if wavs:
            audio = workdir / "mezcla.wav"
            mix_audio(wavs, starts, total, audio)
        cmd = ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-"]
        if audio:
            cmd += ["-i", str(audio)]
        cmd += ["-c:v", "libx264", "-preset", "medium", "-crf", "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart"]
        cmd += (["-c:a", "aac", "-b:a", "128k", "-shortest"] if audio else ["-an"]) + [str(args.out)]
        proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
        n = int(total * FPS)
        for f in range(n):
            frame = render_frame(f / FPS, starts, scenes, durations)
            proc.stdin.write(frame.tobytes())
            if f % 150 == 0:
                print(f"  {f}/{n}", flush=True)
        proc.stdin.close()
        proc.wait()
        print("video guardado en", args.out)


if __name__ == "__main__":
    main()
