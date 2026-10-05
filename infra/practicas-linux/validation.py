import re

from quiz_svc import load_quiz_answers


def _norm_cmd(texto) -> str:
    # minusculas y espacios normalizados alrededor de la tuberia: `ls|wc -l` == `ls | wc -l`
    return re.sub(r"\s*\|\s*", " | ", str(texto).strip().lower())


def validate_command_executed(rule, ctx) -> bool:
    target_norm = _norm_cmd(rule.get("target", ""))
    needed = ctx.get("occurrence_by_rule_id", {}).get(rule.get("id"), 1)
    # Por defecto exige IGUALDAD exacta (ya normalizada) -- antes cualquier
    # comando que contuviera el target como substring contaba como "ya lo
    # corriste" (ej. `sudo apt update` satisfacia la regla de `date`; `ls -l`
    # satisfacia la de `ls` a secas; `cd ~/Documents` satisfacia la de
    # `cd ~`). Un desafio abierto a proposito (ej. "pipe a wc -l, cualquier
    # comando valido") marca su regla con `"fuzzy": true` para optar
    # explicitamente por la coincidencia parcial de antes.
    fuzzy = bool(rule.get("fuzzy"))
    count = 0
    for cmd in ctx["command_history"]:
        norm = _norm_cmd(cmd)
        matched = (target_norm in norm) if fuzzy else (norm == target_norm)
        if matched:
            count += 1
    return count >= needed


def validate_quiz(rule, ctx) -> bool:
    submitted = ctx["quiz_answers"].get(rule.get("target"))
    if submitted is None:
        return False
    correct = ctx["quiz_correct_answers"].get(rule.get("target"))
    return correct is not None and str(submitted) == str(correct)


# Un validador por rule_type, firma uniforme (rule, ctx) -> bool. `ctx` trae
# command_history, quiz_answers y quiz_correct_answers ya resueltos -- un
# validador nuevo (systemctl, permisos de archivo, salida de un script) se
# agrega aca sin tocar run_validation.
VALIDATORS = {
    "command_executed": validate_command_executed,
    "quiz": validate_quiz,
}


def run_validation(practice: dict, command_history, quiz_answers=None):
    rules = practice.get("validation_rules", [])

    # Dos (o mas) reglas de command_executed pueden compartir el mismo target
    # (ej. "pwd" usado para confirmar la ubicacion en varios puntos de un
    # modulo) -- a cada una le asignamos que ocurrencia (1a, 2a, 3a...) le
    # corresponde, en el orden en que aparecen en validation_rules, para que
    # la 2a exija que el comando se haya tecleado DE NUEVO y no reuse la
    # primera ejecucion ya vieja en el historial.
    occurrence_by_rule_id = {}
    seen_counts = {}
    for rule in rules:
        if rule.get("rule_type") == "command_executed":
            key = _norm_cmd(rule.get("target", ""))
            seen_counts[key] = seen_counts.get(key, 0) + 1
            occurrence_by_rule_id[rule.get("id")] = seen_counts[key]

    ctx = {
        "command_history": command_history,
        "quiz_answers": quiz_answers or {},
        "quiz_correct_answers": load_quiz_answers(practice.get("id")),
        "occurrence_by_rule_id": occurrence_by_rule_id,
    }

    results = []
    total_points = 0.0
    earned_points = 0.0

    for rule in rules:
        points = float(rule.get("points", 0))
        total_points += points

        validator = VALIDATORS.get(rule.get("rule_type"))
        passed = validator(rule, ctx) if validator else False

        earned = points if passed else 0.0
        earned_points += earned

        results.append({
            "rule_id": rule.get("id"),
            "rule_type": rule.get("rule_type"),
            "passed": passed,
            "points_earned": earned,
            "details": "Completado correctamente" if passed else "No completado",
        })

    percentage = (earned_points / total_points * 100.0) if total_points > 0 else 0.0

    # "Completo" ya NO es un umbral parcial (antes 60% del total, incluyendo
    # comandos opcionales) -- ahora exige el 100% de lo que de verdad importa:
    # todas las reglas de comando REQUERIDAS (required != False) y TODO el
    # quiz correcto, sin excepcion. Las reglas opcionales (`required: false`,
    # ej. `clear`/`date`/`uptime` en M1) sí suman puntos si se hacen, pero
    # nunca bloquean que el módulo se de por completo si se omiten -- son
    # bonus, no evaluación. Esto es lo que permite que el frontend deje
    # corregir una respuesta de quiz mal marcada y reenviar hasta llegar al
    # 100%, en vez de bloquear la evaluación para siempre en el primer envío.
    passed = all(
        r["passed"]
        for r, rule in zip(results, rules)
        if rule.get("rule_type") == "quiz" or rule.get("required", True)
    )

    return {
        "practice_id": practice.get("id"),
        "total_points": total_points,
        "earned_points": earned_points,
        "percentage": round(percentage, 1),
        "passed": passed,
        "results": results,
    }
