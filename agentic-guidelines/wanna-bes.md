# Wanna-bes

Este archivo reúne mejoras y asuntos pendientes de valorar e incorporar a un roadmap. Una entrada aquí no significa que esté aprobada ni planificada: conserva el contexto para priorizarla más adelante.

## Rate limits compartidos entre procesos

**Estado:** pendiente de priorización e incorporación al roadmap.

Los límites por minuto de la API guardan sus contadores en memoria por proceso. Hoy esto incluye el límite general de 120 solicitudes por IP/minuto, el límite de 10 para evaluación y envío de roast, y límites dedicados de 30 para lectura de Worst Ideas y de `GET /api/roast-ranking`. Al ejecutar varias réplicas, cada una aplica su propio contador; si el balanceador distribuye las peticiones, el límite efectivo puede multiplicarse. Al reiniciar un proceso, sus contadores se pierden.

El límite de subida de avatar (3 solicitudes por minuto) también usa `request.ip` y memoria local por proceso. `main.ts` fija `trust proxy` en `false` y todavía no existe una configuración por allowlist; tras un reverse proxy, `request.ip` identifica al proxy, no al cliente. **Mejora pendiente:** implementar una allowlist configurable y acotada para proxies/redes de despliegue conocidos, con pruebas de que direcciones no confiables no pueden falsificar la IP mediante `X-Forwarded-For`. Nunca confiar en ese encabezado indiscriminadamente. Al usar varias réplicas, el límite de avatar y los demás límites deben pasar a un almacén compartido o gateway si se necesita una cuota coherente.

El límite secundario de creación de perfiles anónimos —20 por IP en 24 horas— sí se persiste en PostgreSQL y no comparte esta limitación.

**Mejora a valorar:** mover los contadores por minuto a un almacén compartido, como Redis, o a un gateway que aplique el límite antes de distribuir las solicitudes. Definir la estrategia al preparar el despliegue con varias réplicas y comprobar límites simultáneos y recuperación ante reinicios.

## Privacidad de rankings públicos antes de apertura

**Estado:** pendiente; requisito previo a abrir el servicio a usuarios reales.

`GET /api/roast-ranking` publica el alias y el contador acumulado de envíos de roast, y `GET /api/best-users` publica el alias y el número de ideas aprobadas de hasta diez cuentas activas. Un alias elegido por una persona puede contener datos personales o servir como dato de contacto. Completar la política de privacidad para explicar con claridad qué datos se publican, con qué finalidad y durante cuánto tiempo; revisar el riesgo de que los alias elegidos identifiquen o contacten a la persona, y decidir cómo tratarlo antes de la apertura pública. La política actual es provisional e incompleta. Este punto sigue siendo una condición de preparación para producción; los rankings no deben interpretarse como autorización para publicar el servicio.

## Verificación de correo en las nuevas altas

**Estado:** pendiente.

La primera versión activa la cuenta y el plan tras completar el alta con contratación simulada, sin verificar que la persona controla el correo introducido. Añadir verificación de email antes de habilitar la cuenta y sus permisos.

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

Las filas heredadas de `pending_registrations` con enlaces de verificación caducados pueden permanecer en PostgreSQL; el alta directa actual no crea nuevas filas, pero esta tanda no elimina usuarios pendientes históricos. Definir plazos de conservación y un job de purga segura que elimine físicamente datos vencidos de acuerdo con esos plazos, y probar que no afecte a cuentas activas ni a altas recientes.

## Retención estricta de caché de uso de planes

**Estado:** pendiente de definir e implementar una política de purga física garantizada.

`account_plan_usage_requests.response_json` conserva durante un TTL lógico de 24 horas el cuerpo íntegro de las respuestas de evaluación o roast para responder reintentos sin volver a consumir. El cuerpo puede contener salida generada derivada de la solicitud. La tabla no guarda el payload fuente en campos propios, pero la expiración lógica no garantiza el borrado físico a las 24 horas: las filas se eliminan oportunistamente, hasta 500 por reserva posterior, y no existe un job periódico. Valorar una purga con plazo físico verificable y la minimización o cifrado en reposo del contenido cacheado.
