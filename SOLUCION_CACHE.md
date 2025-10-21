# Solución al problema de cache del frontend

## 🔍 Diagnóstico:
- **Backend:** ✅ Corrige correctamente (`#!/bin/bash` en el log)
- **Frontend:** ❌ Muestra versión antigua (`#!/bin/`)

## ⚡ Causa:
El frontend tiene **cache de conversaciones** en:
1. `localStorage` del navegador
2. Estado de React (historial de mensajes)
3. Posible cache de Vite/Tauri en desarrollo

## 🛠️ Solución (ejecutar en orden):

### 1. Limpiar build de Tauri:
```powershell
cd apps\desktop\src-tauri
cargo clean
Remove-Item -Recurse -Force target\debug\*
```

### 2. Limpiar build de Vite:
```powershell
cd ..\web
Remove-Item -Recurse -Force dist
Remove-Item -Recurse -Force node_modules\.vite
```

### 3. Reconstruir TODO desde cero:
```powershell
cd ..\..\..
cd apps\desktop\src-tauri
cargo build
```

### 4. Ejecutar con variables de debug:
```powershell
$env:AI_SHEBANG_DEBUG="1"
$env:AI_CORRECTION_DEBUG="1"
cargo tauri dev
```

### 5. En la app:
1. Abre DevTools (F12)
2. Ve a "Application" → "Local Storage"
3. Elimina todas las claves relacionadas con chat/conversación
4. Recarga la app (Ctrl+R)
5. Prueba de nuevo: "crear una calculadora bash"

## 🎯 Verificación:

### En la terminal deberías ver:
```
[SHEBANG] Detectado shebang: '#!/bin/bash'
[SHEBANG] - No necesita corrección: '#!/bin/bash'
```

### En la app deberías ver:
```bash
cat > calculadora.sh <<'EOF'
#!/bin/bash    ← ✅ CORRECTO (no #!/bin/)
```

## 🔄 Si persiste:

Añade logging en el frontend para ver qué recibe:

```typescript
// En ChatPane.tsx línea ~242
console.log('[FRONTEND] Respuesta recibida:', res);
console.log('[FRONTEND] ai_response:', (res as any).ai_response);
console.log('[FRONTEND] explanation:', (res as any).explanation);
```

Esto te dirá si el problema es:
- Backend enviando mal → Arreglar backend
- Frontend parseando mal → Arreglar frontend
- Cache persistente → Limpiar más agresivamente
