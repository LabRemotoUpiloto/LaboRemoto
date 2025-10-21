# ✅ Guía de Prueba - Corrección de Shebangs y Nombres de Archivo

## 🎯 Objetivo
Verificar que las correcciones automáticas de shebangs (`#!/bin/bash`) y nombres de archivo (`calculadora.sh`) funcionan correctamente.

---

## 📋 Cambios Implementados

### 1. **Funciones de Corrección** (en `ai.rs`)
Se agregaron dos funciones que se ejecutan **ANTES** de parsear la respuesta de Claude:

#### `fix_incomplete_shebang()`
Detecta y corrige:
- `#!/bin/` → `#!/bin/bash`
- `#!/bin` → `#!/bin/bash`
- `#!bin/bash` → `#!/bin/bash`
- `#! /bin/bash` → `#!/bin/bash`
- `#!/usr/bin/env` → `#!/usr/bin/env bash`

#### `fix_incomplete_filenames()`
Detecta y corrige:
- `chmod +x calculadora.` → `chmod +x calculadora.sh`
- `./calculadora.` → `./calculadora.sh`
- `python calculadora.` → `python3 calculadora.py`

### 2. **Reglas en el System Prompt**
Se agregaron dos reglas nuevas para que Claude genere código correcto desde el inicio:

- **`<rule id="shebang_mandatory">`**: Instrucciones explícitas sobre shebangs completos
- **`<rule id="filename_extensions">`**: Instrucciones sobre nombres de archivo con extensión

---

## 🧪 Pruebas a Realizar

### **Prueba 1: Script Bash Simple**
**Prompt de usuario:**
```
Crea un script bash que muestre "Hola Mundo"
```

**Resultado esperado:**
```bash
cat > hola.sh <<'EOF'
#!/bin/bash
echo "Hola Mundo"
EOF
```

**✅ Verificar:**
- Shebang completo: `#!/bin/bash` (NO `#!/bin/`)
- Nombre de archivo con extensión: `hola.sh`
- Mismo nombre en `chmod +x hola.sh`
- Mismo nombre en `./hola.sh`

---

### **Prueba 2: Calculadora Bash**
**Prompt de usuario:**
```
Crea una calculadora simple en bash que sume dos números
```

**Resultado esperado:**
```bash
cat > calculadora.sh <<'EOF'
#!/bin/bash
echo "Calculadora Simple"
read -p "Primer número: " num1
read -p "Segundo número: " num2
suma=$((num1 + num2))
echo "Resultado: $suma"
EOF
```

**✅ Verificar:**
- Shebang: `#!/bin/bash`
- Nombre: `calculadora.sh` (NO `calculadora.`)
- chmod: `chmod +x calculadora.sh`
- Ejecución: `./calculadora.sh`

---

### **Prueba 3: Script Python**
**Prompt de usuario:**
```
Crea un script python que calcule el factorial de un número
```

**Resultado esperado:**
```bash
cat > factorial.py <<'EOF'
#!/usr/bin/env python3

def factorial(n):
    if n <= 1:
        return 1
    return n * factorial(n - 1)

numero = int(input("Ingresa un número: "))
print(f"Factorial de {numero} es {factorial(numero)}")
EOF
```

**✅ Verificar:**
- Shebang: `#!/usr/bin/env python3`
- Nombre: `factorial.py` (NO `factorial.`)
- Ejecución: `python3 factorial.py`

---

## 🔍 Cómo Ver los Logs de Depuración

### **Opción 1: Desde PowerShell (antes de iniciar la app)**
```powershell
cd apps\desktop\src-tauri
$env:AI_SHEBANG_DEBUG="1"
$env:AI_CORRECTION_DEBUG="1"
$env:AI_FINAL_TEXT_DEBUG="1"
cargo tauri dev
```

### **Opción 2: Desde el Código (permanente)**
En `ai.rs`, buscar las líneas:
```rust
let debug = env::var("AI_SHEBANG_DEBUG").unwrap_or_default() == "1";
```

Cambiar temporalmente a:
```rust
let debug = true; // Siempre activado para pruebas
```

---

## 📊 Salida de Debug Esperada

Cuando ejecutes un prompt que genere un script Bash, deberías ver en la terminal:

```
[SHEBANG] ✓ Corrigiendo '(?m)^#!/bin/$' -> '#!/bin/bash'
[FILENAME] ✓ Corrigiendo línea: 'chmod +x calculadora.'
[FILENAME] ✓ Resultado: 'chmod +x calculadora.sh'
[AI] ═══ TEXTO FINAL DESPUÉS DE CORRECCIONES ═══
<respuesta completa del modelo con correcciones aplicadas>
[AI] ═══════════════════════════════════════════
```

---

## 🔧 Flujo de Procesamiento

1. **Claude API** devuelve la respuesta (puede tener shebangs incompletos)
2. **Extracción**: Se extrae el texto de la respuesta en `assistant_text`
3. **Limpieza**: Se elimina la frase de identidad redundante
4. **✨ CORRECCIONES** (NUEVO):
   - `fix_incomplete_shebang(assistant_text)`
   - `fix_incomplete_filenames(assistant_text)`
5. **Validación**: Se verifica si es identidad, fuera de alcance, etc.
6. **Parseo**: Se convierte a JSON o se extrae el código
7. **Envío al Frontend**: El texto ya corregido se envía a la UI

---

## 🐛 Solución de Problemas

### **Si el shebang sigue incompleto:**

1. **Verificar variables de entorno:**
   ```powershell
   echo $env:AI_SHEBANG_DEBUG
   echo $env:AI_CORRECTION_DEBUG
   ```

2. **Verificar logs en terminal:**
   - ¿Ves `[SHEBANG] ✓ Corrigiendo...`?
   - Si NO aparece: Claude está generando shebangs correctos desde el inicio
   - Si aparece: Las correcciones están funcionando

3. **Limpiar caché del navegador:**
   - Abrir DevTools (F12)
   - Application → Clear storage → Clear site data

4. **Verificar que el código compiló correctamente:**
   ```powershell
   cd apps\desktop\src-tauri
   cargo check
   ```

---

## 📝 Notas Importantes

### **¿Por qué dos capas de protección?**

1. **Reglas en el System Prompt**: Guían a Claude para generar código correcto desde el inicio
2. **Funciones de Corrección**: Garantizan que incluso si Claude falla, el código se corrige automáticamente

### **Orden de ejecución crítico**
Las correcciones DEBEN ejecutarse:
- ✅ **DESPUÉS** de extraer `assistant_text`
- ✅ **ANTES** de validar/parsear la respuesta
- ✅ **ANTES** de enviar al frontend

---

## ✅ Checklist de Verificación

- [ ] El código compila sin errores (`cargo check`)
- [ ] La app arranca correctamente (`cargo tauri dev`)
- [ ] Variables de debug configuradas
- [ ] Logs visibles en terminal
- [ ] Prueba 1: Script Bash simple → shebang completo
- [ ] Prueba 2: Calculadora → nombre completo con `.sh`
- [ ] Prueba 3: Script Python → shebang y extensión `.py`
- [ ] Caché del navegador limpiado
- [ ] Verificar que los 3 bloques usan el mismo nombre de archivo

---

## 🎉 Resultado Final Esperado

```bash
# Bloque 1: Crear archivo
cat > calculadora.sh <<'EOF'
#!/bin/bash
# código aquí
EOF

# Bloque 2: Dar permisos
chmod +x calculadora.sh

# Bloque 3: Ejecutar
./calculadora.sh
```

**TODO correcto:**
- ✅ Shebang completo: `#!/bin/bash`
- ✅ Nombre completo en los 3 bloques: `calculadora.sh`
- ✅ Sin puntos solos: `calculadora.` ❌ → `calculadora.sh` ✅

---

## 🔗 Archivos Modificados

1. `apps/desktop/src-tauri/src/cmd/ai.rs`:
   - Líneas 545-650: Funciones `fix_incomplete_shebang()` y `fix_incomplete_filenames()`
   - Líneas 170-240: Reglas `shebang_mandatory` y `filename_extensions` en system prompt

2. `apps/desktop/src-tauri/Cargo.toml`:
   - Dependencia `regex = "1"` (ya existente)

---

**Autor:** GitHub Copilot  
**Fecha:** Implementación completada  
**Estado:** ✅ Listo para pruebas
