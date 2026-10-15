# Stack instalado

## Requisitos y componentes

| Componente           | Uso                                | Versión verificada / política                    |
| -------------------- | ---------------------------------- | ------------------------------------------------ |
| macOS Apple Silicon  | Host local actual                  | macOS del equipo de desarrollo                   |
| Node.js              | Runtime de frontend y API          | 24.20.0; proyecto declara `>=22 <25`             |
| pnpm                 | Workspaces y dependencias          | 12.5.1; fijado en `packageManager`               |
| Docker Desktop       | Motor local de contenedores        | 4.94.0 (241994)                                  |
| Docker Engine        | Servidor de contenedores           | 29.8.2, linux/arm64                              |
| Docker Compose       | Orquestación local                 | 5.5.1                                            |
| React / React DOM    | Interfaz                           | 19.3.0                                           |
| Vite                 | Servidor local y build web         | 7.3.7                                            |
| NestJS               | API modular                        | 11.2.7                                           |
| TypeScript           | Lenguaje                           | 5.9.3                                            |
| PostgreSQL           | Base relacional local              | 17; imagen `pgvector/pgvector:0.8.7-pg17`        |
| pgvector             | Embeddings en PostgreSQL           | 0.8.7; habilitada al inicializar la base         |
| node-postgres (`pg`) | Cliente PostgreSQL para Node       | 8.23.1                                           |
| Vitest               | Pruebas unitarias                  | 3.2.7                                            |
| Testing Library      | Pruebas de UI orientadas a usuario | React 16.3.3, user-event 14.6.7                  |
| ESLint               | Análisis estático                  | 9.39.5 + typescript-eslint 8.71.1                |
| Prettier             | Formato consistente                | 3.9.9                                            |
| Playwright           | E2E navegador                      | `@playwright/test` 1.64.0, Chromium 156.0.8078.4 |
| Husky                | Hooks locales de Git               | 9.1.7                                            |

Las versiones efectivamente resueltas quedan fijadas en `pnpm-lock.yaml`. Consulta `package.json` de cada workspace para rangos declarados.

## Procesos

- `@grumphya/web`: Vite en `http://127.0.0.1:5173`; `/api/*` se reenvía a la API.
- `@grumphya/api`: NestJS en `http://127.0.0.1:3000`, prefijo `/api`.
- En producción la API escucha en `0.0.0.0` dentro de la red privada del servicio; el proxy perimetral es quien la publica.
- `db` en Docker Compose: `127.0.0.1:5433` por defecto → PostgreSQL `5432` del contenedor. Se puede ajustar con `GRUMPHYA_DB_HOST_PORT` y `PGPORT` en `.env.docker` si el puerto está ocupado.
- Volumen persistente: `grumphya-postgres-data`.
- Base local: `grumphya_dev`; extensión `vector` incluida en la imagen.
- El PostgreSQL de Homebrew preexistente permanece en el puerto `5432`; Compose usa `5433` para no interferir con él.

El endpoint `GET /api/health` verifica conectividad de la base y devuelve la versión activa de pgvector. No es una API funcional de evaluación ni debe publicarse como endpoint de diagnóstico detallado en producción.

## Decisiones y límites

- Monolito modular: una API NestJS y una base PostgreSQL; no se añade Redis, colas, Pinecone ni Kubernetes sin un requisito medido.
- No se instala un motor de pagos: los planes del MVP tienen activación simulada.
- Docker Desktop es requisito del comando integrado `pnpm dev`; la imagen de base y versión están fijadas en `compose.yaml`.
- PostgreSQL de Homebrew se conserva como instalación local preexistente, pero no lo usa la app desde el flujo Compose.
- En `main`, evaluación, firma semántica, embeddings y comparación usan adaptadores OpenAI opcionales configurados con `OPENAI_API_KEY`; el evaluador requiere además `EVALUATION_PROVIDER=openai`. Sin proveedor evaluador configurado, la evaluación responde `503`. `pnpm dev` carga `.env.openai`, ignorado por Git. La política activa es `grumphya-concept-v6`; el contrato público devuelve estado, score, titular y explicación, y añade título seguro en rechazos.
