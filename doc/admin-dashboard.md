# Panel de administración

El hero de `/panel-control` usa el PNG transparente
`admin-dashboard-audit.png` (900 × 900 px, 787.615 B; aprox. 769 KiB):
Grumphya examina gráficas con una lupa para representar la revisión de métricas
y datos operativos.

## Acceso y rutas

`/panel-control` presenta el panel de Jappy. El enlace aparece en Home y en la
navegación de las páginas de sección solo cuando el perfil consultado por la
sesión tiene rol `admin`. Tras iniciar sesión como Jappy se abre esta ruta; las
rutas `/login` y `/crear-cuenta` también lo redirigen aquí. Un visitante que
abre directamente `/panel-control` va a `/login`, y una cuenta normal va a
`/perfil`. El enlace «Mi cuenta» conserva `/perfil` y muestra los datos
personales también para Jappy.

La API protege `GET /api/admin/dashboard` y
`GET /api/admin/contact-messages` con access token y una comprobación del rol
vigente en PostgreSQL en cada solicitud. Sin sesión responden 401 y una cuenta
sin rol admin recibe 403. Ocultar la ruta o el enlace en el frontend no sustituye
esta autorización.

## Cuenta local Jappy

Durante el arranque, en todo entorno con `NODE_ENV` distinto de `test`, el
backend reserva el alias `jappy` y sincroniza su contraseña desde
`ADMIN_PASSWORD`. La variable se lee solo en el servidor y se elimina del
entorno del proceso; el valor nunca se publica en la UI ni se registra. Debe
tener entre 12 y 128 caracteres, con mayúscula, minúscula, número y carácter
especial. Si el alias ya pertenece a una cuenta normal, el arranque falla sin
cambiar su rol.

El bootstrap actual actualiza el hash y revoca las sesiones anteriores de
Jappy en cada arranque, aunque la contraseña configurada no haya cambiado. Por
eso, reiniciar la API exige volver a iniciar sesión con Jappy. El código no
limita este bootstrap al entorno local: debe sustituirse por un proceso de
aprovisionamiento individual y controlado antes de producción; véase
[`production.md`](production.md).

## Datos del panel

- Ingresos simulados: total y semana actual en EUR, derivados de compras
  confirmadas con el precio guardado al contratar. No representan cobros ni
  contabilidad real.
- Coste de IA: estimación en USD a partir de tokens reportados por llamadas
  completadas a proveedores instrumentados. La semana empieza el lunes en
  `Europe/Madrid`. El histórico comienza con la migración `023`; no hay
  reconstrucción de llamadas anteriores. El gráfico muestra las últimas ocho
  semanas. El total y el gráfico incluyen a usuarios registrados, Jappy y
  visitantes sin cuenta, con desglose por origen.
  El promedio por cuenta incluye el gasto histórico atribuido a cuentas user y
  admin y lo divide entre las cuentas de ambos roles que están activas ahora.
  Por ello, el gasto previo de una cuenta eliminada permanece en el numerador,
  pero esa cuenta ya no forma parte del denominador actual.
  Los visitantes sin cuenta se incluyen en el gasto y se desglosan aparte, pero
  no en el promedio por cuenta porque no hay una cuenta que permita definir un
  denominador individual. La migración `024` guarda el tipo de actor en cada
  evento para conservar la atribución tras borrar una cuenta. Los eventos
  antiguos cuyo `user_id` ya era nulo se clasifican como anónimos porque no hay
  datos para atribuirlos retrospectivamente. Los modelos sin tarifa registrada
  aparecen como usos sin precio y no suman al importe estimado. No hay política
  de retención para estos eventos todavía.
- Errores: solo errores de servidor HTTP 5xx, agrupados por código seguro. Las
  respuestas 4xx esperables —por ejemplo 401, 403, 404 y 429— no se cuentan.
  No se guardan rutas, payloads, ideas, mensajes de contacto, credenciales ni
  identificadores. La retención y purga de esta tabla siguen pendientes en
  [`wanna-bes.md`](../agentic-guidelines/wanna-bes.md).
- Contacto: hasta 100 mensajes recientes, con alias, correo, asunto, contenido
  y fecha. El contenido no se escribe en logs. No existe respuesta dentro de la
  aplicación ni retención/purga automática; la baja física del usuario elimina
  sus mensajes por cascada. Estos pendientes están descritos en
  [`wanna-bes.md`](../agentic-guidelines/wanna-bes.md).

## Sesiones y separación de cuentas

La cookie HttpOnly de refresh es compartida por las pestañas del mismo perfil
de navegador. Al iniciar sesión con otra cuenta, la sesión disponible en ese
perfil cambia; la aplicación notifica a las otras pestañas, limpia su access
token en memoria y las recarga. No se mantienen sesiones activas de cuentas
distintas en pestañas del mismo perfil de navegador. Perfiles de navegador
separados mantienen cookies independientes.

Los datos de cuenta, compras, contactos, ideas aprobadas, cuotas de plan y
contadores persistentes de roast se atribuyen al `userId` extraído del access
token validado en servidor. El cupo gratuito de ideas y roast, en cambio,
pertenece al perfil de navegador y se comparte entre las cuentas usadas en él.
Ese cupo no concede permisos de cuenta, rol admin ni acceso a datos ajenos. Los
permisos de plan se comprueban contra el estado vigente en PostgreSQL.

Para los detalles de tablas y relaciones, consulta
[`persistence.md`](../agentic-guidelines/persistence.md); la descripción de
componentes y rutas de producto está en
[`features.md`](../agentic-guidelines/features.md).
