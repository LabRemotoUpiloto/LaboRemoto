# 🎯 Solución Definitiva: Shebangs y Nombres de Archivo Completos

## 📌 Problema Original
Claude Sonnet 4.5 generaba:
- Shebangs incompletos: `#!/bin/` en lugar de `#!/bin/bash`
- Nombres de archivo incompletos: `calculadora.` en lugar de `calculadora.sh`

---

## ✅ Solución Implementada

### **Enfoque de Doble Capa**

#### **Capa 1: Reglas en el System Prompt**
Se agregaron reglas explícitas para guiar a Claude:

```xml
<rule id="shebang_mandatory">
CRÍTICO - Shebangs COMPLETOS:

Scripts Bash: SIEMPRE #!/bin/bash (NUNCA #!/bin/ ni #!/bin)
Scripts Python: SIEMPRE #!/usr/bin/env python3

INCORRECTO: #!/bin/, #!/bin, #!bin/bash
CORRECTO: #!/bin/bash, #!/usr/bin/env python3
</rule>

<rule id="filename_extensions">
CRÍTICO - Nombres de archivo COMPLETOS:

Siempre incluir extensión en los 3 bloques:
- Scripts Bash: .sh
- Scripts Python: .py

INCORRECTO: calculadora., chmod +x calculadora.
CORRECTO: calculadora.sh, chmod +x calculadora.sh
</rule>
```

**Ubicación:** `apps/desktop/src-tauri/src/cmd/ai.rs` (líneas ~170-240)

---

#### **Capa 2: Correcciones Automáticas en Backend**

Dos funciones que se ejecutan **ANTES** de parsear la respuesta de Claude:

##### 1. `fix_incomplete_shebang(text: &str) -> String`
**Qué hace:**
- Detecta patrones de shebangs incompletos usando regex
- Corrige automáticamente a `#!/bin/bash` o `#!/usr/bin/env bash`

**Patrones detectados:**
```rust
"#!/bin/"       → "#!/bin/bash"
"#!/bin"        → "#!/bin/bash"
"#!bin/bash"    → "#!/bin/bash"
"#! /bin/bash"  → "#!/bin/bash"
"#!/usr/bin/env " → "#!/usr/bin/env bash"
```

**Debug:**
```rust
let debug = env::var("AI_SHEBANG_DEBUG").unwrap_or_default() == "1";
```

##### 2. `fix_incomplete_filenames(text: &str) -> String`
**Qué hace:**
- Detecta comandos con nombres de archivo incompletos
- Agrega la extensión correcta según el contexto

**Patrones detectados:**
```rust
"chmod +x calculadora."  → "chmod +x calculadora.sh"
"./calculadora."         → "./calculadora.sh"
"python calculadora."    → "python3 calculadora.py"
```

**Debug:**
```rust
let debug = env::var("AI_CORRECTION_DEBUG").unwrap_or_default() == "1";
```

**Ubicación:** `apps/desktop/src-tauri/src/cmd/ai.rs` (líneas ~545-650)

---

### **Punto de Ejecución Crítico**

Las correcciones se aplican en el orden correcto:

```rust
// 1. Extraer respuesta de Claude API
let mut assistant_text = if model_selection.is_claude() {
    body.get("content")...
} else {
    body.get("choices")...
};

// 2. Limpiar mensajes redundantes
if !is_identity_query_strict(&user_input) {
    let mut cleaned = assistant_text.replace(MENSAJE_IDENTIDAD, "");
    assistant_text = cleaned.trim().to_string();
}

// 3. ✨ APLICAR CORRECCIONES (NUEVO)
assistant_text = fix_incomplete_shebang(&assistant_text);
assistant_text = fix_incomplete_filenames(&assistant_text);

// 4. Debug final (opcional)
if env::var("AI_FINAL_TEXT_DEBUG").unwrap_or_default() == "1" {
    eprintln!("[AI] ═══ TEXTO FINAL DESPUÉS DE CORRECCIONES ═══");
    eprintln!("{}", assistant_text);
}

// 5. Continuar con validación y parseo
if !is_identity_query_strict(&user_input) {
    // Validaciones...
}
```

---

## 🔍 Verificación del Flujo

### **Antes (Problema):**
```
Claude API → "#!/bin/" → Frontend muestra "#!/bin/"
```

### **Después (Solución):**
```
Claude API → "#!/bin/" → fix_incomplete_shebang() → "#!/bin/bash" → Frontend muestra "#!/bin/bash"
```

---

## 🧪 Activar Debug

### **PowerShell:**
```powershell
cd apps\desktop\src-tauri
$env:AI_SHEBANG_DEBUG="1"
$env:AI_CORRECTION_DEBUG="1"
$env:AI_FINAL_TEXT_DEBUG="1"
cargo tauri dev
```

### **Salida esperada:**
```
[SHEBANG] ✓ Corrigiendo '(?m)^#!/bin/$' -> '#!/bin/bash'
[FILENAME] ✓ Corrigiendo línea: 'chmod +x calculadora.'
[FILENAME] ✓ Resultado: 'chmod +x calculadora.sh'
[AI] ═══ TEXTO FINAL DESPUÉS DE CORRECCIONES ═══
<respuesta completa>
[AI] ═══════════════════════════════════════════
```

---

## 📊 Casos de Prueba

### **Caso 1: Script Bash Simple**
**Input:** "Crea un script que muestre hola mundo"  
**Salida esperada:**
```bash
cat > hola.sh <<'EOF'
#!/bin/bash
echo "Hola Mundo"
EOF

chmod +x hola.sh
./hola.sh
```

### **Caso 2: Calculadora**
**Input:** "Crea una calculadora en bash"  
**Salida esperada:**
```bash
cat > calculadora.sh <<'EOF'
#!/bin/bash
# código
EOF

chmod +x calculadora.sh
./calculadora.sh
```

### **Caso 3: Script Python**
**Input:** "Crea un script python que calcule factorial"  
**Salida esperada:**
```bash
cat > factorial.py <<'EOF'
#!/usr/bin/env python3
# código
EOF

python3 factorial.py
```

---

## 🔧 Archivos Modificados

### **1. `apps/desktop/src-tauri/src/cmd/ai.rs`**
- **Líneas ~170-240:** Reglas `shebang_mandatory` y `filename_extensions`
- **Líneas ~545-650:** Funciones `fix_incomplete_shebang()` y `fix_incomplete_filenames()`
- **Líneas ~651-658:** Llamadas a las funciones de corrección + debug

### **2. `apps/desktop/src-tauri/Cargo.toml`**
- Dependencia `regex = "1"` (ya existente)

---

## ✅ Checklist de Implementación

- [x] Funciones de corrección implementadas
- [x] Reglas agregadas al system prompt
- [x] Funciones colocadas en el orden correcto
- [x] Debug logging configurado
- [x] Código compila sin errores
- [x] Documentación de pruebas creada

---

## 🎯 Resultado Final

**Garantías:**
1. Si Claude genera `#!/bin/` → Backend corrige a `#!/bin/bash`
2. Si Claude genera `calculadora.` → Backend corrige a `calculadora.sh`
3. Las correcciones se aplican ANTES de enviar al frontend
4. Las correcciones NO interfieren con la lógica de validación/parseo

**Ventajas:**
- ✅ Corrección automática transparente
- ✅ Sin cambios en el frontend
- ✅ Debug detallado para troubleshooting
- ✅ Reglas guían a Claude para generar código correcto desde el inicio
- ✅ Funciones de corrección actúan como red de seguridad

---

## 📝 Próximos Pasos

1. **Ejecutar la app** con debug activo
2. **Probar** los 3 casos de prueba
3. **Verificar logs** para confirmar que las correcciones funcionan
4. **Limpiar caché** del navegador si es necesario
5. **Desactivar debug** una vez confirmado que funciona

---

**Estado:** ✅ Implementación completa y compilada  
**Fecha:** Implementado  
**Autor:** GitHub Copilot
