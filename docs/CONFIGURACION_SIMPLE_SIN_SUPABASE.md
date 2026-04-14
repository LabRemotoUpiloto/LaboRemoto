# ⚡ Configuración Simple - Sin Supabase

## Integración Directa Moodle (Recomendado para Laboratorios Controlados)

Esta es la forma **más simple** de integrar Moodle con tu cliente. No requiere infraestructura adicional.

---

## ✅ Ventajas de esta Configuración

- ✅ **Simple**: Solo necesitas Moodle configurado
- ✅ **Sin dependencias externas**: No necesitas Supabase, AWS, etc.
- ✅ **Funciona inmediatamente**: Todo está en Rust
- ✅ **Ideal para laboratorios**: Entorno controlado de la universidad
- ✅ **Mantenimiento mínimo**: Sin servidores adicionales

---

## 🚀 Pasos de Configuración (10 minutos)

### 1. Configurar Moodle (5 min)

#### a) Habilitar Servicios Web

```
Administración del sitio → Funciones avanzadas
✓ Habilitar servicios web
```

#### b) Crear Servicio Web

```
Administración → Servidor → Servicios web → Servicios externos → Agregar

Nombre: Cliente SSH - Prácticas
Nombre corto: cliente_ssh_practicas
✓ Habilitado
```

#### c) Agregar Funciones al Servicio

```
En el servicio creado, agregar:
- mod_assign_get_assignments
- mod_assign_get_submission_status
- mod_assign_save_grade
- core_user_get_users
```

#### d) Crear Token

```
Administración → Servidor → Servicios web → Gestionar tokens → Crear token

Usuario: Cuenta de profesor/gestor
Servicio: Cliente SSH - Prácticas

→ Copiar el token generado
```

#### e) Crear Tareas

```
En tu curso → Agregar actividad → Tarea

Práctica 1:
- Nombre: "Eve3 - Control con Teclado"
- Calificación: 5.00
- Tipo de entrega: Ninguna
→ Guardar y anotar el ID (en la URL: ?id=123)

Práctica 2:
- Nombre: "Eve3 - Programación del Robot"
- Calificación: 5.00
- Tipo de entrega: Ninguna
→ Guardar y anotar el ID (en la URL: ?id=124)
```

---

### 2. Configurar Variables de Entorno (2 min)

#### Crear archivo `.env` en la raíz del proyecto:

```bash
# c:\Users\DELL\Documents\Cliente-Rust\.env

# Moodle
MOODLE_URL=https://tu-moodle.com
MOODLE_TOKEN=abc123def456...tu_token_aqui
```

#### Editar `.env.practicas` y agregar los IDs:

```bash
# c:\Users\DELL\Documents\Cliente-Rust\.env.practicas

# ... configuración existente ...

# IDs de tareas en Moodle
PRACTICE_EVE3_P1_MOODLE_ASSIGNMENT_ID=123
PRACTICE_EVE3_P2_MOODLE_ASSIGNMENT_ID=124
```

---

### 3. Compilar y Probar (3 min)

```bash
cd c:\Users\DELL\Documents\Cliente-Rust\apps\desktop

# Compilar
npm run tauri build

# O ejecutar en desarrollo
npm run tauri dev
```

---

## 🧪 Pruebas

### Probar Conexión con Moodle

Abre DevTools (F12) en el cliente y ejecuta:

```javascript
// Verificar que Moodle responde
invoke('moodle_sync_assignment', {
  assignmentId: 123,
  username: 'estudiante01'
}).then(result => {
  console.log('✅ Conexión exitosa:', result);
}).catch(err => {
  console.error('❌ Error:', err);
});
```

### Probar Validación de Práctica

```javascript
// Simular que el estudiante ejecutó comandos
invoke('validate_practice_progress', {
  practiceId: 'eve3-p1',
  commandHistory: ['ls', 'python flechas.py']
}).then(result => {
  console.log('Progreso:', result.percentage + '%');
  console.log('Aprobado:', result.passed);
  console.log('Feedback:', result.feedback);
});
```

### Probar Envío de Calificación (Testing)

```javascript
// SOLO PARA TESTING - Usa un usuario de prueba
invoke('moodle_submit_grade_direct', {
  assignmentId: 123,
  userId: 456, // ID del usuario en Moodle
  grade: 5.0,
  comment: 'Práctica completada exitosamente vía Cliente SSH'
}).then(() => {
  console.log('✅ Calificación enviada');
}).catch(err => {
  console.error('❌ Error:', err);
});
```

---

## 🔒 Seguridad

### ¿Es seguro poner el token en el cliente?

**Para tu caso (laboratorio universitario controlado): SÍ**

**Razones:**
1. El cliente solo se usa en las computadoras del laboratorio
2. No se distribuye públicamente
3. Los estudiantes no tienen acceso al código fuente
4. Es un entorno controlado por la universidad

### Recomendaciones:

✅ **Usar un token con permisos mínimos**
- Solo permisos para calificar tareas específicas
- No permisos de administrador

✅ **Rotar el token periódicamente**
- Cambiar el token cada semestre
- Regenerar si hay sospecha de compromiso

✅ **Monitorear logs de Moodle**
- Revisar quién califica qué
- Detectar actividad anómala

---

## 📊 Flujo Completo

```
1. Estudiante abre práctica
   ↓
2. Cliente sincroniza con Moodle
   - Verifica si la tarea existe
   - Verifica si ya fue entregada
   ↓
3. Estudiante trabaja en terminal
   - Sistema captura comandos
   - Valida en tiempo real
   ↓
4. Estudiante completa objetivos (≥60%)
   - Botón "Entregar" se habilita
   ↓
5. Estudiante hace clic en "Entregar"
   - Sistema calcula calificación
   - Envía directamente a Moodle
   ↓
6. Moodle registra calificación
   - Estudiante ve su nota
   - Profesor ve la entrega
```

---

## 🐛 Troubleshooting

### Error: "MOODLE_URL no configurado"

**Solución:**
1. Verificar que existe el archivo `.env`
2. Verificar que tiene `MOODLE_URL=...`
3. Reiniciar el cliente

### Error: "Token inválido"

**Solución:**
1. Verificar que copiaste el token completo
2. Verificar que el servicio web está habilitado
3. Regenerar el token en Moodle

### Error: "Usuario no encontrado"

**Solución:**
1. El username debe coincidir exactamente con Moodle
2. Verificar que el usuario existe en Moodle
3. Verificar que está inscrito en el curso

### Error: "Función no permitida"

**Solución:**
1. Verificar que agregaste todas las funciones al servicio
2. Verificar que el token está asociado al servicio correcto

### La calificación no aparece en Moodle

**Solución:**
1. Verificar que el `assignmentId` es correcto
2. Verificar que el `userId` es correcto
3. Ver logs en Moodle: Administración → Informes → Registros

---

## 📋 Checklist de Verificación

Antes de usar en producción, verifica:

- [ ] Servicios web habilitados en Moodle
- [ ] Servicio "Cliente SSH - Prácticas" creado
- [ ] Funciones agregadas al servicio
- [ ] Token generado y copiado
- [ ] Tareas creadas en Moodle
- [ ] IDs de tareas anotados
- [ ] Archivo `.env` creado con URL y token
- [ ] IDs agregados a `.env.practicas`
- [ ] Cliente compila sin errores
- [ ] Prueba de conexión exitosa
- [ ] Prueba de validación funciona
- [ ] Prueba de calificación funciona

---

## 🎯 Próximos Pasos

1. **Configurar Moodle** siguiendo esta guía
2. **Configurar variables de entorno**
3. **Integrar UI en React** (ver `INTEGRACION_UI_REACT.md`)
4. **Probar con usuarios de prueba**
5. **Desplegar en laboratorio**

---

## 💡 Notas Importantes

### ¿Cuándo necesitarías Supabase?

Solo si en el futuro:
- Distribuyes la app públicamente (fuera del laboratorio)
- Tienes miles de estudiantes
- Necesitas auditoría avanzada
- Quieres analytics en tiempo real

**Para tu caso actual: NO lo necesitas**

### Alternativas a Supabase (si algún día lo necesitas)

1. **Servidor Node.js simple** en la red de la universidad
2. **Azure Functions** (si ya usan Azure)
3. **AWS Lambda** (si ya usan AWS)
4. **Servidor PHP** en el mismo servidor de Moodle

Pero de nuevo: **para tu laboratorio, la solución directa es perfecta**.

---

## 📞 Soporte

Si tienes problemas:
1. Revisar esta guía
2. Ver logs del cliente (DevTools → Console)
3. Ver logs de Moodle (Administración → Informes → Registros)
4. Verificar que el token tiene permisos correctos

---

**¡Listo!** Con esta configuración tienes todo funcionando sin necesidad de Supabase ni infraestructura adicional. 🎉
