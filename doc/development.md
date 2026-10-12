# Desarrollo local

## Requisitos

- macOS, Linux o Windows con Node.js 22–24 y pnpm 12.
- Docker Desktop y PostgreSQL 17 con extensión pgvector 0.8.x (arranca con Compose).
- Para tests E2E: navegador Chromium de Playwright.

En este Mac, Node/pnpm estaban disponibles; Docker Desktop está instalado y probado. PostgreSQL de Homebrew también está instalado, pero el proyecto usa su propio contenedor aislado en el puerto 5433. Tras clonar el repo, `corepack enable` puede habilitar pnpm si no está en el PATH.

## Preparación local

```sh
pnpm install
pnpm db:setup
```

`pnpm db:setup` genera `.env.docker` con una contraseña aleatoria de desarrollo y permisos de archivo `0600`; está excluida de Git. No la copies a producción. Para E2E, instala Chromium una vez con `pnpm --filter @grumphya/web exec playwright install chromium`.

## Arranque

En una terminal:

```sh
pnpm dev
```

Puedes ejecutar este comando directamente en la terminal integrada de Visual
Studio Code (`Terminal > New Terminal`). Los procesos de Vite y NestJS heredan
esa terminal, por lo que los mensajes `[infra]` aparecen allí en cada arranque;
no dependen de la consola del navegador ni de una extensión de VS Code.

El arranque ejecuta comprobaciones acotadas y las imprime siempre por líneas en
la terminal:

```text
[infra] PostgreSQL levantado OK
[infra] pgvector 0.8.7 habilitado OK
[infra] NestJS levantado OK
[infra] Comunicación React/Vite → NestJS OK
[infra] Health check completo: frontend, API y base de datos OK
```

El proyecto utiliza una única base PostgreSQL; `pgvector` es una extensión de
esa base, no una segunda base de datos. Por eso se muestran dos comprobaciones
separadas para dejar verificadas ambas capacidades.

- Web: <http://127.0.0.1:5173>
- API: <http://127.0.0.1:3000/api/health>
- PostgreSQL: `127.0.0.1:5433` (contenedor `db`).
- API directamente accesible solo en loopback (`127.0.0.1`).
- Vite reenvía `/api` a NestJS.

Para parar web/API: `Ctrl+C`. Para parar y retirar el contenedor sin borrar sus datos: `pnpm db:down`. El volumen de Docker conserva la base al detenerla.

## Calidad y build

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

El hook de Git, cuando se inicialice Husky para el equipo, debe ejecutar al menos `pnpm lint` y `pnpm test`. No se fuerza un hook en el repo inicial hasta configurar explícitamente su ciclo de contribución.

## Dictado de ideas

`transcriptUserIdea` ofrece dictado temporal en español (`es-ES`) mediante la
Web Speech API del navegador. Pulsa «Dictar idea» para solicitar el permiso del
navegador; la transcripción se añade al campo y queda editable antes de enviar.
Si el navegador no soporta la API, se deniega el permiso o no se detecta voz,
se muestra un mensaje y la escritura manual sigue disponible. Al desmontar el
control se detiene la sesión activa.

El frontend no recibe ni persiste el audio. La implementación del navegador
puede transferir voz a su propio servicio de reconocimiento; por eso la UI lo
indica y esta integración no debe describirse como procesamiento local. El
texto transcrito no se envía ni guarda por este flujo. El adaptador reusable
está en `apps/web/src/shared/utils/speech-to-text.ts`; la interfaz propia de
esta feature está en `apps/web/src/features/transcript-user-idea/`.

La conversión voz-a-texto se comparte entre features porque también está
prevista para el envío de roast; su botón y manejo de estado permanecen locales
a cada feature, de acuerdo con la regla de alcance del proyecto.

## Scoring de evaluación (rama experimental)

`POST /api/evaluation-process` valida la idea y delega en el `EvaluationPort`.
Sin proveedor configurado, el endpoint mantiene el comportamiento seguro
actual y responde `503`; el fake solo está registrado en pruebas.

Esta rama experimental añade un adaptador directo a OpenAI Responses API. Para
activarlo en desarrollo, añade estas variables al archivo local ignorado
`.env.openai` y reinicia `pnpm dev`:

```dotenv
EVALUATION_PROVIDER=openai
OPENAI_API_KEY=<clave-de-tu-proyecto-api>
OPENAI_MODEL=gpt-5.4-mini
OPENAI_REASONING_EFFORT=medium
```

No pegues una clave real en Git, documentación compartida, tickets o historial
del shell. `pnpm dev` carga `.env.openai` además de `.env.docker`. El modelo y
el esfuerzo pueden cambiarse por configuración. La política `grumphya-concept-v4`
rechaza también la ausencia de mecanismos conceptuales imprescindibles para
la promesa central si causa un perjuicio directo previsible; no pide aclaraciones
ni da por resuelto lo que no se describe. Cada envío se evalúa por separado.
La API envía la idea y la versión de política a OpenAI; el tono de interfaz no se
envía. Las respuestas se solicitan con JSON Schema estricto y `store: false`,
pero esto **no equivale a Zero Data Retention**: según los controles vigentes de
OpenAI, el uso ordinario de API puede generar logs de abuso que incluyan prompts
y respuestas y conservarlos hasta 30 días. Revisa la [política de controles de
datos de OpenAI](https://developers.openai.com/api/docs/guides/your-data) antes
de enviar ideas reales.

La validación semántica del backend sigue siendo autoritativa: JSON bien
formado no garantiza que la decisión respete la rúbrica. Esta rama es para una
comparación exploratoria, no habilita por sí sola el proveedor en `main` ni
representa una evaluación de calidad aprobada.

## Entorno configurable

Valores locales por defecto:

| Variable     | Valor local                | Uso                                       |
| ------------ | -------------------------- | ----------------------------------------- |
| `API_PORT`   | `3000`                     | Puerto HTTP de NestJS                     |
| `WEB_ORIGIN` | `http://localhost:5173`    | Origen CORS permitido por API             |
| `PGHOST`     | `127.0.0.1`                | PostgreSQL local de Docker                |
| `PGPORT`     | `5433`                     | Puerto publicado por Compose              |
| `PGDATABASE` | `grumphya_dev`             | Base aislada de desarrollo                |
| `PGUSER`     | `grumphya_dev`             | Rol local del contenedor                  |
| `PGPASSWORD` | aleatoria en `.env.docker` | Solo desarrollo; archivo ignorado por Git |

Los valores los genera `pnpm db:setup` en `.env.docker`. Para compartir configuraciones, usa placeholders; no añadas secretos al repo.
