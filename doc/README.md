# Infraestructura y desarrollo de Grumphya

Esta carpeta documenta el stack instalado y su operación. El repositorio contiene el esqueleto ejecutable de frontend y API, además de la conexión de salud a PostgreSQL/pgvector. La funcionalidad de evaluación todavía no está implementada.

## Documentos

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
