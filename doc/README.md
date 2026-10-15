# Infraestructura y desarrollo de Grumphya

Esta carpeta documenta el stack instalado, su operación y el estado de las features. El repositorio contiene el frontend y API, conexión a PostgreSQL/pgvector, captura de ideas, dictado de voz, evaluación configurable, búsqueda semántica y persistencia de ideas rechazadas.

El flujo de alta con plan está implementado en modo de verificación/compra simulada. La contraseña exige 12–128 caracteres con mayúscula, minúscula, número y carácter especial. Las cuotas anónimas son 3 evaluaciones y 3 roasts de por vida por perfil de navegador, con reserva e idempotencia en PostgreSQL. Se conservan HMAC de IP solo durante 24 horas para limitar la creación a 20 perfiles y evitar bloqueos permanentes; las solicitudes de ideas y roast están limitadas a 10/minuto/IP y la API general a 120/minuto/IP, en memoria por proceso. La similitud usa OpenAI `text-embedding-3-small` y pgvector; la API incrementa una vez los rechazos repetidos y conserva título seguro, embedding y contador por 24 meses. Las cuotas diarias de los planes, autenticación/autorización completa, purga periódica independiente del tráfico y política de privacidad del procesamiento externo siguen pendientes. Consulta el [contrato de uso anónimo](anonymous-usage.md) y el [plan de seguridad del registro y similitud](security-and-similarity-roadmap.md).

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
