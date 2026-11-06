# Bloqueo de envíos durante la verificación del correo

## Decisión de producto y arquitectura

Cuando una persona completa un alta y el correo sigue sin verificar, no puede enviar ideas, mensajes de roast ni formularios de contacto. Abrir el enlace recibido por correo no basta: debe pulsar «Confirmar correo» en `/verificar-cuenta`, que llama a `POST /api/registrations/verify`. La confirmación posterior de la contratación simulada activa el plan y la sesión, pero es un paso distinto de verificar el correo. Un visitante que no ha iniciado un alta conserva los tres intentos gratuitos de ideas y los tres de roast por perfil de navegador.

El servidor es la autoridad de esta regla. Tras crear un alta pendiente, `POST /api/registrations` entrega la cookie `grumphya_pending_registration` con el UUID aleatorio de la fila de alta. Es propia, `HttpOnly`, `SameSite=Strict`, `Path=/api`, `Secure` en producción y dura como máximo 400 días en el navegador. El cliente no puede usar su valor para concederse permisos. En cada petición protegida, la API consulta PostgreSQL y bloquea solo si esa fila sigue vinculada a un usuario con estado `pending_email_verification` y `email_verified_at IS NULL`. La caducidad del enlace de verificación es independiente: dura 24 horas y puede solicitarse un reenvío. La cookie se borra cuando se confirma la contratación o se inicia sesión; el estado del servidor deja de bloquear en cuanto se verifica el correo, aunque la cookie todavía exista.

`PendingEmailVerificationGuard`, ubicado en `apps/api/src/infrastructure/auth/`, se reutiliza en tres funciones: `POST /api/evaluation-process`, `POST /api/roast` y `POST /api/contact-messages`. Se ejecuta antes de la lógica de cada envío y responde `403` con `code: EMAIL_VERIFICATION_REQUIRED`. Por ello no se reserva ni consume cuota, no se genera una evaluación o un roast, no se guarda un mensaje de contacto y no se invoca el correo de confirmación de contacto. `GET /api/registration-status` devuelve `emailVerificationPending` para presentar el aviso antes de intentar el envío; su respuesta usa `Cache-Control: no-store`. La consulta de estado es una ayuda de UX, no la barrera de seguridad: el `403` del endpoint de envío sigue siendo obligatorio ante una carrera o una llamada directa. El control está en `infrastructure/auth` porque la misma regla se usa en tres features; cada formulario permanece en su feature.

La UI muestra el mismo diálogo accesible para los tres casos, con el asset `evaluation-error-spilled-coffee.svg`, el título «Por seguridad tienes que confirmar tu correo» y el texto «Te hemos enviado un email con un enlace para que puedas confirmarlo.». El diálogo se cierra con «Entendido» o «Cerrar aviso»; no borra el texto escrito. Antes de la verificación, el formulario de contacto de la persona sin sesión tampoco envía datos: conserva su comportamiento de demostración y muestra el aviso si detecta el alta pendiente. Una cuenta ya autenticada que envía contacto sigue su flujo normal. Si la comprobación previa de estado no está disponible, el resultado del endpoint de envío determina el bloqueo.

## Identidad y límites

La cookie de alta pendiente identifica **ese intento de registro en ese navegador**, no a una persona en todos sus dispositivos. Borrarla o cambiar de navegador puede hacer que una solicitud sin sesión se trate como visitante anónimo; la IP no se usa como identidad vitalicia. Esta limitación impide prometer un bloqueo universal por persona sin autenticación adicional. El bloqueo de correo pendiente es independiente de la cuota gratuita del perfil anónimo (`grumphya_anon`), de la expiración del enlace y de los permisos de los planes.

Para cuentas, login, renovación de refresh y validación de access token exigen
`status='active'`. El formulario de contacto sigue exigiendo una sesión válida.
Algunas cuentas históricas activas pueden tener `email_verified_at` a `NULL`:
conservan acceso y sus planes vigentes sin atribuirles una verificación que no
consta. Las altas nuevas empiezan en `pending_email_verification` y solo pasan
a `active` después de verificar el correo y confirmar la contratación simulada.

Antes del despliegue, ejecutar esta auditoría de solo lectura en la base de
datos de destino para conocer el volumen de cuentas históricas afectadas y
cuántas tienen un plan vigente:

```sql
SELECT count(*) AS active_without_verification_date,
       count(*) FILTER (WHERE EXISTS (
         SELECT 1 FROM subscriptions s
         WHERE s.user_id = u.id AND s.status = 'active'
           AND s.starts_at <= now() AND s.expires_at > now()
       )) AS active_with_current_plan
FROM users u
WHERE u.status = 'active' AND u.email_verified_at IS NULL;
```

Para revisar la procedencia de esas cuentas sin incluir correos ni contraseñas
en el informe, obtener sus identificadores y los planes vigentes:

```sql
SELECT u.id, u.created_at,
       array_agg(s.plan_code ORDER BY s.plan_code)
         FILTER (WHERE s.id IS NOT NULL) AS current_plans
FROM users u
LEFT JOIN subscriptions s ON s.user_id = u.id AND s.status = 'active'
  AND s.starts_at <= now() AND s.expires_at > now()
WHERE u.status = 'active' AND u.email_verified_at IS NULL
GROUP BY u.id, u.created_at
ORDER BY u.created_at;
```

La ausencia de fecha no demuestra que el correo se verificara. Hay que
contrastar la procedencia de las filas con la evidencia disponible y revisar
el riesgo de usar ese correo para contacto. La auditoría no cambia los
registros ni suspende el acceso: el estado `active` mantiene la identificación
y los permisos se siguen comprobando con la suscripción vigente. No se debe
rellenar la fecha de verificación sin evidencia.

El UUID en la cookie es un identificador seudónimo asociado a una cuenta pendiente, no un token de verificación ni de sesión. No debe escribirse en logs, métricas públicas ni mensajes de error. La política de privacidad visible debe describir esta cookie propia y su duración. En desarrollo sin SMTP, la vista previa local del correo permite probar el flujo, pero no demuestra entrega real.

## Verificación

- API: comprobar bloqueo `403` para las tres rutas, también con solicitudes directas; comprobar ausencia de reserva, generación y persistencia cuando se bloquea.
- Alta: comprobar que el enlace abierto por sí solo no verifica, que el botón sí cambia el estado y que las cookies se emiten y limpian en los momentos previstos.
- Compatibilidad: comprobar login, renovación, access token y plan vigente de una cuenta `active` con `email_verified_at` a `NULL`; las cuentas pendientes siguen sin poder iniciar sesión.
- Web: comprobar el diálogo, sus textos y asset, así como la conservación de la entrada escrita y el manejo del `403` tras la comprobación previa.
- Navegadores: confirmar el recorrido completo con un alta aislada y correo de prueba; un visitante sin alta pendiente debe poder usar sus cuotas gratuitas.
