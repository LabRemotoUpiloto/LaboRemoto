#!/usr/bin/env python3
"""
Pruebas de validation.py: que un comando bien escrito valga aunque se teclee de otra forma que bash ejecuta
igual, y que uno que bash no ejecutaria igual NO valga.

No necesita la Pi (quiz_svc vive alla, se reemplaza por uno de mentira).
Uso: python test_validation.py   (exit 0 si todo pasa)
"""
import sys
import types

sys.modules["quiz_svc"] = types.SimpleNamespace(load_quiz_answers=lambda _id: {})

from validation import run_validation  # noqa: E402

fallos = []


def pasa(target, historial, fuzzy=False):
    regla = {"id": "r", "rule_type": "command_executed", "target": target, "points": 1}
    if fuzzy:
        regla["fuzzy"] = True
    res = run_validation({"id": "prueba", "validation_rules": [regla]}, historial)
    return res["results"][0]["passed"]


def debe(target, comando, esperado, fuzzy=False):
    obtenido = pasa(target, [comando], fuzzy)
    if obtenido != esperado:
        fallos.append(f"target `{target}`{' (fuzzy)' if fuzzy else ''} con `{comando}`: "
                      f"{'pasa' if obtenido else 'no pasa'}, se esperaba {'que pase' if esperado else 'que no'}")


# ── Escrito distinto pero bash lo ejecuta igual: tiene que valer ────────────
VALEN = [
    ("whoami", "  whoami  "),
    ("whoami", "whoami;"),
    ("uname -a", "uname  -a"),
    ("ls -l", "ls\t-l"),
    ("ls -a", "ls -a "),
    ("cd", "cd ~"),
    ("cd", "cd ~/"),
    ("cd", "cd $HOME"),
    ("cd proyecto", "cd proyecto/"),
    ("cd proyecto", "cd ./proyecto"),
    ("ls borradores", "ls borradores/"),
    ("cat informe.txt", "cat ./informe.txt"),
    ("mkdir proyecto", "mkdir 'proyecto'"),
    ("echo \"uno dos tres\" | wc -w", "echo 'uno dos tres'|wc -w"),
    ("echo \"uno dos tres\" | wc -w", "echo \"Uno dos tres\" | wc -w"),
    ("echo \"Informe del proyecto\" > informe.txt", "echo 'informe del proyecto'>informe.txt"),
    ("wc -l notas.txt", "wc notas.txt -l"),
    ("cd proyecto", "cd proyecto && pwd"),
    ("pwd", "cd proyecto; pwd"),
    ("chmod 754 mi-programa", "chmod 754 mi-programa # permisos"),
    ("cp informe.txt borradores/informe-v1.txt", "cp informe.txt borradores/informe-v1.txt"),
    ("echo \"a | b\"", "echo 'a | b'"),          # la tuberia entre comillas es texto, no tuberia
    ("mkdir borradores final", "mkdir  borradores   final"),
]
for target, comando in VALEN:
    debe(target, comando, True)

# Opciones juntas o separadas, en cualquier orden
debe("ls -la", "ls -al", True)
debe("ls -la", "ls -l -a", True)

# ── Bash NO lo ejecutaria igual: no tiene que valer ─────────────────────────
NO_VALEN = [
    ("whoami", "WHOAMI"),            # command not found
    ("whoami", "whoamii"),
    ("ls", "ls -l"),
    ("ls -l", "ls -la"),
    ("cd", "cd ~/Documents"),
    ("cd ..", "cd ../.."),
    ("./mi-programa", "mi-programa"),  # sin ./ bash no lo encuentra
    ("cat informe.txt", "cat Informe.txt"),
    ("date", "sudo apt update"),
    ("mv informe.txt final", "mv final informe.txt"),
    ("ls -l", "ls -l"),          # espacio no separable: bash busca el programa "ls -l"
    ("ls -l", "ls –l"),           # guion largo copiado de un documento
    ("echo \"uno dos tres\" | wc -w", "echo “uno dos tres” | wc -w"),
    ("echo \"uno dos tres\" | wc -w", "echo \"uno dos tres | wc -w"),  # comillas sin cerrar
    ("mkdir borradores final", "mkdir 'borradores final'"),  # una sola carpeta con espacio
    ("ls", "echo 'a; ls'"),                                     # el ; entre comillas no separa
]
for target, comando in NO_VALEN:
    debe(target, comando, False)

# ── Reglas fuzzy (desafios abiertos): como antes, y ademas la forma canonica ──
debe("| wc -l", "ls /etc | wc -l", True, fuzzy=True)
debe("| wc -l", "ls -a /etc|wc  -l", True, fuzzy=True)
debe("| wc -l", "ls /etc", False, fuzzy=True)
debe("cd /home/", "cd /home", True, fuzzy=True)  # antes fallaba: no tenia la barra final
debe("cd /home/", "cd /home/", True, fuzzy=True)
debe("hola mundo", "echo Hola Mundo", True, fuzzy=True)
debe("hola mundo", "echo \"hola  mundo\"", True, fuzzy=True)

# ── Dos reglas con el mismo comando exigen teclearlo dos veces (aunque se escriba distinto) ──
dos = {"id": "prueba", "validation_rules": [
    {"id": "a", "rule_type": "command_executed", "target": "cd", "points": 1},
    {"id": "b", "rule_type": "command_executed", "target": "cd", "points": 1},
]}
r = run_validation(dos, ["cd ~"])["results"]
if [x["passed"] for x in r] != [True, False]:
    fallos.append(f"`cd` dos veces con un solo `cd ~`: {[x['passed'] for x in r]}, se esperaba [True, False]")
r = run_validation(dos, ["cd ~", "cd"])["results"]
if [x["passed"] for x in r] != [True, True]:
    fallos.append(f"`cd` dos veces con `cd ~` y `cd`: {[x['passed'] for x in r]}, se esperaba [True, True]")
r = run_validation(dos, ["cd; cd"])["results"]
if [x["passed"] for x in r] != [True, True]:
    fallos.append(f"`cd; cd` en una linea: {[x['passed'] for x in r]}, se esperaba [True, True]")

if fallos:
    print(f"{len(fallos)} FALLOS:")
    for f in fallos:
        print("  ", f)
    sys.exit(1)
print("validation.py: todo OK")
