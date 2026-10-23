#!/usr/bin/env python3
"""
Suite de integridad estructural para el contenido de las prácticas
(linux-m1/m2/m3 en esta carpeta y ev3-m1..m9 en ../practicas-ev3; las dos las sirve la misma
API de la Pi): recorre cada carpeta <raíz>/<id>/
que tenga module.json + quiz_answers.json y valida que las piezas que se
referencian entre sí EXISTAN y CUADREN -- no juzga calidad pedagógica, eso
lo decide un humano.

Chequeos:
  1. checkpoint.rule_ids no apunta a reglas inexistentes, y toda regla
     declarada está referenciada por el checkpoint (si no, nunca suma
     puntos aunque el estudiante la cumpla -- bug real encontrado en
     linux-m3: `cmd-pipe-ejemplo` quedó fuera del checkpoint).
  2. Todo command_step tiene una validation_rule alcanzable (por step_id si
     lo trae, si no por texto de comando) -- si no hay ninguna, el paso es
     imposible de completar.
  3. Cuando N command_step comparten el mismo comando sin step_id propio,
     tiene que haber EXACTAMENTE N validation_rules con ese target -- si hay
     menos, el resolver del cliente (step_id o posición, ver
     linuxPractice.service.ts: resolveLinuxModule) termina reusando una
     regla para dos pasos distintos.
  4. Todo quiz tiene: una validation_rule (target == id del quiz), una
     respuesta correcta en quiz_answers.json, y esa respuesta es una opción
     real del bloque (si no, el quiz es imposible de aprobar).
  5. Todo bloque `media` tiene el campo `file` (la existencia del archivo en
     la Pi se verifica aparte, por SSH -- este script no tiene esa red).

Uso: python test_content_integrity.py
Exit code 0 si todo pasa, 1 si hay al menos un FAIL.
"""
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).parent
# EV3 es otra práctica (otra carpeta en el repo), pero la sirve la misma API: se revisa igual.
RAICES = [ROOT, ROOT.parent / "practicas-ev3"]

failures: list[str] = []
warnings: list[str] = []


def fail(module: str, msg: str) -> None:
    failures.append(f"[{module}] FAIL: {msg}")


def warn(module: str, msg: str) -> None:
    warnings.append(f"[{module}] WARN: {msg}")


def discover_modules() -> list[Path]:
    return sorted(
        (p for raiz in RAICES if raiz.is_dir() for p in raiz.iterdir()
         if p.is_dir() and (p / "module.json").exists() and (p / "quiz_answers.json").exists()),
        key=lambda p: p.name,
    )


def check_module(path: Path) -> None:
    mod = path.name
    data = json.loads((path / "module.json").read_text(encoding="utf-8"))
    quiz_answers = json.loads((path / "quiz_answers.json").read_text(encoding="utf-8"))
    blocks = data["blocks"]
    rules = data["validation_rules"]
    rule_by_id = {r["id"]: r for r in rules}

    # ── 1. checkpoint <-> validation_rules ──────────────────────────────
    checkpoints = [b for b in blocks if b["type"] == "checkpoint"]
    if len(checkpoints) != 1:
        fail(mod, f"se esperaba exactamente 1 bloque checkpoint, hay {len(checkpoints)}")
    else:
        cp_ids = checkpoints[0].get("rule_ids", [])
        cp_set = set(cp_ids)
        if len(cp_ids) != len(cp_set):
            dupes = [i for i, c in Counter(cp_ids).items() if c > 1]
            fail(mod, f"checkpoint.rule_ids tiene ids duplicados: {dupes}")
        missing_in_rules = cp_set - set(rule_by_id.keys())
        if missing_in_rules:
            fail(mod, f"checkpoint.rule_ids referencia reglas que NO existen: {sorted(missing_in_rules)}")
        orphan_rules = set(rule_by_id.keys()) - cp_set
        if orphan_rules:
            warn(mod, f"reglas definidas pero nunca referenciadas por el checkpoint (no suman nunca): {sorted(orphan_rules)}")

    # ── 2 y 3. command_step <-> validation_rules ────────────────────────
    command_steps = [b for b in blocks if b["type"] == "command_step"]
    cmd_rules = [r for r in rules if r.get("rule_type") == "command_executed"]
    rules_by_target = defaultdict(list)
    for r in cmd_rules:
        rules_by_target[r.get("target")].append(r)
    step_ids_with_rule = {r["step_id"] for r in cmd_rules if r.get("step_id")}

    for b in command_steps:
        cmd = b.get("command")
        if b["id"] not in step_ids_with_rule and cmd not in rules_by_target:
            fail(mod, f"command_step '{b['id']}' (comando `{cmd}`) no tiene NINGUNA validation_rule -- paso imposible de completar")

    steps_by_cmd_without_step_id_rule = defaultdict(list)
    for b in command_steps:
        has_step_id_rule = any(r.get("step_id") == b["id"] for r in cmd_rules)
        if not has_step_id_rule:
            steps_by_cmd_without_step_id_rule[b["command"]].append(b["id"])

    for cmd, step_ids in steps_by_cmd_without_step_id_rule.items():
        n_steps = len(step_ids)
        n_rules = len([r for r in rules_by_target.get(cmd, []) if not r.get("step_id")])
        if n_rules < n_steps:
            fail(
                mod,
                f"{n_steps} command_step piden `{cmd}` sin step_id propio ({step_ids}) pero solo hay "
                f"{n_rules} validation_rule(s) con ese target -- al menos 2 pasos van a compartir la misma regla.",
            )
        elif n_rules > n_steps:
            warn(mod, f"hay {n_rules} reglas con target `{cmd}` pero solo {n_steps} command_step las necesitan -- sobran reglas.")

    # ── 4. quiz <-> validation_rules <-> quiz_answers.json ──────────────
    quiz_blocks = [b for b in blocks if b["type"] == "quiz"]
    quiz_rules_by_target = {r["target"] for r in rules if r.get("rule_type") == "quiz"}

    for qb in quiz_blocks:
        qid = qb["id"]
        if qid not in quiz_rules_by_target:
            fail(mod, f"quiz '{qid}' no tiene validation_rule (rule_type=quiz, target=='{qid}') -- nunca suma puntos")
        if qid not in quiz_answers:
            fail(mod, f"quiz '{qid}' no tiene respuesta correcta en quiz_answers.json -- SIEMPRE da False")
        else:
            correct = quiz_answers[qid]
            option_ids = {opt["id"] for opt in qb.get("options", [])}
            if correct not in option_ids:
                fail(mod, f"quiz '{qid}': la respuesta correcta '{correct}' no es ninguna opción real ({sorted(option_ids)}) -- imposible de aprobar")

    quiz_block_ids = {qb["id"] for qb in quiz_blocks}
    orphan_answers = set(quiz_answers.keys()) - quiz_block_ids
    if orphan_answers:
        warn(mod, f"quiz_answers.json tiene respuestas para preguntas que ya no existen: {sorted(orphan_answers)}")

    # ── 5. media.file presente ───────────────────────────────────────────
    for mb in (b for b in blocks if b["type"] == "media"):
        if not mb.get("file"):
            fail(mod, f"bloque media '{mb['id']}' no tiene campo 'file'")


def main() -> int:
    modules = discover_modules()
    if not modules:
        print(f"No se encontró ninguna carpeta <id>/module.json + quiz_answers.json bajo {ROOT}")
        return 1

    for path in modules:
        check_module(path)

    print(f"\n{'='*70}\nRESULTADOS ({len(modules)} módulos: {', '.join(p.name for p in modules)})\n{'='*70}")
    print(f"\n{len(failures)} FALLOS, {len(warnings)} ADVERTENCIAS\n")

    if failures:
        print("--- FALLOS (rompen la práctica) ---")
        for f in failures:
            print(" ", f)

    if warnings:
        print("\n--- ADVERTENCIAS (no rompen, pero son basura/ineficiencia) ---")
        for w in warnings:
            print(" ", w)

    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
