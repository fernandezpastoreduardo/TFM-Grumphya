# Stack instalado

## Requisitos y componentes

| Componente           | Uso                                | Versión verificada / política                                         |
| -------------------- | ---------------------------------- | --------------------------------------------------------------------- |
| macOS Apple Silicon  | Host local actual                  | macOS del equipo de desarrollo                                        |
| Node.js              | Runtime de frontend y API          | 26.13.0 (`.node-version`); soporta Node 22.22.2+, 24.15.0+ y 26.13.0+ |
| pnpm                 | Workspaces y dependencias          | 12.5.1; fijado en `packageManager`                                    |
| Docker Desktop       | Motor local de contenedores        | 4.94.0 (241994)                                                       |
| Docker Engine        | Servidor de contenedores           | 29.8.2, linux/arm64                                                   |
| Docker Compose       | Orquestación local                 | 5.5.1                                                                 |
| React / React DOM    | Interfaz                           | 19.3.1                                                                |
| Vite                 | Servidor local y build web         | 7.3.7                                                                 |
| NestJS               | API modular                        | 12.2.0 (`^12.1.3`)                                                    |
| TypeScript           | Lenguaje                           | 6.0.3 (`~6.0.3`)                                                      |
| PostgreSQL           | Base relacional local              | 17; imagen `pgvector/pgvector:0.8.7-pg17`                             |
| pgvector             | Embeddings en PostgreSQL           | 0.8.7; habilitada al inicializar la base                              |
| node-postgres (`pg`) | Cliente PostgreSQL para Node       | 8.23.1                                                                |
| Vitest               | Pruebas unitarias                  | 4.1.12                                                                |
| Testing Library      | Pruebas de UI orientadas a usuario | React 16.3.3, user-event 14.6.7                                       |
| jsdom                | Entorno DOM para pruebas web       | 30.1.3                                                                |
| ESLint               | Análisis estático                  | 10.13.0 + typescript-eslint 8.71.1                                    |
| Prettier             | Formato consistente                | 3.9.9                                                                 |
| Playwright           | E2E navegador                      | `@playwright/test` 1.64.0, Chromium 156.0.8078.4                      |
| Husky                | Hooks locales de Git               | 9.1.7                                                                 |

Las versiones efectivamente resueltas quedan fijadas en `pnpm-lock.yaml`. Consulta `package.json` de cada workspace para rangos declarados.

## Decisiones de actualización

- NestJS 12 requiere Node.js 20.19 o posterior, o Node.js 22.12 o posterior en la línea 22. El proyecto fija Node 26.13.0 y limita el soporte a `^22.22.2 || ^24.15.0 || ^26.13.0`, de acuerdo con sus herramientas de desarrollo y CI. Véase la [guía oficial de migración de NestJS 12](https://docs.nestjs.com/migration-guide).
- ESLint 10 requiere Node.js 20.19 o posterior, 22.13 o posterior o 24 o posterior; los runtimes admitidos por este repositorio cumplen esos mínimos. Véase la [guía oficial de migración de ESLint 10](https://eslint.org/docs/latest/use/migrate-to-10.0.0).
- Se mantiene TypeScript 6.0.3 como compilador estable verificado con NestJS 12, `typescript-eslint` y la configuración de ambos workspaces. TypeScript 7 ya es estable, pero su cambio a una implementación nativa queda para una actualización independiente que verifique compilación, editor e integraciones antes de adoptarlo; no se incluye en esta actualización de dependencias. Dependabot ignora versiones `>=7.0.0` para evitar PR incompatibles mientras `typescript-eslint` no declare soporte. Véase la [documentación oficial de TypeScript 6](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-6-0.html) y el [anuncio de TypeScript 7](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/).
- La versión estable `typescript-eslint` 8.71.1 declara soporte para TypeScript `>=4.8.4 <6.1.0`. El TypeScript 7 estable queda fuera de ese rango; la exclusión de Dependabot se mantiene hasta que el parser declare soporte y pase typecheck/lint en este repositorio. Véase la [matriz oficial de versiones](https://typescript-eslint.io/users/dependency-versions/).
- El API usa `@types/node` `^26.6.5`, con Node 26 fijado como runtime de CI y de las imágenes. La actualización incluye también `.node-version` y el Dockerfile para que las declaraciones de tipos no avancen dejando el runtime atrás.
- `minimatch` se fuerza a `11.0.1` mediante `pnpm-workspace.yaml` para corregir GHSA-g3hv-75wg-m249, que afectaba a la versión transitoria `10.2.6` de las herramientas ESLint. La versión parcheada pasó el lint, typecheck y las suites de API y web.

## Procesos

- `@grumphya/web`: Vite en `http://127.0.0.1:5173`; `/api/*` se reenvía a la API.
- `@grumphya/api`: NestJS en desarrollo local por `http://127.0.0.1:3000`, prefijo `/api`.
- En producción NestJS escucha por HTTPS en `0.0.0.0:3000` dentro de la red privada; el proxy perimetral Caddy valida su certificado y es quien publica la API. Nginx sirve la web por HTTPS en `web:8443` dentro de la red de Compose.
- `db` en Docker Compose: `127.0.0.1:5433` por defecto → PostgreSQL `5432` del contenedor. Para cambiar el puerto publicado, ajusta `GRUMPHYA_DB_HOST_PORT` en `.env.docker`; `PGPORT` solo configura clientes del host, porque la API en Compose usa `db:5432` por la red interna.
- Volumen persistente: `grumphya-postgres-data`.
- Para levantar/recrear el stack `db` + `api` + `web` y esperar sus healthchecks: `docker compose --env-file .env.docker up -d --build --force-recreate --wait`. `down` sin `-v` retira contenedores y red, pero conserva el volumen; `down -v` lo borra.
- Base local: `grumphya_dev`; extensión `vector` incluida en la imagen.
- El PostgreSQL de Homebrew preexistente permanece en el puerto `5432`; Compose usa `5433` para no interferir con él.

El endpoint `GET /api/health` verifica conectividad de la base y devuelve la versión activa de pgvector. No es una API funcional de evaluación ni debe publicarse como endpoint de diagnóstico detallado en producción.

## Decisiones y límites

- Monolito modular: una API NestJS y una base PostgreSQL; no se añade Redis, colas, Pinecone ni Kubernetes sin un requisito medido.
- No se instala un motor de pagos: los planes del MVP tienen activación simulada.
- Docker Desktop es requisito del comando integrado `pnpm dev`; la imagen de base y versión están fijadas en `compose.yaml`.
- PostgreSQL de Homebrew se conserva como instalación local preexistente, pero no lo usa la app desde el flujo Compose.
- En `main`, evaluación, firma semántica, embeddings y comparación usan adaptadores OpenAI opcionales configurados con `OPENAI_API_KEY`; el evaluador requiere además `EVALUATION_PROVIDER=openai`. Sin proveedor evaluador configurado, la evaluación responde `503`. `pnpm dev` carga `.env.docker`, `.env.openai` y `.env`, todos ignorados por Git; consulta [credenciales](credentials.md) para la ubicación de la clave y los secretos locales de Compose. La política activa es `grumphya-concept-v9`; incluye diferenciación en categorías maduras y exige nota en ideas funcionales; C07 también exige un valor o motivo de uso expresado y C10 no compensa ese suspenso. Si C10 es el primer veto (`stop_at: C10`), el contrato público puede incluir un nombre de producto conocido con funciones coincidentes, sin búsqueda web ni verificación de disponibilidad actual; ese ejemplo no cambia el score. La respuesta también devuelve estado, score, titular y explicación, y añade título seguro en rechazos.
