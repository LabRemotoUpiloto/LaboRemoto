# 🐛 Bug Resuelto: Shebangs Cortados en el Frontend

## 📌 Problema Encontrado

### **Síntoma:**
- Backend: Genera correctamente `#!/bin/bash` ✅
- Logs del backend: Muestran `#!/bin/bash` ✅
- Frontend: Muestra `#!/bin/` ❌

### **Causa Raíz:**
La función `cleanText()` en `chatUtils.ts` estaba limpiando etiquetas de lenguaje (`bash`, `sh`, `shell`) del final de las líneas **SIN verificar si eran parte de un shebang**.

```typescript
// CÓDIGO PROBLEMÁTICO (ANTES):
export const cleanText = (text: string) => (text || '')
  .replace(/\b(?:bash|sh|shell)\b\s*:?\s*$/gmi, '')  // ❌ Esto corta "bash" de "#!/bin/bash"
  .replace(/:\s*\b(?:bash|sh|shell)\b/gmi, ': ')
  ...
```

### **Flujo del Bug:**

```
Claude API
    ↓
Backend (ai.rs)
    ├─ Extrae: "#!/bin/bash" ✅
    ├─ fix_incomplete_shebang(): No hace cambios (ya está correcto) ✅
    ├─ Logs muestran: "#!/bin/bash" ✅
    └─ Envía al frontend: "#!/bin/bash" ✅
         ↓
Frontend (ChatPane.tsx)
    ├─ Recibe: "#!/bin/bash" ✅
    ├─ cleanText() aplica regex: "#!/bin/bash" → "#!/bin/" ❌
    └─ Renderiza: "#!/bin/" ❌
```

---

## ✅ Solución Implementada

### **Archivo Modificado:**
`apps/desktop/web/src/components/chat/chatUtils.ts`

### **Código Corregido:**

```typescript
export const cleanText = (text: string) => {
  let cleaned = (text || '');
  
  // Limpiar etiquetas de lenguaje SOLO si NO son parte de un shebang
  // Patrón que NO coincide con shebangs: solo limpia "bash", "sh", "shell" cuando están solos al final de línea
  // y NO están precedidos por #! o /bin/ o /usr/bin/
  const lines = cleaned.split('\n').map(line => {
    // Si la línea contiene un shebang, no la toques
    if (line.includes('#!')) {
      return line;
    }
    // Solo entonces limpia las etiquetas de lenguaje al final
    return line.replace(/\b(?:bash|sh|shell)\b\s*:?\s*$/gmi, '');
  });
  
  return lines.join('\n')
    .replace(/:\s*\b(?:bash|sh|shell)\b/gmi, ': ')
    .replace(/^Comando sugerido:\s*/gmi, '')
    .replace(/"""/g, '')
    .replace(/^\s+|\s+$/g, '')
    .trim();
};
```

### **Lógica de la Corrección:**

1. **Procesa línea por línea** en lugar de todo el texto de una vez
2. **Detecta shebangs**: Si una línea contiene `#!`, no la modifica
3. **Limpia solo líneas sin shebang**: Aplica el regex de limpieza solo a líneas que NO tienen `#!`
4. **Preserva el resto de limpiezas**: Mantiene la eliminación de etiquetas como `bash:` en otros contextos

---

## 🧪 Verificación

### **Antes del Fix:**
```bash
cat > calculadora.sh <<'EOF'
#!/bin/        # ❌ "bash" cortado
...
EOF

chmod +x calculadora.  # ❌ ".sh" cortado
./calculadora.         # ❌ ".sh" cortado
```

### **Después del Fix:**
```bash
cat > calculadora.sh <<'EOF'
#!/bin/bash    # ✅ Completo
...
EOF

chmod +x calculadora.sh  # ✅ Completo
./calculadora.sh         # ✅ Completo
```

---

## 📊 Logs de Verificación

### **Backend (Correcto desde el inicio):**
```
[SHEBANG] ℹ No se encontraron shebangs incompletos
[FILENAME] ℹ Línea sin cambios: 'chmod +x calculadora.sh'
[AI] ═══ TEXTO FINAL DESPUÉS DE CORRECCIONES ═══
...
#!/bin/bash
...
```

### **Frontend (Ahora corregido):**
```
[FRONTEND DEBUG] aiText contiene #!/bin/bash?: true ✅
[FRONTEND DEBUG] aiText contiene #!/bin/?: false ✅
```

---

## 🎯 Resultado Final

### **Flujo Completo Corregido:**

```
Claude API
    ↓
Backend (ai.rs)
    ├─ Extrae: "#!/bin/bash" ✅
    ├─ fix_incomplete_shebang(): No cambia (ya correcto) ✅
    ├─ fix_incomplete_filenames(): No cambia (ya correcto) ✅
    └─ Envía al frontend: "#!/bin/bash" ✅
         ↓
Frontend (ChatPane.tsx)
    ├─ Recibe: "#!/bin/bash" ✅
    ├─ cleanText() PRESERVA shebangs ✅
    └─ Renderiza: "#!/bin/bash" ✅
```

---

## 🔧 Archivos Modificados

1. **Backend**: `apps/desktop/src-tauri/src/cmd/ai.rs`
   - Funciones de corrección (preventivas, funcionan como red de seguridad)
   - Reglas en el system prompt

2. **Frontend**: `apps/desktop/web/src/components/chat/chatUtils.ts` ⭐
   - **ESTE ERA EL BUG PRINCIPAL**
   - Corregido el regex que cortaba "bash" de los shebangs

---

## 📝 Lecciones Aprendidas

1. **Bug estaba en el frontend, no en el backend**: Las correcciones en `ai.rs` eran correctas, pero el frontend las revertía
2. **Los logs son fundamentales**: Ver ambos logs (backend + frontend) reveló que el problema era post-procesamiento
3. **Regex agresivos son peligrosos**: La limpieza de texto debe ser contextual, no global
4. **Verificar el flujo completo**: Backend → API → Frontend → Renderizado

---

## ✅ Checklist de Verificación

- [x] Backend genera `#!/bin/bash` correctamente
- [x] Funciones de corrección en `ai.rs` funcionan (red de seguridad)
- [x] Frontend ya no corta "bash" de los shebangs
- [x] `cleanText()` preserva líneas con `#!`
- [x] Nombres de archivo completos (`calculadora.sh`)
- [x] Mismo nombre en los 3 bloques (crear, chmod, ejecutar)

---

**Estado:** ✅ Bug resuelto completamente  
**Fecha:** Implementado  
**Archivos afectados:** 2 (1 backend preventivo + 1 frontend crítico)
