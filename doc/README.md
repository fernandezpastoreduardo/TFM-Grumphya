# Infraestructura y desarrollo de Grumphya

Esta carpeta documenta el stack instalado, su operación y el estado de las features. El repositorio contiene el frontend y API, conexión a PostgreSQL/pgvector, captura de ideas, dictado de voz, evaluación configurable, búsqueda semántica y persistencia de ideas rechazadas.

El flujo de alta con plan está implementado en modo de verificación/compra simulada. La contraseña exige 12–128 caracteres con mayúscula, minúscula, número y carácter especial. Los límites de solicitudes están en memoria por proceso: 10/minuto/IP para evaluación y 120/minuto/IP para la API general, sin coordinación entre réplicas. La similitud usa OpenAI `text-embedding-3-small` y pgvector; la API incrementa una vez los rechazos repetidos y conserva título seguro, embedding y contador por 24 meses. La idempotencia registra los matches y rechazos persistidos; respuestas prometedoras, insuficientes o fallos previos a persistencia no quedan cacheados y un reintento puede invocar otra vez al proveedor. El endpoint de evaluación necesita un proveedor configurado; las cuotas de negocio (3 por sesión anónima y 11 al día para Iluminado), autenticación/autorización, purga física y política de privacidad del procesamiento externo siguen pendientes. La orquestación y persistencia disponen de pruebas unitarias; falta validarlas con PostgreSQL/pgvector aislado y con un recorrido E2E funcional. Consulta el [plan de seguridad del registro y similitud](security-and-similarity-roadmap.md).

## Documentos

- [Dirección e implementación de la UI](ui.md)
- [Stack instalado y versiones](stack.md)
- [Desarrollo local](development.md)
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
