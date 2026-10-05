#!/usr/bin/env python3
"""
Fuzzer de FALSOS POSITIVOS contra el motor real de validación
(POST /practices/<id>/validate en la Pi, vía el túnel SSH de solo lectura
svc-practicas -- mismo mecanismo que linux_tunnel.rs).

validate_command_executed (validation.py, en la Pi) exige igualdad EXACTA
por defecto desde el fix de 2026-10 -- antes, cualquier comando que
contuviera el target como substring contaba como "ya lo corriste" (ej.
`sudo apt update` satisfacía la regla de `date`; `ls -l` satisfacía la de
`ls` a secas). Este script reproduce ese tipo de bug: para cada regla de
comando de cada módulo, prueba una batería de "decoys" (comandos reales y
plausibles que un estudiante tipearía) que NO deberían satisfacerla, y
reporta cuáles sí la satisfacen por accidente.

Requiere red hacia el laboratorio (no corre en CI) -- pensado para
re-correr a mano después de tocar validation.py o el contenido de un
módulo. Lee las credenciales del túnel desde las mismas variables de
entorno que usa el cliente (ver Cliente-Rust/.env.example):
  PRACTICE_LINUX_TUNNEL_HOST, _PORT, _USER, _PASSWORD, PRACTICE_LINUX_API_TOKEN

Uso:
  cd Cliente-Rust/infra/practicas-linux
  python fuzz_validate.py                       # todos los módulos locales (module.json de este dir)
  python fuzz_validate.py linux-m2               # solo uno
"""
import json
import os
import sys
from pathlib import Path

import paramiko

ROOT = Path(__file__).parent

HOST = os.environ.get("PRACTICE_LINUX_TUNNEL_HOST")
PORT = int(os.environ.get("PRACTICE_LINUX_TUNNEL_PORT", "9000"))
USER = os.environ.get("PRACTICE_LINUX_TUNNEL_USER", "svc-practicas")
PASSWORD = os.environ.get("PRACTICE_LINUX_TUNNEL_PASSWORD")
TOKEN = os.environ.get("PRACTICE_LINUX_API_TOKEN")
REMOTE_PORT = int(os.environ.get("PRACTICE_LINUX_API_REMOTE_PORT", "8770"))

if not (HOST and PASSWORD and TOKEN):
    sys.exit(
        "Faltan credenciales: exportá PRACTICE_LINUX_TUNNEL_HOST, "
        "PRACTICE_LINUX_TUNNEL_PASSWORD y PRACTICE_LINUX_API_TOKEN "
        "(los mismos valores de Cliente-Rust/.env) antes de correr este script."
    )

# Decoys "universales" -- comandos reales y comunes que un estudiante podría
# tipear por curiosidad o costumbre, sin relación con el target que se prueba.
UNIVERSAL_DECOYS = [
    "sudo apt update", "sudo apt upgrade", "ls -la", "ls -l /etc", "ls /home",
    "ls -alh", "cd ../..", "cd ~/Documents", "cd ~/.ssh", "history", "exit",
    "man ls", "cat notas.txt", "mkdir carpeta", "rm notas.txt", "false",
    "pulse", "lsblk", "lsusb", "lspci", "cal", "update-alternatives --list",
]


def discover_modules():
    return sorted(p for p in ROOT.iterdir() if p.is_dir() and (p / "module.json").exists())


def main():
    only = sys.argv[1] if len(sys.argv) > 1 else None
    modules = [p for p in discover_modules() if only is None or p.name == only]
    if not modules:
        sys.exit(f"No se encontró el módulo '{only}'" if only else "No se encontró ningún módulo local")

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, port=PORT, username=USER, password=PASSWORD, timeout=15)
    transport = client.get_transport()

    def post_validate(practice_id, command_history):
        channel = transport.open_channel("direct-tcpip", ("127.0.0.1", REMOTE_PORT), ("127.0.0.1", 0), timeout=15)
        body = json.dumps({"student": "fuzz-test", "command_history": command_history, "quiz_answers": {}}).encode("utf-8")
        req = (
            f"POST /practices/{practice_id}/validate HTTP/1.1\r\n"
            f"Host: 127.0.0.1:{REMOTE_PORT}\r\nAuthorization: Bearer {TOKEN}\r\n"
            f"Content-Type: application/json\r\nContent-Length: {len(body)}\r\nConnection: close\r\n\r\n"
        ).encode() + body
        channel.send(req)
        chunks = []
        while True:
            data = channel.recv(65536)
            if not data:
                break
            chunks.append(data)
        raw = b"".join(chunks)
        resp_body = raw[raw.find(b"\r\n\r\n") + 4:]
        channel.close()
        return json.loads(resp_body)

    findings = []
    for path in modules:
        mod = path.name
        data = json.loads((path / "module.json").read_text(encoding="utf-8"))
        cmd_rules = [r for r in data["validation_rules"] if r["rule_type"] == "command_executed"]
        own_targets = list({r["target"] for r in cmd_rules})

        for rule in cmd_rules:
            if rule.get("fuzzy"):
                continue  # coincidencia parcial a propósito (ej. desafíos abiertos) -- no es un bug a buscar acá
            target = rule["target"]
            decoys = [d for d in (UNIVERSAL_DECOYS + own_targets) if d != target]
            for decoy in decoys:
                result = post_validate(mod, [decoy])
                rule_result = next((r for r in result["results"] if r["rule_id"] == rule["id"]), None)
                if rule_result and rule_result["passed"]:
                    findings.append({"module": mod, "rule_id": rule["id"], "target": target, "decoy": decoy})
                    print(f"  [FALSO POSITIVO] {mod}/{rule['id']} (target=`{target}`) se marca PASADO con decoy=`{decoy}`")

    transport.close()
    client.close()

    print(f"\n{'='*70}\n{len(findings)} falsos positivos encontrados en {len(modules)} módulo(s)\n{'='*70}")
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
