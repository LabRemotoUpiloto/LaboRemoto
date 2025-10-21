# Pasos para resolver el problema ahora mismo

## 🚀 Ejecuta estos comandos EN ORDEN:

### 1. Para la app si está corriendo
Presiona Ctrl+C en la terminal donde corre `cargo tauri dev`

### 2. Limpia completamente
```powershell
# Desde la raíz del proyecto
cd C:\Users\ASUS\Documents\Cliente-Rust

# Limpiar Rust
cd apps\desktop\src-tauri
cargo clean

# Limpiar Vite
cd ..\web
if (Test-Path dist) { Remove-Item -Recurse -Force dist }
if (Test-Path node_modules\.vite) { Remove-Item -Recurse -Force node_modules\.vite }
```

### 3. Reconstruir
```powershell
# Volver a src-tauri
cd ..\src-tauri

# Activar debug
$env:AI_SHEBANG_DEBUG="1"
$env:AI_CORRECTION_DEBUG="1"

# Compilar y ejecutar
cargo tauri dev
```

### 4. En la app cuando abra:
1. Presiona **F12** para abrir DevTools
2. Ve a la pestaña **Console**
3. Escribe en el chat: **"crear una calculadora bash"**
4. Mira AMBOS lugares:
   - **Terminal PowerShell**: Debe mostrar `[SHEBANG]` logs
   - **Console del navegador**: Debe mostrar `[FRONTEND DEBUG]` logs

### 5. Captura esta info:

**Terminal (backend):**
```
[SHEBANG] Detectado shebang: '...'
[CORRECTION] ===== TEXTO CORREGIDO =====
...
```

**Console (frontend):**
```
[FRONTEND DEBUG] ===== RESPUESTA RECIBIDA =====
[FRONTEND DEBUG] ai_response: ...
[FRONTEND DEBUG] aiText contiene #!/bin/bash?: true/false
...
```

## 🎯 Esto nos dirá:

- Si `#!/bin/bash?: true` en frontend → Cache del NAVEGADOR
- Si `#!/bin/bash?: false` en frontend → Problema de transmisión backend→frontend
- Si terminal muestra `#!/bin/bash` pero frontend no → Problema en la serialización JSON

## ⚠️ Si aún muestra `#!/bin/`:

Significa que el **navegador tiene cache**. Solución:

1. En la app presiona: **Ctrl + Shift + Delete**
2. O en DevTools: **Application** → **Clear storage** → **Clear site data**
3. Cierra la app completamente
4. Ejecuta de nuevo `cargo tauri dev`
