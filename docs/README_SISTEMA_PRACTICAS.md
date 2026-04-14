# 🎓 Sistema de Prácticas con Integración Moodle

Sistema completo para gestionar prácticas de laboratorio remoto con calificación automática integrada con Moodle LMS.

---

## 📚 Documentación

| Documento | Descripción | Audiencia |
|-----------|-------------|-----------|
| **[GUIA_RAPIDA_MOODLE.md](./GUIA_RAPIDA_MOODLE.md)** | Configuración rápida (15 min) | Administradores |
| **[INTEGRACION_MOODLE.md](./INTEGRACION_MOODLE.md)** | Documentación completa | Desarrolladores/Admins |
| **[INTEGRACION_UI_REACT.md](./INTEGRACION_UI_REACT.md)** | Integración frontend | Desarrolladores Frontend |

---

## 🏗️ Arquitectura del Sistema

```
┌─────────────────────────────────────────────────────────────┐
│                    CLIENTE DESKTOP (Tauri)                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   Terminal   │  │   Cámara     │  │     Chat     │     │
│  │     SSH      │  │   Streaming  │  │      IA      │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │         Panel de Progreso de Práctica               │   │
│  │  • Validación en tiempo real                        │   │
│  │  • Objetivos cumplidos/pendientes                   │   │
│  │  • Botón de entrega                                 │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ 1. Validación Local (Rust)
                       │    practice_validator.rs
                       ▼
        ┌──────────────────────────────┐
        │   Supabase Edge Function     │
        │   (Backend Intermedio)       │
        │                              │
        │  • Valida práctica           │
        │  • Verifica usuario          │
        │  • Firma calificación        │
        └──────────────┬───────────────┘
                       │
                       │ 2. Envío Seguro
                       │    (Token privilegiado)
                       ▼
        ┌──────────────────────────────┐
        │        Moodle LMS            │
        │                              │
        │  • Registro de calificación  │
        │  • Feedback al estudiante    │
        │  • Historial académico       │
        └──────────────────────────────┘
```

---

## ✨ Características

### ✅ Validación Automática
- Analiza comandos ejecutados en tiempo real
- Reglas configurables por práctica
- Feedback inmediato al estudiante
- Criterio de aprobación: 60% mínimo

### 🔒 Seguridad
- Token de Moodle nunca expuesto en el cliente
- Backend intermedio valida todas las solicitudes
- Auditoría completa de calificaciones
- Prevención de manipulación de datos

### 📊 Integración Moodle
- Sincronización automática con tareas
- Verificación de entregas previas
- Calificación proporcional al desempeño
- Comentarios automáticos personalizados

### 🎨 Interfaz Intuitiva
- Progreso visual en tiempo real
- Indicadores de objetivos cumplidos
- Panel colapsable y responsive
- Notificaciones de éxito/error

---

## 🚀 Inicio Rápido

### 1. Configurar Moodle (5 min)

```bash
1. Habilitar servicios web en Moodle
2. Crear servicio "Cliente SSH - Prácticas"
3. Generar token con permisos de profesor
4. Crear tareas para cada práctica
```

Ver: [GUIA_RAPIDA_MOODLE.md](./GUIA_RAPIDA_MOODLE.md)

### 2. Configurar Variables de Entorno (2 min)

```bash
# .env
MOODLE_URL=https://tu-moodle.com
MOODLE_TOKEN=abc123...

# .env.practicas
PRACTICE_EVE3_P1_MOODLE_ASSIGNMENT_ID=123
PRACTICE_EVE3_P2_MOODLE_ASSIGNMENT_ID=124
```

### 3. Compilar y Ejecutar (3 min)

```bash
cd apps/desktop
npm run tauri dev
```

---

## 📦 Componentes del Sistema

### Backend (Rust)

| Módulo | Archivo | Función |
|--------|---------|---------|
| **API Moodle** | `cmd/moodle.rs` | Cliente HTTP para Moodle Web Services |
| **Validador** | `cmd/practice_validator.rs` | Reglas de validación y calificación |
| **Prácticas** | `cmd/practicas.rs` | Configuración y gestión de prácticas |

### Frontend (React + TypeScript)

| Componente | Archivo | Función |
|------------|---------|---------|
| **PracticeProgress** | `components/practice/PracticeProgress.tsx` | UI de progreso y entrega |
| **useCommandHistory** | `hooks/useCommandHistory.ts` | Captura de comandos del terminal |

### Backend Intermedio (Deno)

| Función | Archivo | Función |
|---------|---------|---------|
| **submit-grade** | `supabase/functions/submit-grade/index.ts` | Validación y envío seguro a Moodle |

---

## 🔧 Configuración de Prácticas

### Agregar Nueva Práctica

#### 1. Definir Reglas de Validación

```rust
// En: src/cmd/practice_validator.rs

"nueva-practica" => vec![
    ValidationRule {
        rule_type: "command_executed",
        description: "Ejecutó el comando X",
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

#### 2. Configurar en `.env.practicas`

```bash
PRACTICE_NUEVA_NAME=Mi Nueva Práctica
PRACTICE_NUEVA_DESC=Descripción de la práctica
PRACTICE_NUEVA_DIFFICULTY=beginner
PRACTICE_NUEVA_MOODLE_ASSIGNMENT_ID=125
```

#### 3. Crear Tarea en Moodle

```
1. Agregar actividad → Tarea
2. Nombre: "Mi Nueva Práctica"
3. Calificación: 5.00
4. Guardar y anotar ID
```

---

## 🧪 Testing

### Validación Local

```typescript
// En DevTools Console
invoke('validate_practice_progress', {
  practiceId: 'eve3-p1',
  commandHistory: ['ls', 'python flechas.py']
}).then(result => {
  console.log('Progreso:', result.percentage + '%');
  console.log('Aprobado:', result.passed);
});
```

### Sincronización Moodle

```typescript
invoke('moodle_sync_assignment', {
  assignmentId: 123,
  username: 'estudiante01'
}).then(console.log);
```

### Calificación (Testing Directo)

```typescript
// SOLO PARA DESARROLLO
invoke('moodle_submit_grade_direct', {
  assignmentId: 123,
  userId: 456,
  grade: 5.0,
  comment: 'Práctica completada'
}).then(() => console.log('Calificación enviada'));
```

---

## 📊 Flujo de Trabajo Completo

### Estudiante

1. **Inicia práctica** → Cliente sincroniza con Moodle
2. **Trabaja en terminal** → Sistema valida en tiempo real
3. **Completa objetivos** → Botón "Entregar" se habilita
4. **Entrega práctica** → Calificación enviada a Moodle
5. **Recibe confirmación** → Ve su calificación en Moodle

### Sistema

1. **Captura comandos** → Hook `useCommandHistory`
2. **Valida progreso** → `practice_validator.rs`
3. **Calcula calificación** → Proporcional al porcentaje
4. **Envía a backend** → Supabase Edge Function
5. **Backend valida** → Verifica usuario y práctica
6. **Envía a Moodle** → Con token privilegiado
7. **Registra operación** → Logs y auditoría

---

## 🔍 Monitoreo y Logs

### Logs del Cliente

```typescript
// Ver validaciones en tiempo real
localStorage.setItem('debug_practice', 'true');
```

### Logs de Supabase

```bash
supabase functions logs submit-grade --tail
```

### Logs de Moodle

```
Administración → Informes → Registros
Filtrar por: mod_assign_save_grade
```

---

## 🐛 Troubleshooting

| Problema | Solución |
|----------|----------|
| "Usuario no encontrado" | Verificar que el username coincide exactamente |
| "Token inválido" | Regenerar token en Moodle |
| "Práctica no cumple requisitos" | Verificar reglas en `practice_validator.rs` |
| "Error de conexión" | Verificar `MOODLE_URL` y accesibilidad |
| Comandos no se capturan | Verificar integración de `useCommandHistory` |

Ver documentación completa: [INTEGRACION_MOODLE.md](./INTEGRACION_MOODLE.md)

---

## 📈 Métricas y Estadísticas

### Datos Capturados

- Tiempo de inicio y fin de práctica
- Comandos ejecutados (historial completo)
- Objetivos cumplidos/pendientes
- Calificación final
- Intentos de entrega

### Análisis Disponibles

- Tasa de aprobación por práctica
- Tiempo promedio de completación
- Comandos más utilizados
- Errores comunes

---

## 🔐 Seguridad y Privacidad

### Datos Almacenados

- ✅ Historial de comandos (sin contraseñas)
- ✅ Resultados de validación
- ✅ Calificaciones y timestamps
- ❌ NO se almacenan contraseñas SSH
- ❌ NO se almacenan datos sensibles

### Buenas Prácticas

1. Rotar token de Moodle periódicamente
2. Usar HTTPS para todas las conexiones
3. Limitar permisos del token al mínimo necesario
4. Auditar logs regularmente
5. Implementar rate limiting en producción

---

## 🚧 Roadmap

### Próximas Características

- [ ] Soporte para múltiples intentos
- [ ] Validación de archivos remotos (contenido)
- [ ] Detección de servicios corriendo
- [ ] Exportación de reportes PDF
- [ ] Dashboard de estadísticas
- [ ] Integración con otros LMS (Canvas, Blackboard)

---

## 🤝 Contribuir

### Agregar Nuevas Reglas de Validación

1. Editar `practice_validator.rs`
2. Implementar nuevo `rule_type`
3. Agregar tests
4. Documentar en esta guía

### Reportar Bugs

1. Verificar logs del cliente y backend
2. Reproducir el error
3. Crear issue con detalles completos

---

## 📞 Soporte

### Documentación

- [Guía Rápida](./GUIA_RAPIDA_MOODLE.md) - Configuración en 15 minutos
- [Integración Moodle](./INTEGRACION_MOODLE.md) - Documentación completa
- [Integración UI](./INTEGRACION_UI_REACT.md) - Frontend React

### Recursos

- [Moodle Web Services API](https://docs.moodle.org/dev/Web_services)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [Tauri Documentation](https://tauri.app/v1/guides/)

---

## 📄 Licencia

Este sistema es parte del proyecto de Laboratorio Remoto de la Universidad Piloto de Colombia.

---

**Versión**: 1.0.0  
**Última actualización**: Abril 2026  
**Mantenido por**: Equipo de Desarrollo - Lab Remoto UPC
