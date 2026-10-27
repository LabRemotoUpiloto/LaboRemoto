import re

from quiz_svc import load_quiz_answers


def _norm_cmd(texto) -> str:
    # minusculas, espacios repetidos colapsados y espacios normalizados alrededor de la tuberia:
    # `ls|wc -l` == `ls  |  wc -l` == `ls | wc -l`. Es la forma que usan las reglas `fuzzy` (subcadena).
    texto = re.sub(r"\s+", " ", str(texto).strip().lower())
    return re.sub(r"\s*\|\s*", " | ", texto)


# ── Comparacion "como la entiende bash" ─────────────────────────────────────
# Un comando bien escrito se puede teclear de muchas formas que bash ejecuta igual. Antes solo se toleraban las
# mayusculas y los espacios de la tuberia, asi que `cd /home` no valia por `cd /home/`, `ls  -l` (dos espacios)
# no valia por `ls -l`, y `cd proyecto && pwd` no contaba ninguno de los dos. Y al reves, `WHOAMI` valia aunque
# bash responde "command not found". Ahora cada linea se parte en comandos y cada comando se reduce a una forma
# canonica:
#   - palabras como las separa bash: espacios repetidos y comillas ('a b' == "a b") no cuentan;
#   - opciones cortas como conjunto: `ls -la` == `ls -al` == `ls -l -a`;
#   - argumentos de ruta sin `./` delante ni `/` al final: `cd proyecto/` == `cd proyecto`;
#   - `cd`, `cd ~` y `cd $HOME` son lo mismo;
#   - el texto de `echo` sin distinguir mayusculas (el resto si: bash las distingue);
#   - `;`, `&&`, `||` y `&` separan comandos, y vale cualquiera de ellos.
# El nombre del programa queda tal cual: `./mi-programa` no es `mi-programa`.

_SEPARADORES = {";", "&&", "||", "&", ";;"}
_TUBERIAS = {"|", "|&"}
_REDIRECCIONES = {">", ">>", "<", "<<", "<<<", ">&", "&>", "&>>"}
# Los mas largos primero: `&&` antes que `&`, `>>` antes que `>`.
_OPERADORES = sorted(_SEPARADORES | _TUBERIAS | _REDIRECCIONES, key=len, reverse=True)


def _palabras(texto):
    """Parte la linea en palabras y operadores como bash (comillas, `\\`, `#`). ValueError si una comilla no cierra.

    No usa shlex: la Pi tiene Python 3.7 y ahi shlex no separa los operadores pegados (`ls|wc`).
    """
    texto = str(texto)
    palabras, actual, hay = [], [], False
    i, n = 0, len(texto)

    def cerrar():
        if hay:
            palabras.append("".join(actual))
        return [], False

    while i < n:
        c = texto[i]
        if c in " \t\r\n":
            actual, hay = cerrar()
            i += 1
        elif c == "#" and not hay:
            break  # comentario hasta el final
        elif c == "\\":
            if i + 1 < n:
                actual.append(texto[i + 1])
                hay = True
            i += 2
        elif c == "'":
            fin = texto.find("'", i + 1)
            if fin < 0:
                raise ValueError("comilla simple sin cerrar")
            actual.append(texto[i + 1:fin])
            hay = True
            i = fin + 1
        elif c == '"':
            j = i + 1
            while j < n and texto[j] != '"':
                if texto[j] == "\\" and j + 1 < n and texto[j + 1] in '"\\$`':
                    j += 1
                actual.append(texto[j])
                j += 1
            if j >= n:
                raise ValueError("comilla doble sin cerrar")
            hay = True
            i = j + 1
        else:
            op = next((o for o in _OPERADORES if texto.startswith(o, i)), None)
            if op:
                actual, hay = cerrar()
                palabras.append(op)
                i += len(op)
            else:
                actual.append(c)
                hay = True
                i += 1
    cerrar()
    return palabras


def _canon_arg(arg):
    if arg in ("~", "~/"):
        return "~"
    if arg.startswith("./") and len(arg) > 2:
        arg = arg[2:]
    if len(arg) > 1 and arg.endswith("/"):
        arg = arg.rstrip("/") or "/"
    return arg


def _canon_simple(palabras):
    if not palabras:
        return ()
    programa, resto = palabras[0], palabras[1:]
    opciones, args = set(), []
    for p in resto:
        if p.startswith("-") and not p.startswith("--") and len(p) > 1:
            opciones.update(p[1:])
        else:
            args.append(p if p in _REDIRECCIONES else _canon_arg(p))
    if programa == "cd" and args in ([], ["~"], ["$HOME"], ["${HOME}"]):
        args = []
    if programa == "echo":
        corte = next((i for i, a in enumerate(args) if a in _REDIRECCIONES), len(args))
        args = [a.lower() for a in args[:corte]] + args[corte:]
    return (programa, tuple(sorted(opciones)), tuple(args))


def _canon_linea(texto):
    """Lista de comandos de la linea (cada uno, una tuberia canonica), o None si bash no la entenderia asi."""
    try:
        palabras = _palabras(texto)
    except ValueError:  # comillas sin cerrar
        return None
    comandos, actual = [], [[]]
    for p in palabras + [";"]:
        if p in _SEPARADORES:
            if any(actual):
                comandos.append(tuple(_canon_simple(s) for s in actual))
            actual = [[]]
        elif p in _TUBERIAS:
            actual.append([])
        else:
            actual[-1].append(p)
    return comandos


def _clave(target):
    canon = _canon_linea(target)
    return repr(canon) if canon else _norm_cmd(target)


def _veces(cmd, target, fuzzy) -> int:
    """Cuantas veces la linea `cmd` ejecuta el comando de la regla."""
    objetivo, linea = _canon_linea(target), _canon_linea(cmd)
    if objetivo and linea is not None:
        if linea == objetivo:
            return 1
        if len(objetivo) == 1:
            veces = linea.count(objetivo[0])
            if veces:
                return veces
    elif not fuzzy and _norm_cmd(cmd) == _norm_cmd(target):
        return 1  # no se pudo partir (comillas sin cerrar): la comparacion de siempre
    # Un desafio abierto (`"fuzzy": true`, ej. "cualquier tuberia a wc -l") acepta el target como subcadena.
    return 1 if fuzzy and _norm_cmd(target) in _norm_cmd(cmd) else 0


def validate_command_executed(rule, ctx) -> bool:
    target = rule.get("target", "")
    needed = ctx.get("occurrence_by_rule_id", {}).get(rule.get("id"), 1)
    # Por defecto exige que la linea ejecute ESE comando (ver _canon_linea) -- antes cualquier
    # comando que contuviera el target como substring contaba como "ya lo
    # corriste" (ej. `sudo apt update` satisfacia la regla de `date`; `ls -l`
    # satisfacia la de `ls` a secas; `cd ~/Documents` satisfacia la de
    # `cd ~`). Un desafio abierto a proposito (ej. "pipe a wc -l, cualquier
    # comando valido") marca su regla con `"fuzzy": true` para optar
    # explicitamente por la coincidencia parcial de antes.
    fuzzy = bool(rule.get("fuzzy"))
    count = sum(_veces(cmd, target, fuzzy) for cmd in ctx["command_history"])
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
            key = _clave(rule.get("target", ""))
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
