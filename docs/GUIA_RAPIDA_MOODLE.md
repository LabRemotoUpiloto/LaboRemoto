# 🚀 Guía Rápida - Integración Moodle

## Pasos para Configurar (15 minutos)

### 1️⃣ Configurar Moodle (5 min)

```bash
# En Moodle:
1. Administración → Funciones avanzadas → ✓ Habilitar servicios web
2. Servidor → Servicios web → Servicios externos → Agregar
   - Nombre: "Cliente SSH - Prácticas"
   - Agregar funciones:
     * mod_assign_get_assignments
     * mod_assign_get_submission_status
     * mod_assign_save_grade
     * core_user_get_users
3. Servidor → Servicios web → Gestionar tokens → Crear token
   - Usuario: Profesor con permisos
   - Servicio: "Cliente SSH - Prácticas"
   - Copiar token generado
```

### 2️⃣ Crear Tareas en Moodle (3 min)

```bash
# Para cada práctica:
1. En tu curso → Agregar actividad → Tarea
2. Configurar:
   - Nombre: "Eve3 - Control con Teclado"
   - Calificación: 5.00
   - Tipo de entrega: Ninguna
3. Guardar y anotar el ID (en la URL: ?id=123)
```

### 3️⃣ Configurar Variables de Entorno (2 min)

Crear `c:\Users\DELL\Documents\Cliente-Rust\.env`:

```bash
# Moodle
MOODLE_URL=https://tu-moodle.com
MOODLE_TOKEN=abc123def456...

# Supabase (opcional por ahora, para testing directo)
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_ANON_KEY=eyJ...
```

Editar `c:\Users\DELL\Documents\Cliente-Rust\.env.practicas`:

```bash
# Agregar al final:
PRACTICE_EVE3_P1_MOODLE_ASSIGNMENT_ID=123
PRACTICE_EVE3_P2_MOODLE_ASSIGNMENT_ID=124
```

### 4️⃣ Compilar y Probar (5 min)

```bash
cd c:\Users\DELL\Documents\Cliente-Rust\apps\desktop

# Compilar
npm run tauri build

# O ejecutar en desarrollo
npm run tauri dev
```

---

## 🧪 Prueba Rápida (Sin Supabase)

Para probar sin configurar Supabase, puedes usar el modo de testing directo:

### Opción A: Solo Validación Local

```typescript
// En el componente React
const validation = await invoke('validate_practice_progress', {
  practiceId: 'eve3-p1',
  commandHistory: ['ls', 'python flechas.py']
})

console.log('Progreso:', validation.percentage + '%')
console.log('Aprobado:', validation.passed)
```

### Opción B: Testing Directo a Moodle (Solo Desarrollo)

```typescript
// ADVERTENCIA: Solo para testing, no usar en producción
const user = await invoke('moodle_sync_assignment', {
  assignmentId: 123,
  username: 'estudiante01'
})

if (validation.passed) {
  await invoke('moodle_submit_grade_direct', {
    assignmentId: 123,
    userId: user.user.id,
    grade: 5.0,
    comment: validation.feedback
  })
}
```

---

## 📋 Checklist de Verificación

- [ ] Servicios web habilitados en Moodle
- [ ] Token creado con permisos correctos
- [ ] Tareas creadas en Moodle con IDs anotados
- [ ] Archivo `.env` creado con MOODLE_URL y MOODLE_TOKEN
- [ ] IDs de tareas agregados a `.env.practicas`
- [ ] Cliente compilado sin errores
- [ ] Prueba de validación local funciona
- [ ] Prueba de sincronización con Moodle funciona

---

## 🎯 Próximos Pasos

### Para Producción (Recomendado)

1. **Configurar Supabase** (30 min):
   - Crear proyecto en supabase.com
   - Desplegar Edge Function
   - Configurar variables secretas
   - Ver: `docs/INTEGRACION_MOODLE.md`

2. **Integrar UI en React**:
   - Agregar componente `PracticeProgress` al `TerminalView`
   - Pasar `commandHistory` desde el terminal
   - Ver ejemplo de integración abajo

### Ejemplo de Integración UI

```tsx
// En TerminalView.tsx
import PracticeProgress from '../practice/PracticeProgress'

const TerminalView = ({ practiceId, student, ... }) => {
  const [commandHistory, setCommandHistory] = useState<string[]>([])

  // Capturar comandos del terminal
  const handleCommandExecuted = (cmd: string) => {
    setCommandHistory(prev => [...prev, cmd])
  }

  return (
    <div className="terminal-view">
      {/* Terminal existente */}
      <TerminalPane 
        sessionId={sessionId}
        onCommandExecuted={handleCommandExecuted}
      />

      {/* Panel de progreso (si es una práctica) */}
      {practiceId && (
        <PracticeProgress
          practiceId={practiceId}
          assignmentId={123} // Obtener del .env.practicas
          student={student}
          commandHistory={commandHistory}
        />
      )}
    </div>
  )
}
```

---

## ❓ FAQ

**P: ¿Necesito Supabase obligatoriamente?**  
R: Para desarrollo/testing puedes usar `moodle_submit_grade_direct`, pero para producción SÍ necesitas Supabase por seguridad.

**P: ¿Cómo obtengo el ID de una tarea?**  
R: Entra a la tarea en Moodle y mira la URL: `mod/assign/view.php?id=123` → el ID es 123.

**P: ¿El token debe ser del estudiante o del profesor?**  
R: Del profesor/gestor, porque necesita permisos para calificar.

**P: ¿Puedo probar sin estudiantes reales?**  
R: Sí, crea usuarios de prueba en Moodle e inscríbelos en el curso.

---

## 🆘 Errores Comunes

### "Error de conexión a Moodle"
→ Verifica que `MOODLE_URL` no tenga `/` al final  
→ Verifica que el servidor Moodle esté accesible

### "Token inválido"
→ Verifica que copiaste el token completo  
→ Verifica que el servicio web está habilitado

### "Usuario no encontrado"
→ El username debe coincidir exactamente con Moodle  
→ El usuario debe existir antes de usar el cliente

### "Función no permitida"
→ Verifica que agregaste todas las funciones al servicio web  
→ Verifica que el token está asociado al servicio correcto

---

## 📞 Contacto

Si tienes problemas, revisa:
1. Esta guía
2. `docs/INTEGRACION_MOODLE.md` (documentación completa)
3. Logs del cliente (DevTools → Console)
4. Logs de Moodle (Administración → Informes → Registros)
