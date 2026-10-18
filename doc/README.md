# Infraestructura y desarrollo de Grumphya

Esta carpeta documenta el stack instalado, su operación y el estado de las features. El repositorio contiene el frontend y API, conexión a PostgreSQL/pgvector, captura de ideas, dictado de voz, evaluación configurable, búsqueda semántica y persistencia de ideas rechazadas.

El alta con plan crea y activa directamente la cuenta, la suscripción simulada y la sesión en una transacción. Tras el envío del formulario se muestra durante cinco segundos el modal de pago simulado y después se abre el perfil. No se procesa dinero real; las nuevas cuentas quedan activas con el correo aún sin verificar, y la verificación de email está pendiente. La autenticación está implementada con access JWT de 10 minutos y refresh token rotatorio en cookie HttpOnly; el perfil y sus acciones requieren sesión válida y consultan los permisos del plan en el servidor. La contraseña exige 12–128 caracteres con mayúscula, minúscula, número y carácter especial.

Las cuotas gratuitas son independientes por ámbito: una cuenta sin Iluminado conserva sus tres evaluaciones gratuitas y una cuenta sin Faltón conserva sus tres envíos gratuitos del perfil de navegador. Un plan activo solo aplica a su ámbito y no consume el cupo gratuito del otro.

Las cuotas anónimas son 3 evaluaciones y 3 roasts de por vida por perfil de navegador, con reserva e idempotencia en PostgreSQL. Iluminado permite 11 evaluaciones diarias y Faltón 11 roasts diarios si la suscripción correspondiente está activa. La API reserva el uso transaccionalmente, lo confirma al devolver un resultado válido y libera la reserva ante error. El día se calcula en `Europe/Madrid`, también en los cambios estacionales de hora. Una misma clave y payload devuelve la respuesta cacheada sin duplicar consumo; su TTL lógico es de 24 horas desde la reserva original. La caché guarda el cuerpo de respuesta completo y puede contener salida derivada de la solicitud; no garantiza el borrado físico a las 24 horas. Una reserva incompleta devuelve `409` durante 30 minutos y después puede recuperarse. Las filas caducadas se borran oportunistamente en lotes de hasta 500 con nuevas reservas, sin job periódico. Se conservan HMAC de IP solo durante 24 horas para limitar la creación a 20 perfiles; las solicitudes de ideas y roast están limitadas a 10/minuto/IP y la API general a 120/minuto/IP, en memoria por proceso. La similitud usa OpenAI `text-embedding-3-small` y pgvector; la API incrementa una vez los rechazos repetidos y conserva título seguro, embedding y contador por 24 meses. Siguen pendientes la purga periódica independiente del tráfico y la política de privacidad del procesamiento externo. Consulta el [contrato de uso anónimo](anonymous-usage.md) y el [plan de seguridad del registro y similitud](security-and-similarity-roadmap.md).

## Documentos

- [Dirección e implementación de la UI](ui.md)
- [Stack instalado y versiones](stack.md)
- [Desarrollo local](development.md)
- [Límites de uso anónimo](anonymous-usage.md)
- [Producción](production.md)
- [Usuarios, credenciales y secretos](credentials.md)
- [Comprobaciones y resolución de problemas](verification.md)

## Estado de preparación

Verificado en macOS Apple Silicon el 9 de octubre de 2026:

- Node.js 24 y pnpm 12.
- React 19 + Vite 7 y NestJS 11.
- Docker Desktop 4.94.0, Docker Engine 29.8.2 y Compose 5.5.1.
- PostgreSQL 17 con `pgvector` 0.8.7 en Docker Compose.
- Las pruebas, compilaciones, lint y endpoints HTTP se documentan con sus resultados en [verificación](verification.md).

Docker Desktop ya está instalado y el motor verificado. La instalación del motor requirió autorizar el diálogo de macOS. No se ha desplegado infraestructura remota.

No guardes contraseñas reales, tokens de GitHub, claves SSH ni claves de proveedores en esta carpeta o en Git. Para producción, inyecta secretos desde el gestor de secretos de la plataforma elegida.
