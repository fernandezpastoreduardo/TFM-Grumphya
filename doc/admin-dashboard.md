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

El alias `jappy` se reserva para la cuenta administradora; el registro público
lo rechaza sin distinguir mayúsculas y minúsculas. Crea la cuenta mediante el
comando explícito `provision-admin`; repetirlo no cambia una contraseña ya
guardada. Para una contraseña nueva, ejecuta el comando explícito
`change-admin-password`, que sustituye el hash y revoca las sesiones activas.
La contraseña debe tener entre 12 y 128 caracteres, con mayúscula, minúscula,
número y carácter especial. Se guarda como hash bcrypt cost 12 con prehash
SHA-256, igual que las contraseñas nuevas de las cuentas; nunca se guarda
cifrada ni en texto claro.

En desarrollo, los comandos se ejecutan con los valores de `.env.docker` y
`.env`; en producción, se usa el contenedor temporal `admin-provision` y el
archivo separado `admin_settings`. El arranque normal de la API no lee
`ADMIN_PASSWORD`, no modifica el hash y no revoca sesiones. Consulta
[`development.md`](development.md) y [`production.md`](production.md) para los
comandos de cada entorno.

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
  La tabla muestra conteo semanal y total, fecha de la última ocurrencia y el
  diagnóstico seguro más reciente disponible por código de error. Ese
  diagnóstico se limita a categorías cerradas de validación de evaluación;
  los eventos históricos y los errores sin diagnóstico asociado muestran `—`.
  No se guardan rutas, payloads, ideas, mensajes de contacto, credenciales ni
  mensajes de excepción. La migración `029` añade la categoría opcional. Los eventos se purgan a los 30 días y las métricas de IA a los 12 meses mediante `DataRetentionService`; el ciclo efectivo debe verificarse en producción.

En pantallas estrechas, el panel reduce el relleno de las tarjetas y apila los
desgloses de coste. Las tablas conservan un ancho mínimo y se desplazan dentro
de su propio contenedor para evitar ensanchar la página.

## Pestañas de análisis

El panel `/panel-control` organiza el resumen y los mensajes de contacto en la
pestaña **Resumen**, y añade tres vistas informativas de operación:

- **Benchmark de evaluaciones y prompts** describe el corpus versionado de seis
  casos sintéticos y cómo comparar acuerdo con las etiquetas y consistencia de
  estado/motivo entre prompts y modelos. El panel ofrece el comando de ayuda;
  las ejecuciones se lanzan desde un entorno de desarrollo con credenciales y
  no se guardan ni se muestran como una ejecución reciente.
- **Telemetría de operaciones de IA** muestra coste agregado y eventos sin
  tarifa. Los eventos estructurados de stdout incluyen operación, modelo,
  resultado, latencia, identificador aleatorio por llamada, tokens disponibles
  y coste estimado; no incluyen ideas, mensajes, cuenta, IP ni identificadores
  de sesión. La tabla administrativa de consumo sí conserva tokens y coste por
  operación/modelo y puede asociar una cuenta para calcular promedios. La UI
  presenta cifras agregadas y no expone ese identificador.
- **Pruebas de seguridad** resume las pruebas de inyección de instrucciones,
  cuotas, permisos y aislamiento entre cuentas. Las pruebas de integración que
  requieren PostgreSQL crean esquemas aleatorios en la base temporal de CI; las
  pruebas E2E usan una instancia aislada de API/web con repositorios en memoria,
  no esa base PostgreSQL. CI también ejecuta auditoría de dependencias y análisis
  de vulnerabilidades de la imagen. El detalle está en [`ci-cd.md`](ci-cd.md) y
  [`ai-evaluation-and-observability.md`](ai-evaluation-and-observability.md).

Las pestañas son información de operación y documentación. No lanzan
benchmarks, escaneos ni pruebas desde el navegador.

- Contacto: hasta 100 mensajes recientes, con alias, correo, asunto, contenido,
  fecha y estado de confirmación/respuesta. El contenido no se escribe en logs.
  Jappy puede enviar una respuesta al correo asociado a la cuenta; el texto de
  respuesta no se persiste. El remitente y Reply-To usan la dirección SMTP
  configurada. Los logs omiten el contenido de la respuesta y el destinatario.
  Un envío con estado incierto requiere revisar el webmail de la cuenta SMTP
  configurada antes de un único reintento. No hay lectura IMAP en la aplicación. Los mensajes se purgan a los 12 meses
  mediante `DataRetentionService`; la baja física también los elimina por
  cascada. Verificar la ejecución de la tarea y la rotación de backups en
  producción.

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
