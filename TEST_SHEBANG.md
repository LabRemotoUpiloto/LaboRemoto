# Test de corrección de Shebang

## Para probar con debug activado:

### En PowerShell (antes de ejecutar la app):
```powershell
$env:AI_SHEBANG_DEBUG="1"
$env:AI_CORRECTION_DEBUG="1"
cd apps\desktop\src-tauri
cargo tauri dev
```

### Luego en la app:
Pregunta: "crear una calculadora bash"

## ¿Por qué funciona con Python pero no con Bash?

### Python no necesita shebang:
```bash
python3 script.py    # ✅ Funciona sin #!/usr/bin/python3
```

### Bash SÍ necesita shebang:
```bash
./script.sh          # ❌ Falla si no tiene #!/bin/bash
chmod +x script.sh   # ← Esto da permisos de ejecución
./script.sh          # ← Pero el sistema necesita saber QUÉ ejecutor usar
```

## Cambios implementados:

1. **Prompt reforzado**: Ahora tiene regla explícita `<rule id="shebang_mandatory">`
2. **Función `fix_incomplete_shebang`**: Detecta y corrige automáticamente:
   - `#!/bin/` → `#!/bin/bash`
   - `#!/bin` → `#!/bin/bash`
   - `#!bin/bash` → `#!/bin/bash`
   - `#!/bash` → `#!/bin/bash`

3. **Función `fix_incomplete_filenames`**: Corrige nombres en chmod/./:
   - `chmod +x calculadora.` → `chmod +x calculadora.sh`
   - `./calculadora.` → `./calculadora.sh`

## Flujo de corrección:

```
API Response
    ↓
fix_incomplete_shebang()  ← Primero: corrige #!/bin/ → #!/bin/bash
    ↓
fix_incomplete_filenames() ← Segundo: corrige calculadora. → calculadora.sh
    ↓
Respuesta final al usuario
```
