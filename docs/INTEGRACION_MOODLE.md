# Integración con Moodle LMS

Esta guía explica cómo configurar la integración del Cliente SSH con Moodle para automatizar la calificación de prácticas de laboratorio.

## 📋 Tabla de Contenidos

1. [Arquitectura del Sistema](#arquitectura-del-sistema)
2. [Configuración de Moodle](#configuración-de-moodle)
3. [Configuración del Cliente](#configuración-del-cliente)
4. [Configuración de Supabase](#configuración-de-supabase)
5. [Flujo de Trabajo](#flujo-de-trabajo)
6. [Validación Automática](#validación-automática)
7. [Pruebas](#pruebas)

---

## 🏗️ Arquitectura del Sistema

```
┌─────────────┐
│   Cliente   │ (Tauri + React)
│   Desktop   │
└──────┬──────┘
       │
       │ 1. Validación local
       │    (Rust: practice_validator)
       │
       ▼
┌─────────────┐
│  Supabase   │ Backend Intermedio
│ Edge Func   │ (Seguridad)
└──────┬──────┘
       │
       │ 2. Firma con token privilegiado
       │
       ▼
┌─────────────┐
│   Moodle    │ LMS
│  Web API    │
└─────────────┘
```

### ¿Por qué un Backend Intermedio?

El token de Moodle con permisos de calificación **NO debe estar en el cliente** por seguridad. El backend intermedio (Supabase Edge Function):

1. Valida que la práctica fue completada correctamente
2. Verifica que el estudiante existe en Moodle
3. Firma la calificación con el token privilegiado
4. Registra la operación para auditoría

---

## ⚙️ Configuración de Moodle

### 1. Habilitar Servicios Web

1. Ir a **Administración del sitio** → **Funciones avanzadas**
2. Activar **Habilitar servicios web**
3. Guardar cambios

### 2. Crear un Servicio Web Personalizado

1. Ir a **Administración del sitio** → **Servidor** → **Servicios web** → **Servicios externos**
2. Clic en **Agregar**
3. Configurar:
   - **Nombre**: `Cliente SSH - Prácticas`
   - **Nombre corto**: `cliente_ssh_practicas`
   - **Habilitado**: ✓
   - **Usuarios autorizados**: Solo usuarios autorizados

### 3. Agregar Funciones al Servicio

En el servicio creado, agregar las siguientes funciones:

- `mod_assign_get_assignments` - Obtener información de tareas
- `mod_assign_get_submission_status` - Ver estado de entregas
- `mod_assign_save_grade` - Guardar calificaciones
- `core_user_get_users` - Buscar usuarios

### 4. Crear Token de Servicio Web

1. Ir a **Administración del sitio** → **Servidor** → **Servicios web** → **Gestionar tokens**
2. Clic en **Crear token**
3. Configurar:
   - **Usuario**: Cuenta de profesor/gestor con permisos de calificación
   - **Servicio**: `Cliente SSH - Prácticas`
   - **Dirección IP válida**: (opcional, para mayor seguridad)
4. Guardar y copiar el token generado

### 5. Crear Tareas en Moodle

Para cada práctica (ej: Eve3 - Práctica 1):

1. En tu curso, agregar **Actividad** → **Tarea**
2. Configurar:
   - **Nombre**: `Eve3 - Control con Teclado`
   - **Descripción**: Descripción de la práctica
   - **Calificación**: `5.00` (o el máximo que desees)
   - **Tipo de entrega**: Ninguna (la calificación viene del cliente)
3. Guardar y anotar el **ID de la tarea** (aparece en la URL)

---

## 🖥️ Configuración del Cliente

### 1. Variables de Entorno

Crear archivo `.env` en la raíz del proyecto:

```bash
# Moodle
MOODLE_URL=https://tu-moodle.com
MOODLE_TOKEN=tu_token_aqui

# Supabase (para backend intermedio)
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_ANON_KEY=tu_anon_key_aqui
```

### 2. Configurar Prácticas con Moodle

Editar `.env.practicas` y agregar los IDs de las tareas:

```bash
# Eve3 - Práctica 1
PRACTICE_EVE3_P1_NAME=Control del Robot con Teclado
PRACTICE_EVE3_P1_MOODLE_ASSIGNMENT_ID=123  # ← ID de la tarea en Moodle

# Eve3 - Práctica 2
PRACTICE_EVE3_P2_NAME=Programación del Robot
PRACTICE_EVE3_P2_MOODLE_ASSIGNMENT_ID=124  # ← ID de la tarea en Moodle
```

### 3. Variables de Entorno para React

Crear archivo `.env` en `apps/desktop/web/`:

```bash
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu_anon_key_aqui
```

---

## ☁️ Configuración de Supabase

### 1. Crear Proyecto en Supabase

1. Ir a [supabase.com](https://supabase.com)
2. Crear nuevo proyecto
3. Anotar la URL y las claves

### 2. Desplegar Edge Function

```bash
# Instalar Supabase CLI
npm install -g supabase

# Login
supabase login

# Vincular proyecto
supabase link --project-ref tu-proyecto-ref

# Desplegar función
supabase functions deploy submit-grade
```

### 3. Configurar Variables de Entorno en Supabase

```bash
# Configurar variables secretas
supabase secrets set MOODLE_URL=https://tu-moodle.com
supabase secrets set MOODLE_TOKEN=tu_token_privilegiado_aqui
```

**IMPORTANTE**: El token de Moodle en Supabase debe tener permisos de profesor/gestor.

---

## 🔄 Flujo de Trabajo

### 1. Sincronización Inicial

Al abrir una práctica, el cliente:

```typescript
// Sincroniza con Moodle
const sync = await invoke('moodle_sync_assignment', {
  assignmentId: 123,
  username: 'estudiante01'
})

// Verifica si ya fue entregada/calificada
if (sync.is_graded) {
  // Mostrar calificación existente
} else if (sync.has_submitted) {
  // Mostrar estado "entregada"
}
```

### 2. Validación en Tiempo Real

Mientras el estudiante trabaja:

```typescript
// El componente PracticeProgress valida automáticamente
const validation = await invoke('validate_practice_progress', {
  practiceId: 'eve3-p1',
  commandHistory: ['ls', 'python flechas.py']
})

// Muestra progreso en tiempo real
console.log(`Progreso: ${validation.percentage}%`)
console.log(`Aprobado: ${validation.passed}`)
```

### 3. Entrega de Práctica

Cuando el estudiante completa los objetivos:

```typescript
// 1. Calcular calificación
const gradeResult = await invoke('calculate_practice_grade', {
  practiceId: 'eve3-p1',
  commandHistory: [...],
  maxGrade: 5.0
})

// 2. Enviar a backend intermedio (Supabase)
const response = await fetch(`${SUPABASE_URL}/functions/v1/submit-grade`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
  },
  body: JSON.stringify({
    assignmentId: 123,
    username: 'estudiante01',
    grade: gradeResult.grade,
    comment: validation.feedback,
    practiceId: 'eve3-p1',
    commandHistory: [...],
    validationResult: validation
  })
})

// 3. Backend valida y envía a Moodle
// 4. Estudiante recibe confirmación
```

---

## ✅ Validación Automática

### Reglas de Validación

Las reglas se definen en `practice_validator.rs`:

```rust
// Eve3 - Práctica 1
vec![
    ValidationRule {
        rule_type: "command_executed",
        description: "Ejecutó 'ls' para listar archivos",
        target: "ls",
        required: true,
        points: 2.0,
    },
    ValidationRule {
        rule_type: "command_executed",
        description: "Ejecutó 'python flechas.py'",
        target: "python flechas.py",
        required: true,
        points: 3.0,
    },
]
```

### Tipos de Validación

- `command_executed`: Verifica que un comando fue ejecutado
- `file_created`: Verifica que se creó un archivo con cierta extensión

### Criterio de Aprobación

- **Mínimo**: 60% de los objetivos cumplidos
- **Calificación**: Proporcional al porcentaje (ej: 80% = 4.0/5.0)

### Agregar Nuevas Reglas

Para agregar validación a una nueva práctica:

```rust
// En practice_validator.rs
"nueva-practica" => vec![
    ValidationRule {
        rule_type: "command_executed",
        description: "Descripción del objetivo",
        target: "comando",
        required: true,
        points: 2.5,
    },
    // ... más reglas
],
```

---

## 🧪 Pruebas

### 1. Probar Conexión con Moodle

```bash
# En el cliente, abrir DevTools y ejecutar:
invoke('moodle_sync_assignment', {
  assignmentId: 123,
  username: 'estudiante01'
}).then(console.log)
```

### 2. Probar Validación Local

```bash
invoke('validate_practice_progress', {
  practiceId: 'eve3-p1',
  commandHistory: ['ls', 'python flechas.py']
}).then(console.log)
```

### 3. Probar Edge Function (Local)

```bash
# Iniciar Supabase localmente
supabase start

# Probar función
curl -X POST http://localhost:54321/functions/v1/submit-grade \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ANON_KEY" \
  -d '{
    "assignmentId": 123,
    "username": "estudiante01",
    "grade": 5.0,
    "comment": "Práctica completada",
    "practiceId": "eve3-p1",
    "commandHistory": ["ls", "python flechas.py"],
    "validationResult": {"passed": true, "percentage": 100}
  }'
```

### 4. Probar Flujo Completo

1. Abrir una práctica en el cliente
2. Ejecutar los comandos requeridos
3. Verificar que el progreso se actualiza en tiempo real
4. Clic en "Entregar Práctica"
5. Verificar en Moodle que la calificación fue registrada

---

## 🔒 Seguridad

### Mejores Prácticas

1. **Token de Moodle**:
   - NUNCA incluir el token privilegiado en el código del cliente
   - Usar siempre el backend intermedio (Supabase)
   - Rotar el token periódicamente

2. **Validación**:
   - El backend debe re-validar la práctica antes de calificar
   - No confiar ciegamente en los datos del cliente

3. **Auditoría**:
   - Registrar todas las calificaciones enviadas
   - Incluir timestamp, usuario, práctica y resultado

4. **Rate Limiting**:
   - Limitar intentos de entrega por estudiante
   - Prevenir spam de calificaciones

---

## 📊 Monitoreo

### Logs en Supabase

Ver logs de la Edge Function:

```bash
supabase functions logs submit-grade
```

### Métricas Importantes

- Tasa de éxito de entregas
- Tiempo promedio de validación
- Errores de conexión con Moodle
- Prácticas más completadas

---

## 🐛 Troubleshooting

### Error: "MOODLE_URL no configurado"

- Verificar que `.env` existe y tiene `MOODLE_URL`
- Reiniciar el cliente después de editar `.env`

### Error: "Usuario no encontrado en Moodle"

- Verificar que el username coincide exactamente
- El usuario debe existir en Moodle antes de usar el cliente

### Error: "Token inválido"

- Verificar que el token tiene los permisos correctos
- Verificar que el servicio web está habilitado
- Regenerar el token si es necesario

### Error: "Práctica no cumple requisitos"

- Verificar que el estudiante ejecutó todos los comandos requeridos
- Revisar las reglas de validación en `practice_validator.rs`

---

## 📚 Referencias

- [Moodle Web Services API](https://docs.moodle.org/dev/Web_services)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [Tauri Commands](https://tauri.app/v1/guides/features/command)

---

## 🤝 Soporte

Para problemas o preguntas:

1. Revisar esta documentación
2. Verificar logs en Supabase
3. Verificar logs en Moodle (Administración → Informes → Registros)
4. Contactar al administrador del sistema
