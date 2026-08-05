# API administrativa de Central Tags Server

Todas las rutas `/admin` exigen un Firebase ID Token en `Authorization: Bearer <token>` y el custom claim exacto `admin: true`. Las respuestas 401 corresponden a sesiones ausentes o inválidas; las 403, a usuarios autenticados sin permiso.

## Variables

- `ADMIN_MAX_OCR_LIMIT`: máximo entero positivo que un administrador puede asignar.
- `VISION_COST_PER_1000_OCR`: costo estimado por 1.000 operaciones OCR.
- `VISION_MONTHLY_FREE_UNITS`: tramo gratuito mensual global del proyecto de Google Cloud.
- `VISION_COST_CURRENCY`: moneda informativa de la estimación, por ejemplo `USD`.
- `CORS_ORIGINS`: orígenes autorizados separados por comas. Vacío permite todos para conservar compatibilidad.

El tramo gratuito global de Google Cloud no guarda relación con las 50 capturas del plan `free` de cada usuario. El costo del dashboard es una estimación basada en `ocrLogs`; la factura real de Google Cloud es la fuente definitiva.

## Datos

Los perfiles se almacenan en `users/{uid}`. Se preservan todos los campos ajenos y se administran `email`, `createdAt`, `plan`, `ocrEnabled`, `ocrUsed`, `ocrLimit`, `ocrPending`, `planStartsAt`, `planExpiresAt` y `updatedAt`. Los documentos antiguos se interpretan como plan `free`, OCR activo, cero usos y límite 50.

El historial OCR existente permanece en `users/{uid}/ocrLogs/{logId}`. Las acciones administrativas se escriben en `adminAuditEvents/{eventId}`, con administrador, usuario afectado, acción, valores anteriores/nuevos y timestamp del servidor.

## Endpoints

- `GET /admin/session`: valida la sesión administrativa.
- `GET /admin/users?search=&page=1&limit=25`: lista y busca usuarios.
- `GET /admin/users/:uid`: ficha y uso de hoy, siete días y mes actual.
- `POST /admin/users/:uid/ocr/enable` y `/disable`: cambia exclusivamente la disponibilidad configurada del OCR.
- `POST /admin/users/:uid/plan/activate`: acepta `free`, o `monthly` con `ocrLimit`, `planStartsAt` y `planExpiresAt`.
- `POST /admin/users/:uid/plan/renew`: renueva un plan `monthly` con nuevo límite y fechas.
- `PATCH /admin/users/:uid/ocr/limit`: cuerpo `{ "ocrLimit": 100 }`.
- `POST /admin/users/:uid/ocr/reset`: reinicia solamente `ocrUsed`.
- `POST /admin/admins/grant` y `/revoke`: cuerpo `{ "email": "usuario@correo.com" }`.
- `GET /admin/dashboard`: estadísticas globales, ranking y costo estimado.
- `GET /admin/audit-events`: acepta `page`, `limit`, `adminUid`, `targetUid`, `action`, `from` y `to` (`YYYY-MM-DD`).

Las fechas y los resúmenes se expresan en UTC. Un plan `monthly` vencido bloquea solo el OCR aunque `ocrEnabled` sea verdadero; se recupera mediante activación o renovación administrativa.

## Prueba local

1. Copiar `.env.example` a `.env` y configurar credenciales fuera del repositorio.
2. Ejecutar `npm test` y luego `npm start`.
3. Obtener un ID Token actualizado de una cuenta con `admin: true`.
4. Invocar los endpoints con `Authorization: Bearer <token>` y `Content-Type: application/json` cuando exista cuerpo.

Los cambios de custom claims se reflejan al renovar el ID Token o iniciar sesión nuevamente. Al quitar un administrador, el servidor también revoca sus refresh tokens.
