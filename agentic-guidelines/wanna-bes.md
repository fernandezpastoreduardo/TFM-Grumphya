# Wanna-bes

Este archivo reúne mejoras y asuntos pendientes de valorar e incorporar a un roadmap. Una entrada aquí no significa que esté aprobada ni planificada: conserva el contexto para priorizarla más adelante.

## Punto de continuación: publicación en IONOS (22 de octubre de 2026)

**Estado:** retomado. Las pruebas funcionales pendientes de Jappy y correo ya pasaron. No se ha integrado nada en `main` ni activado el despliegue automático. Antes de publicar, pedirle a Eduardo una decisión expresa sobre activar el despliegue y fusionar el PR.

- **Código preparado:** rama `feat/containerization-ci-cd`, PR borrador [#8](https://github.com/fernandezpastoreduardo/TFM-Grumphya/pull/8). La ejecución [GitHub Actions 39738836696](https://github.com/fernandezpastoreduardo/TFM-Grumphya/actions/runs/39738836696) terminó correctamente para `3eb49d4`: pruebas, construcción y escaneos de seguridad pasaron. El trabajo local también pasó formato, lint, tipos, tests, build y 13 pruebas de navegador. La variable de GitHub `PRODUCTION_DEPLOY_ENABLED` sigue en `false`; el job de publicación se omitió.
- **Web actual:** `https://grumphya.com` funciona con HTTPS y la versión anterior `34746934a12623fb9a1f4780ca1ceebb649fe93d`. Contenedores web, API, PostgreSQL/pgvector y proxy sanos en la última comprobación. Probados con éxito desde fuera: registro, correo de confirmación, activación e inicio de sesión de usuario, acuse de Contacto, evaluación mediante OpenAI, acceso de Jappy al panel y respuesta del administrador por correo.
- **Recuperación de contraseña:** en producción el enlace llevaba por error a la pantalla que solicita el correo. La causa se corrigió en la rama y tiene prueba de regresión, pero **todavía no está desplegada**. El enlace de recuperación compartido accidentalmente en el chat fue invalidado en la base; después de publicar hay que solicitar **uno nuevo** y probar el cambio de contraseña sin compartir enlace, token ni clave.
- **Acceso de Jappy:** Eduardo ejecutó `/usr/local/sbin/grumphya-cambiar-clave-jappy` desde la consola del VPS y confirmó el mensaje de éxito. Después entró como `Jappy`, abrió el panel, respondió al mensaje de prueba y confirmó que el correo llegó. `contacto@grumphya.com` es el buzón SMTP, no el usuario administrador.
- **Copias:** el VPS genera una copia cifrada semanal. La primera se descargó a Synology Drive y se comprobó una restauración desechable. La descarga del VPS al Mac/Synology es **manual** mediante `Descargar-y-comprobar-copias.command`; no presentar esta parte como automatizada. Falta verificar de manera independiente la sincronización final de Synology Drive y guardar una segunda copia segura de la llave privada de restauración, fuera de Git y del NAS.
- **Siguiente paso:** volver a comprobar que el PR #8 sigue verde tras esta actualización. Con autorización expresa de Eduardo, activar `PRODUCTION_DEPLOY_ENABLED=true` y fusionar el PR en `main`; vigilar la ejecución de Actions y comprobar la revisión publicada, HTTPS, persistencia y el nuevo flujo de recuperación. Si falla un control, conservar la versión publicada y revisar el rollback antes de reintentar. La llave SSH temporal de operador se retiró; si hace falta acceso técnico, instalar otra llave temporal desde la consola de IONOS y retirarla al acabar.

### Mostrar la contraseña escrita en el inicio de sesión

**Estado:** implementado y probado. El campo de contraseña del login incorpora un control accesible para mostrar u ocultar los caracteres introducidos, con el estado inicial oculto. La prueba comprueba el cambio mediante teclado y que el control anuncia su acción y el campo asociado a tecnologías de asistencia. El campo y el control se mantienen en una fila adaptable en móvil.

### Ajustar el diseño responsive

**Estado:** parcialmente resuelto. El panel `/panel-control` ajusta sus tarjetas al ancho disponible, apila los desgloses de coste y limita el desplazamiento horizontal de tablas a su contenedor; también se apilan los callouts ilustrados de Buenas prácticas y Humanos notables. Falta revisar el resto de páginas con tamaños móviles habituales y confirmar que contenido y controles siguen siendo legibles y utilizables sin desplazamiento lateral.

## Rate limits compartidos entre procesos

**Estado:** pendiente de priorización e incorporación al roadmap.

Los límites por minuto de la API guardan sus contadores en memoria por proceso. Hoy esto incluye el límite general de 120 solicitudes por IP/minuto, el límite de 10 para evaluación y envío de roast, y límites dedicados de 30 para lectura de Worst Ideas y de `GET /api/roast-ranking`. Al ejecutar varias réplicas, cada una aplica su propio contador; si el balanceador distribuye las peticiones, el límite efectivo puede multiplicarse. Al reiniciar un proceso, sus contadores se pierden.

El límite de subida de avatar (3 solicitudes por minuto) también usa `request.ip` y memoria local por proceso. `main.ts` no confía en proxies por defecto. La caja Compose de producción configura una allowlist de una sola IP: Caddy en `172.31.0.254/32`; la API no publica puertos y no confía en cabeceras recibidas directamente desde Internet. Si cambian las subredes o IP del proxy, hay que actualizar esa allowlist y conservarla acotada. Al usar varias réplicas, el límite de avatar y los demás límites deben pasar a un almacén compartido o gateway si se necesita una cuota coherente.

El límite secundario de creación de perfiles anónimos —20 por IP en 24 horas— sí se persiste en PostgreSQL y no comparte esta limitación.

**Mejora a valorar:** mover los contadores por minuto a un almacén compartido, como Redis, o a un gateway que aplique el límite antes de distribuir las solicitudes. Definir la estrategia al preparar el despliegue con varias réplicas y comprobar límites simultáneos y recuperación ante reinicios.

## Consentimiento para rankings públicos

**Estado:** implementado con adhesión voluntaria.

La migración `030_public_rankings_consent.sql` añade el registro de fecha y versión del consentimiento en `users`; las cuentas existentes quedan fuera de los rankings por defecto. `POST /api/account/privacy/rankings` permite activar y retirar la preferencia con una sesión autenticada. El perfil presenta una casilla inicialmente desmarcada que explica que se publicarán alias, cantidades y el avatar elegido. `GET /api/roast-ranking` y `GET /api/best-users` filtran por consentimiento activo, de modo que retirar la autorización quita la cuenta de ambos resultados.

## Purga periódica de datos vencidos

**Estado:** implementado en la API; confirmar ejecución en producción.

`DataRetentionService` elimina por lotes, al iniciar la API y después cada hora, perfiles anónimos inactivos tras 400 días, cachés vencidas, ideas rechazadas sin actividad durante 24 meses, mensajes de contacto y métricas de uso con 12 meses, y eventos de error con 30 días. El proceso usa `FOR UPDATE SKIP LOCKED` para permitir varias réplicas y reintenta en la siguiente hora si una ejecución falla. Los logs de la aplicación no incluyen el contenido borrado. La rotación de copias externas debe seguir el criterio aprobado de conservarlas solo mientras sean necesarias para prestar el servicio y recuperar datos; validar el ciclo real configurado en IONOS.

## Verificación de correo en las nuevas altas

**Estado:** implementado; la tarea periódica también purga registros pendientes vencidos. Verificar ejecución en producción.

Las altas nuevas permanecen pendientes hasta verificar el correo con un token aleatorio de un solo uso (24 horas) y confirmar explícitamente la contratación simulada dentro de 15 minutos. Los hashes de tokens se guardan en PostgreSQL; no se crea plan, sesión ni cuota antes de confirmar. El correo usa SMTP configurado en servidor; la vista previa local de desarrollo no se envía. Se conserva compatibilidad con filas históricas pendientes, y la tarea periódica elimina los registros vencidos. Confirmar su ejecución efectiva en producción.

## Autenticación de dos factores

**Estado:** pendiente.

Valorar y diseñar un segundo factor para el inicio de sesión, con recuperación segura y alternativas accesibles, antes de incorporarlo a la autenticación de cuentas.

## Protección del tráfico API y datos sensibles en tránsito

**Estado:** pendiente de revisión e incorporación al roadmap de despliegue.

Exigir HTTPS para todo el tráfico de la API y configurar TLS 1.2 como versión mínima, prefiriendo TLS 1.3 cuando cliente e infraestructura lo soporten. Redirigir HTTP a HTTPS en el borde cuando sea seguro hacerlo y habilitar HSTS en los dominios servidos exclusivamente por HTTPS, con una política acorde al despliegue. Actualmente Nest escucha HTTP y la topología prevista delega TLS al reverse proxy; verificar en cada entorno los certificados, la terminación TLS externa, el cifrado del tramo proxy-aplicación y la lista de proxies confiables.

No incluir identificadores de sesión, tokens, credenciales ni datos personales o sensibles en rutas o query strings: las URL pueden quedar en historial, telemetría y logs intermedios. Enviar credenciales de API en encabezados de autorización y usar cookies `HttpOnly`, `Secure` y `SameSite` para los tokens de refresh. Minimizar los datos de diagnóstico y redactar identificadores, secretos y contenido privado de ideas en logs y telemetría.

La conexión se cifra en tránsito entre cada tramo TLS configurado, pero la aplicación debe descifrar la solicitud en el servidor para procesarla. Por ello, el cifrado extremo a extremo en sentido estricto no aplica a estos payloads procesados por la API; protegerlos además en reposo y limitar su acceso según necesidad.

## Retención y limpieza de altas pendientes

**Estado:** pendiente de definir una política de retención y automatización.

Las filas de `pending_registrations` con enlaces caducados pueden permanecer en PostgreSQL. Definir plazos de conservación y un job de purga segura que elimine físicamente datos vencidos, y probar que no afecte a cuentas activas ni a altas recientes.

## Retención estricta de caché de uso de planes

**Estado:** pendiente de definir e implementar una política de purga física garantizada.

`account_plan_usage_requests.response_json` conserva durante un TTL lógico de 24 horas el cuerpo íntegro de las respuestas de evaluación o roast para responder reintentos sin volver a consumir. El cuerpo puede contener salida generada derivada de la solicitud. La tabla no guarda el payload fuente en campos propios, pero `DataRetentionService` elimina las filas vencidas por lotes al arrancar la API y cada hora; el borrado físico puede ocurrir hasta una hora después del TTL. Mantener la minimización del contenido cacheado y revisar el cifrado en reposo.

## Retención, privacidad y atención de mensajes de contacto

**Estado:** pendiente.

El formulario de Contacto autenticado guarda el asunto y el mensaje en PostgreSQL asociados a la cuenta. Tras guardar, la API solicita una confirmación al SMTP compartido con asunto genérico, fecha y referencia; no copia el texto del mensaje. En desarrollo se genera una vista previa local y la UI aclara que no se ha enviado; las filas históricas se marcan como `not_requested`, sin afirmar que recibieron un correo. La clave de idempotencia impide que un reintento HTTP cree otra fila. El estado de confirmación y hasta tres intentos se registran; una entrega que queda en curso no se reintenta automáticamente y la UI ofrece reintentar solo cuando el servidor confirma que hay intentos disponibles. La bandeja de entrada de Jappy permite consultar los mensajes recientes y responder desde el buzón configurado. El servidor obtiene la dirección del destinatario de la cuenta asociada al mensaje y comprueba el rol admin activo en PostgreSQL en cada petición. El asunto de respuesta incorpora una referencia breve; el cuerpo no se guarda en la aplicación ni se registra en logs. Solo se conserva el estado mínimo y la fecha del último intento. Si la entrega queda incierta, el panel exige revisar el webmail de la cuenta SMTP configurada antes de autorizar un único reintento. Las respuestas recibidas se leen en ese webmail; la aplicación no utiliza IMAP. El acceso al contenido queda restringido al rol admin. Asunto y mensaje original se guardan como texto claro, sin cifrado a nivel de aplicación; el cifrado en tránsito/en reposo depende de la configuración de cada entorno y aún debe verificarse para producción. Las filas no caducan ni se purgan automáticamente; la baja física del usuario sí las elimina por la relación `ON DELETE CASCADE`. Definir un plazo de retención y un proceso de purga verificable, responsables y plazos de respuesta; limitar y auditar el acceso del personal al contenido. Actualizar la política de privacidad para informar de los datos recogidos, finalidad, personas con acceso y conservación antes de abrir el servicio.

## Correo de contacto

**Implementado con límites operativos:** el registro autenticado del mensaje envía una confirmación mediante el SMTP compartido, con asunto genérico, fecha y referencia; no incluye el texto enviado. Si falla la entrega, el mensaje permanece guardado y la UI permite hasta tres intentos totales de confirmación. Jappy puede responder desde la bandeja del panel: el destinatario se obtiene de PostgreSQL, el correo usa el remitente y Reply-To configurados, y solo una sesión con rol admin activo en PostgreSQL puede iniciar el envío. El estado y la fecha del intento se guardan, no el cuerpo de la respuesta. Para evitar duplicados, el primer envío se reclama atómicamente y, si la entrega queda incierta, el panel requiere confirmar que se revisó el webmail antes de permitir un segundo intento. El usuario responde al buzón SMTP configurado y el equipo lee esas respuestas en el webmail correspondiente; no hay lectura IMAP en la aplicación. Los mensajes se purgan a los 12 meses; los estados de entrega no prueban recepción por el destinatario.

## Retención de métricas del panel

**Retención implementada:** `application_error_events` se purga a los 30 días y `admin_ai_usage_events` a los 12 meses. Confirmar ejecución efectiva en producción. La primera almacena códigos normalizados de errores 5xx, estado HTTP, fecha y una categoría opcional y cerrada de diagnóstico para ciertos errores de validación; las filas históricas o no aplicables pueden tener `diagnostic_code` nulo. Las respuestas 4xx esperables no se registran. La segunda conserva operación, modelo, tokens, coste estimado, fecha y tipo de actor (`registered_user`, `admin` o `anonymous`); en usos autenticados también conserva el `user_id`, que se pone a nulo al borrar la cuenta mientras el tipo de actor mantiene la atribución agregada. Ninguna tabla contiene prompts, ideas, respuestas, rutas ni payloads.
