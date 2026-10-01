# Convención: qué pasa cuando una práctica se completa

Esto aplica a **toda práctica**, no solo a la de Linux — si agregás un tipo de
práctica nuevo (otra materia, otro dispositivo, lo que sea), reusá este mismo
mecanismo para que el comportamiento sea consistente en toda la app. No
inventes tu propio "modal de felicidades" ni tu propio redirect a mano.

## Qué significa "completada"

Una práctica se da por completa al **100%**, nunca a un umbral parcial:

- Todas las reglas de validación **requeridas** (`required: true`, o sin el
  campo — ese es el default) tienen que pasar.
- **Todo** el quiz tiene que estar correcto — no hay quiz "parcialmente
  aprobado". Una pregunta mal marcada queda **editable** (nunca se bloquea
  para siempre) hasta que el estudiante la corrija y reenvíe.
- Las reglas opcionales (`required: false`, ej. `clear`/`date`/`uptime` en
  el módulo 1 de Linux) SÍ suman puntos si se hacen, pero nunca bloquean que
  el módulo se dé por completo si se omiten — son bonus, no evaluación.

Para la práctica de Linux esto vive en `validation.py` en la Raspberry Pi
(no en este repo — ver el flujo de despliegue de contenido en el brief de
cada módulo), función `run_validation`, campo `passed`. Una práctica nueva
que tenga su propio motor de validación debe replicar esta misma regla: el
`passed` que expone al frontend tiene que significar "100% de lo evaluable",
no un porcentaje arbitrario.

## Qué pasa en el frontend al llegar al 100%

1. **Insignia** — se marca ganada con
   `markModuleBadgeEarned(practiceId)` (`src/services/badges.service.ts`).
   El store es un simple `Record<practiceId, EarnedBadge>` en localStorage,
   así que cualquier práctica nueva solo necesita llamar a esa función con
   su propio `practiceId` real (el mismo id que usa su backend/catálogo) —
   no hace falta registrar nada más para que la insignia "exista".
2. **Celebración** (opcional pero recomendado) — `ModuleCompleteCelebration`
   se muestra una sola vez, la primera vez que se gana la insignia
   (`alreadyEarned: false`). Si el módulo ya estaba completo de antes, se
   salta la animación.
3. **Redirect a la vista de Prácticas** — al cerrarse la celebración (o de
   inmediato si no hubo celebración porque ya estaba ganada antes), se
   llama al callback `onModuleCompleted` que se le pasa a
   `useLinuxPracticeSession` (ver `App.tsx`). Ese callback:
   - Llama a `requestPracticesFocus(categoryId)`
     (`src/services/practiceNavigation.service.ts`) para que
     `PracticesPage` abra esa categoría apenas se monte, en vez de la
     grilla de categorías genérica.
   - Vuelve a la pestaña de Inicio y selecciona la página "practices"
     (`setActiveTabId(HOME_TAB_ID)` + `setSelectedPage('practices')`).
4. **Medalla en la tarjeta** — `PracticesPage` ya lee
   `useEarnedBadges()` y le pasa `completed={practice.id in earnedBadges}`
   a cada `PracticeCard` (ver `PracticeCard.tsx`) — **esto ya funciona para
   cualquier categoría**, no hace falta tocar nada acá siempre que la
   práctica nueva llame a `markModuleBadgeEarned` con el `id` real que
   aparece en su `PracticeCard`.

## Para una práctica nueva (no Linux)

Lo mínimo que hace falta:

```ts
import { markModuleBadgeEarned } from '../services/badges.service';
import { requestPracticesFocus } from '../services/practiceNavigation.service';

// cuando tu lógica de validación propia detecte "100%":
const { alreadyEarned } = markModuleBadgeEarned(miPracticeIdReal);
// mostrá tu celebración si querés (opcional), y al cerrarla (o ya mismo si
// `alreadyEarned` es true):
requestPracticesFocus('mi-categoria-id'); // el mismo id que ya usa PracticesPage
setActiveTabId(HOME_TAB_ID);
setSelectedPage('practices');
```

Si tu práctica vive detrás de su propio hook (como `useLinuxPracticeSession`),
seguí el mismo patrón: aceptá un `onModuleCompleted` como parámetro del hook,
y que sea `App.tsx` quien lo implemente (ahí es donde viven
`setActiveTabId`/`setSelectedPage`) — no importes `useAppTabs` dentro de tu
hook de práctica, mantenelo desacoplado de la navegación.
