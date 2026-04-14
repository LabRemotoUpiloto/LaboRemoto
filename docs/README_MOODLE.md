# 🎓 Integración con Moodle - Guía Completa

Sistema de calificación automática de prácticas de laboratorio integrado con Moodle LMS.

---

## 📚 Índice

1. [Inicio Rápido](#-inicio-rápido-15-minutos)
2. [Configuración de Moodle](#-configuración-de-moodle)
3. [Configuración del Cliente](#-configuración-del-cliente)
4. [Integración UI](#-integración-ui)
5. [Pruebas](#-pruebas)
6. [Troubleshooting](#-troubleshooting)

---

## 🚀 Inicio Rápido (15 minutos)

### Paso 1: Configurar Moodle (5 min)

```bash
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
   - Copiar token generado
```

### Paso 2: Crear Tareas (3 min)

```bash
En tu curso → Agregar actividad → Tarea

Para cada práctica:
- Nombre: "Eve3 - Control con Teclado"
- Calificación: 5.00
- Tipo de entrega: Ninguna
- Guardar y anotar el ID (en URL: ?id=123)
```

### Paso 3: Configurar Variables (2 min)

Crear `.env` en la raíz:

```bash
MOODLE_URL=https://tu-moodle.com
MOODLE_TOKEN=abc123def456...
```

Editar `.env.practicas`:

```bash
PRACTICE_EVE3_P1_MOODLE_ASSIGNMENT_ID=123
PRACTICE_EVE3_P2_MOODLE_ASSIGNMENT_ID=124
```

### Paso 4: Compilar (5 min)

```bash
cd apps/desktop
npm run tauri dev
```

---

## ⚙️ Configuración de Moodle

### 1. Habilitar Servicios Web

**Ruta:** Administración del sitio → Funciones avanzadas

- ✓ Habilitar servicios web
- Guardar cambios

### 2. Crear Servicio Web Personalizado

**Ruta:** Administración → Servidor → Servicios web → Servicios externos

Clic en **Agregar** y configurar:

| Campo | Valor |
|-------|-------|
| Nombre | Cliente SSH - Prácticas |
| Nombre corto | cliente_ssh_practicas |
| Habilitado | ✓ |
| Usuarios autorizados | Solo usuarios autorizados |

### 3. Agregar Funciones al Servicio

En el servicio creado, agregar estas funciones:

| Función | Propósito |
|---------|-----------|
| `mod_assign_get_assignments` | Obtener información de tareas |
| `mod_assign_get_submission_status` | Ver estado de entregas |
| `mod_assign_save_grade` | Guardar calificaciones |
| `core_user_get_users` | Buscar usuarios |

### 4. Crear Token

**Ruta:** Administración → Servidor → Servicios web → Gestionar tokens

Clic en **Crear token**:

| Campo | Valor |
|-------|-------|
| Usuario | Cuenta de profesor/gestor |
| Servicio | Cliente SSH - Prácticas |
| Dirección IP válida | (opcional) |

**Guardar y copiar el token generado** ← Importante

### 5. Crear Tareas

Para cada práctica:

1. En tu curso → **Agregar actividad** → **Tarea**
2. Configurar:
   - **Nombre**: Eve3 - Control con Teclado
   - **Descripción**: Descripción de la práctica
   - **Calificación**: 5.00
   - **Tipo de entrega**: Ninguna
3. Guardar y **anotar el ID** (aparece en la URL: `?id=123`)

---

## 🖥️ Configuración del Cliente

### Variables de Entorno

Crear archivo `.env` en `c:\Users\DELL\Documents\Cliente-Rust\`:

```bash
# Moodle
MOODLE_URL=https://tu-moodle.com
MOODLE_TOKEN=tu_token_completo_aqui

# IA (opcional)
OPENAI_API_KEY=tu_api_key_aqui
```

### Configurar IDs de Tareas

Editar `.env.practicas` y agregar:

```bash
# ... configuración existente ...

# IDs de tareas en Moodle
PRACTICE_EVE3_P1_MOODLE_ASSIGNMENT_ID=123
PRACTICE_EVE3_P2_MOODLE_ASSIGNMENT_ID=124
```

---

## 🎨 Integración UI

Ver guía completa: **`INTEGRACION_UI_REACT.md`**

### Resumen Rápido

1. **Agregar componente** `PracticeProgress` a `TerminalView.tsx`
2. **Usar hook** `useCommandHistory` para capturar comandos
3. **Conectar** datos del terminal con el validador

Ejemplo básico:

```tsx
import PracticeProgress from '../practice/PracticeProgress';
import { useCommandHistory } from '../../hooks/useCommandHistory';

const TerminalView = ({ practiceId, student, assignmentId }) => {
  const { commandHistory, processTerminalData } = useCommandHistory();

  return (
    <div className="terminal-view">
      <TerminalPane onTerminalData={processTerminalData} />
      
      {practiceId && (
        <PracticeProgress
          practiceId={practiceId}
          assignmentId={assignmentId}
          student={student}
          commandHistory={commandHistory}
        />
      )}
    </div>
  );
};
```

---

## 🧪 Pruebas

### Verificar Conexión con Moodle

Abre DevTools (F12) en el cliente:

```javascript
invoke('moodle_sync_assignment', {
  assignmentId: 123,
  username: 'estudiante01'
}).then(result => {
  console.log('✅ Conexión exitosa:', result);
}).catch(err => {
  console.error('❌ Error:', err);
});
```

### Probar Validación

```javascript
invoke('validate_practice_progress', {
  practiceId: 'eve3-p1',
  commandHistory: ['ls', 'python flechas.py']
}).then(result => {
  console.log('Progreso:', result.percentage + '%');
  console.log('Aprobado:', result.passed);
  console.log('Feedback:', result.feedback);
});
```

### Probar Calificación (con usuario de prueba)

```javascript
// Primero obtener el ID del usuario
invoke('moodle_sync_assignment', {
  assignmentId: 123,
  username: 'estudiante_prueba'
}).then(sync => {
  // Luego enviar calificación
  return invoke('moodle_submit_grade_direct', {
    assignmentId: 123,
    userId: sync.user.id,
    grade: 5.0,
    comment: 'Práctica completada - Testing'
  });
}).then(() => {
  console.log('✅ Calificación enviada');
});
```

---

## 🔄 Flujo de Trabajo

### Desde la Perspectiva del Estudiante

1. **Inicia práctica** → Cliente sincroniza con Moodle
2. **Trabaja en terminal** → Sistema valida en tiempo real
3. **Ve su progreso** → Barra visual con objetivos
4. **Completa ≥60%** → Botón "Entregar" se habilita
5. **Entrega práctica** → Calificación enviada automáticamente
6. **Ve confirmación** → Puede verificar en Moodle

### Desde la Perspectiva del Sistema

```
Terminal SSH
    ↓ (captura comandos)
useCommandHistory
    ↓ (extrae comandos limpios)
practice_validator.rs
    ↓ (valida reglas)
PracticeProgress UI
    ↓ (muestra progreso)
moodle_submit_grade_direct
    ↓ (envía calificación)
Moodle LMS
```

---

## 🔍 Validación Automática

### Reglas por Práctica

#### Eve3 - Práctica 1 (Control con Teclado)

| Objetivo | Puntos | Requerido |
|----------|--------|-----------|
| Ejecutó `ls` | 2.0 | ✓ |
| Ejecutó `python flechas.py` | 3.0 | ✓ |
| **Total** | **5.0** | |

#### Eve3 - Práctica 2 (Programación)

| Objetivo | Puntos | Requerido |
|----------|--------|-----------|
| Usó `nano` | 1.5 | ✓ |
| Creó archivo `.py` | 2.0 | ✓ |
| Ejecutó con `python3` | 1.5 | ✓ |
| **Total** | **5.0** | |

### Criterio de Aprobación

- **Mínimo**: 60% de objetivos cumplidos
- **Calificación**: Proporcional al porcentaje
  - 100% → 5.0/5.0
  - 80% → 4.0/5.0
  - 60% → 3.0/5.0

### Agregar Nueva Práctica

Editar `src/cmd/practice_validator.rs`:

```rust
"mi-practica" => vec![
    ValidationRule {
        rule_type: "command_executed",
        description: "Ejecutó comando X",
        target: "comando_x",
        required: true,
        points: 2.5,
    },
    ValidationRule {
        rule_type: "file_created",
        description: "Creó archivo .txt",
        target: ".txt",
        required: true,
        points: 2.5,
    },
],
```

---

## 🐛 Troubleshooting

### Error: "MOODLE_URL no configurado"

**Causa:** Archivo `.env` no existe o está mal ubicado

**Solución:**
1. Verificar que `.env` está en la raíz del proyecto
2. Verificar que contiene `MOODLE_URL=...`
3. Reiniciar el cliente

### Error: "Token inválido"

**Causa:** Token incorrecto o sin permisos

**Solución:**
1. Verificar que copiaste el token completo
2. Verificar que el servicio web está habilitado
3. Verificar que el token está asociado al servicio correcto
4. Regenerar el token si es necesario

### Error: "Usuario no encontrado en Moodle"

**Causa:** Username no coincide

**Solución:**
1. El username debe ser **exactamente** igual a Moodle
2. Verificar que el usuario existe en Moodle
3. Verificar que está inscrito en el curso

### Error: "Función no permitida"

**Causa:** Falta agregar funciones al servicio

**Solución:**
1. Ir a Servicios externos → Cliente SSH - Prácticas
2. Verificar que están todas las funciones:
   - `mod_assign_get_assignments`
   - `mod_assign_get_submission_status`
   - `mod_assign_save_grade`
   - `core_user_get_users`

### La calificación no aparece en Moodle

**Solución:**
1. Verificar que el `assignmentId` es correcto
2. Verificar que el `userId` es correcto
3. Ver logs en Moodle:
   - Administración → Informes → Registros
   - Filtrar por: `mod_assign_save_grade`

### Comandos no se capturan

**Solución:**
1. Verificar que `useCommandHistory` está conectado
2. Verificar que `onTerminalData` se pasa correctamente
3. Ver logs en DevTools Console

---

## 🔒 Seguridad

### ¿Es seguro el token en el cliente?

**Para laboratorios universitarios: SÍ**

**Razones:**
- El cliente solo se usa en computadoras del laboratorio
- No se distribuye públicamente
- Entorno controlado por la universidad

### Recomendaciones

✅ **Usar token con permisos mínimos**
- Solo permisos para calificar tareas específicas
- No permisos de administrador

✅ **Rotar el token periódicamente**
- Cambiar cada semestre
- Regenerar si hay sospecha de compromiso

✅ **Monitorear logs**
- Revisar actividad en Moodle
- Detectar anomalías

---

## 📊 Monitoreo

### Logs del Cliente

Ver en DevTools Console:

```javascript
// Activar modo debug
localStorage.setItem('debug_practice', 'true');
```

### Logs de Moodle

**Ruta:** Administración → Informes → Registros

**Filtros útiles:**
- Módulo: `assign`
- Acción: `grade submission`
- Usuario: (profesor que califica)

---

## 📋 Checklist de Implementación

- [ ] Servicios web habilitados en Moodle
- [ ] Servicio "Cliente SSH - Prácticas" creado
- [ ] Funciones agregadas al servicio
- [ ] Token generado y copiado
- [ ] Tareas creadas en Moodle (eve3-p1, eve3-p2)
- [ ] IDs de tareas anotados
- [ ] Archivo `.env` creado con URL y token
- [ ] IDs agregados a `.env.practicas`
- [ ] Cliente compila sin errores
- [ ] Prueba de conexión exitosa
- [ ] Prueba de validación funciona
- [ ] UI integrada en TerminalView
- [ ] Prueba con usuario de prueba exitosa

---

## 📚 Recursos Adicionales

### Documentación

- **`CONFIGURACION_SIMPLE_SIN_SUPABASE.md`** - Configuración paso a paso
- **`INTEGRACION_UI_REACT.md`** - Integración del frontend
- **`README_SISTEMA_PRACTICAS.md`** - Visión general del sistema

### APIs y Referencias

- [Moodle Web Services API](https://docs.moodle.org/dev/Web_services)
- [Moodle Assignment API](https://docs.moodle.org/dev/Assignment_API)
- [Tauri Commands](https://tauri.app/v1/guides/features/command)

---

## 🎯 Próximos Pasos

1. ✅ Configurar Moodle (esta guía)
2. ✅ Configurar variables de entorno
3. ⏳ Integrar UI en React
4. ⏳ Probar con usuarios de prueba
5. ⏳ Desplegar en laboratorio

---

**Versión**: 1.0.0  
**Última actualización**: Abril 2026  
**Mantenido por**: Lab Remoto - Universidad Piloto de Colombia
