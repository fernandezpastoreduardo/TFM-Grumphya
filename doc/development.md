# Desarrollo local

## Requisitos

- macOS, Linux o Windows con Node.js `^22.22.2 || ^24.15.0` y pnpm 12. El repositorio fija Node 24.21.0 en `.node-version`; configura el mismo runtime localmente para reproducir CI. Los rangos admitidos están definidos en `package.json`.
- Docker Desktop y PostgreSQL 17 con extensión pgvector 0.8.x (arranca con Compose).
- Para tests E2E: navegador Chromium de Playwright.

En este Mac, Node/pnpm estaban disponibles; Docker Desktop está instalado y probado. PostgreSQL de Homebrew también está instalado, pero el proyecto usa su propio contenedor aislado; el puerto publicado predeterminado es 5433. Si otro proyecto ya ocupa ese puerto, cambia `GRUMPHYA_DB_HOST_PORT` en `.env.docker`; para el flujo mixto con API en el host, cambia además `PGPORT` al mismo puerto. En Compose la API conecta a `db:5432` por la red interna.

## Preparación local

```sh
pnpm install
pnpm db:setup
```

`pnpm db:setup` genera `.env.docker` con una contraseña de desarrollo y secretos HMAC de IP y access token aleatorios, y permisos de archivo `0600`; está excluida de Git. No copies esos valores a producción. Para E2E, instala Chromium una vez con `pnpm --filter @grumphya/web exec playwright install chromium`.

## Arranque

### Stack completo en Docker

Para revisión local con base de datos persistente, prepara primero los archivos
de entorno locales con `pnpm db:setup` y asegúrate de que existan `.env.openai`
y `.env`. Configura una contraseña fuerte `ADMIN_PASSWORD` en `.env` para el
aprovisionamiento explícito local de Jappy; `OPENAI_API_KEY` solo hace falta para las funciones
de IA. Compose requiere esos archivos; no copies sus valores a documentación o
Git. Después arranca o renueva los tres servicios:

```sh
docker compose --env-file .env.docker up -d --build --force-recreate --wait
```

Compose espera a que `db`, `api` y `web` estén sanos. Los puertos se publican
solo en loopback: PostgreSQL `127.0.0.1:5433`, API `127.0.0.1:3000` y web
`127.0.0.1:5173`. Si cambias el puerto publicado de PostgreSQL, ajusta
`GRUMPHYA_DB_HOST_PORT` en `.env.docker` y recrea los servicios. La API dentro
de Compose conecta a `db:5432` por la red Docker, así que `PGPORT` no necesita
cambiar. En el flujo mixto (API ejecutada en el host), alinea también `PGPORT`
con el puerto publicado y reinicia los procesos.

Jappy no cambia cuando se inicia la API. Después de que PostgreSQL esté
disponible, crea la cuenta local de forma explícita; las ejecuciones siguientes
no cambian su contraseña:

```sh
dotenv -e .env.docker -e .env -- pnpm --filter @grumphya/api provision-admin
```

Para cambiar la contraseña de forma deliberada y revocar las sesiones activas,
actualiza `ADMIN_PASSWORD` en `.env` y ejecuta:

```sh
dotenv -e .env.docker -e .env -- pnpm --filter @grumphya/api change-admin-password
```

La base vive en el volumen con nombre de Compose `grumphya-postgres-data`.
Reiniciar o recrear contenedores, incluido el comando anterior, conserva ese
volumen y los datos. Para detener y retirar contenedores/red sin borrar la base:

```sh
docker compose --env-file .env.docker down
```

No uses `docker compose down -v`: `-v` elimina también el volumen y borra los
datos persistidos, incluidos los avatares. La API mantiene los WebP aprobados
en el volumen separado `grumphya-avatar-data`, montado en
`/workspace/var/avatars`; la migración de la base conserva la clave opaca que
localiza cada archivo. `docker compose down` y `up --build --force-recreate`
conservan ambos volúmenes. La operación de baja elimina el archivo de avatar
asociado al usuario además de sus datos SQL. La configuración de puertos,
healthchecks y montaje está en
[`compose.yaml`](../compose.yaml); el build y los puertos expuestos están en
[`Dockerfile`](../Dockerfile), y [`.dockerignore`](../.dockerignore) excluye
archivos de entorno y artefactos locales del contexto de build.

Los servicios API y web usan el usuario sin privilegios `node` de la imagen;
el build asigna `/workspace` a ese usuario antes de cambiar la identidad de
runtime. Los entrypoints `docker/api-entrypoint.sh` y
`docker/postgres-entrypoint.sh` leen desde `/run/secrets` solo los ajustes que
necesita cada servicio. El contenedor de API recibe el secreto de DB como
`PGPASSWORD` y elimina `GRUMPHYA_DB_PASSWORD` del entorno antes de iniciar
NestJS. Además, aplica una allowlist distinta a cada archivo: `.env.docker`
solo puede definir credenciales de PostgreSQL, JWT y HMAC; `.env.openai` solo
configuración de proveedor, modelo, razonamiento y timeout; `.env` solo carga
`OPENAI_API_KEY` al contenedor. El comando explícito de aprovisionamiento local
lee `ADMIN_PASSWORD` desde `.env`; la API no la recibe al arrancar. Así, un
archivo de proveedor no puede sobrescribir secretos de DB o autenticación.

Compose usa secretos respaldados por archivos locales: se montan en los
contenedores como archivos y no se copian a la imagen gracias a
`.dockerignore`. En Compose local esos archivos no equivalen a un secret manager
cifrado en reposo; protégelos con permisos del sistema, mantenlos ignorados por
Git y no muestres sus contenidos. `docker compose --env-file .env.docker config`
debe mostrar las rutas de los secretos, no sus valores.

La moderación de avatares también necesita el `OPENAI_API_KEY` existente en
`.env`. Desde el perfil, el editor presenta el avatar en un diálogo circular con
selector de imagen, arrastre para encuadrar, controles de desplazamiento y zoom
de 1× a 3×, y previsualización final. El navegador genera mediante canvas un
recorte JPEG de 128 × 128; la máscara circular solo afecta a la presentación.
Al guardar, el endpoint requiere Bearer y `Origin` exacto de `WEB_ORIGIN`,
acepta una sola parte multipart llamada `avatar` de hasta 5 MiB y limita a tres
subidas por minuto/IP en cada proceso. El backend comprueba de nuevo que el
formato decodificado coincide con el MIME declarado (JPEG, PNG o WebP; rechaza
SVG y archivos disfrazados), limita la entrada a 20 megapíxeles y normaliza la
imagen a WebP de 128 × 128 con orientación corregida y metadatos descartados.
`omni-moderation-latest` recibe ese WebP final, nunca los bytes originales ni el
JPEG temporal del recorte. Si falta la clave, el proveedor no responde o su
respuesta no puede validarse, no se almacena el avatar. Los errores de
moderación, almacenamiento y actualización de cuenta se devuelven como `503`
genérico; carga multipart inválida devuelve `400` y exceso de tamaño `413`, sin
filtrar detalles internos. La moderación automática no garantiza que una imagen
sea apta ni detecta todo contenido; tampoco sustituye una revisión humana. La
política de privacidad versión 3 en `/politica-de-privacidad`. La configuración
real de proveedores, copias y logs debe verificarse antes de producción. No subas contenido conocido o sospechoso de
abuso sexual infantil: esta moderación no está diseñada para detectarlo.

### Arranque mixto con Node y base en Docker

Para desarrollar con Vite y NestJS ejecutados en el host, usa el flujo mixto:

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
pnpm format:check
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

El hook de Git, cuando se inicialice Husky para el equipo, debe ejecutar al menos `pnpm lint` y `pnpm test`. No se fuerza un hook en el repo inicial hasta configurar explícitamente su ciclo de contribución.

## Estilos de la interfaz

La app web usa Sass/SCSS en tiempo de compilación. Vite procesa `.scss` y activa
la división de CSS para separar los estilos asociados a cada importación
dinámica. `main.tsx` carga solo la base global; Home, el marco de secciones y
cada funcionalidad importan su hoja SCSS junto a su código. `App` carga Home o
la página de sección de forma diferida, y `SectionPage` carga únicamente la
funcionalidad de la ruta actual.

Ubica los estilos según su alcance: una funcionalidad en su propio directorio;
los estilos realmente usados por dos o más funcionalidades en `shared/`.
Prefiere `.module.scss` para estilos encapsulados de componentes nuevos o ya
migrados. El CSS legado separado por vistas conserva algunos selectores globales
mientras se convierten gradualmente; no se debe volver a añadir ese CSS a una
hoja global única.

### Previsualizar páginas de error

Con Vite en desarrollo, abre `/__preview/errors/404`,
`/__preview/errors/429` o `/__preview/errors/500`. Estas rutas fuerzan solo la
presentación: no consumen cuota ni simulan respuestas de la API. Consulta
[`error-pages.md`](error-pages.md) para los casos conectados y sus límites.

## Dictado de ideas

`transcriptUserIdea` ofrece dictado temporal en español (`es-ES`) mediante la
Web Speech API cuando el navegador admite reconocimiento en el dispositivo.
La integración requiere `processLocally = true`, comprueba que el paquete local
de español esté disponible y lo instala en el dispositivo si hace falta. No
inicia reconocimiento remoto como alternativa. Pulsa «Dictar idea» para
solicitar el permiso del navegador; la transcripción se añade al campo y queda
editable antes de enviar. Si el navegador no ofrece la API necesaria para
reconocer voz localmente, el control no aparece. Si la API está presente pero
no hay paquete local de español o se deniega el permiso, se muestra un mensaje
y la escritura manual sigue disponible. Al desmontar el control se detiene la
sesión activa. La función se oculta en Android: no se considera suficiente la
presencia de la API para garantizar el modo local en esos navegadores.

El audio no se envía al servidor de Grumphya ni a un servicio remoto de
transcripción. La descarga inicial del paquete de idioma la gestiona el
navegador. Esta API es experimental y no está disponible en todos los
navegadores; la función permanece desactivada donde no se puede garantizar el
procesamiento local. El texto transcrito no se envía ni guarda por este flujo.
El adaptador reusable está en
`apps/web/src/shared/utils/speech-to-text.ts`; la interfaz propia de esta
feature está en `apps/web/src/features/transcript-user-idea/`.

La conversión voz-a-texto se comparte entre features porque también está
prevista para el envío de roast; su botón y manejo de estado permanecen locales
a cada feature, de acuerdo con la regla de alcance del proyecto.

## Evaluación de ideas

`POST /api/evaluation-process` valida la idea y delega en el `EvaluationPort`.
Sin proveedor configurado, el endpoint mantiene el comportamiento seguro
actual y responde `503`; el fake solo está registrado en pruebas.

La evaluación configurable está integrada en la aplicación. Para activarla en
desarrollo, añade estas variables al archivo local ignorado `.env.openai` y
reinicia `pnpm dev`:

```dotenv
EVALUATION_PROVIDER=openai
OPENAI_MODEL=gpt-5.4-mini
OPENAI_REASONING_EFFORT=medium
```

Guarda `OPENAI_API_KEY` en el archivo local ignorado `.env`. El valor de
`EVALUATION_PROVIDER` y los ajustes del modelo se guardan en `.env.openai`;
Compose entrega esos archivos a los entrypoints mediante `/run/secrets`, que
exportan solo las variables permitidas. `docker compose config` muestra las
rutas de origen de los secretos, no sus valores.

No pegues una clave real en Git, documentación compartida, tickets o historial
del shell. `pnpm dev` carga `.env.docker`, `.env.openai` y `.env`. El modelo y
el esfuerzo pueden cambiarse por configuración. La política `grumphya-concept-v9`
aplica una lectura adversarial proporcional y exige una puntuación en toda idea
funcional. C07 también exige que la idea exprese un valor o motivo concreto para
empezar y continuar usándola: una función que solo registra una acción sin
explicar su resultado útil puede suspender, aunque sea novedosa. No se exige
resolver un dolor ni demostrar demanda externa si expresa otra finalidad clara,
como bienestar, aprendizaje, comodidad o entretenimiento. Evalúa los fallos
concretos C01–C09 antes de considerar C10; que una función ya exista o tenga
alternativas no basta para rechazarla. C10 requiere una categoría claramente
madura y que la propuesta no ofrezca un motivo reconocible para elegirla. No
presupone honestidad ni buenas intenciones, analiza abuso, impacto, verificación,
contención y reparación, especialmente en interacciones presenciales entre
desconocidos. No convierte riesgos exóticos ni detalles rutinarios en vetos.
Cada envío se evalúa por separado y no pide aclaraciones. La interfaz envía la
idea y el tono a la API; el adaptador no envía el tono al modelo. El servidor
aplica el tono solo al redactar `headline` y `message`, nunca cambia el veredicto
o la puntuación por el tono. Las respuestas se solicitan con JSON Schema estricto
y `store: false`,
pero esto **no equivale a Zero Data Retention**: según los controles vigentes de
OpenAI, el uso ordinario de API puede generar logs de abuso que incluyan prompts
y respuestas y conservarlos hasta 30 días. Revisa la [política de controles de
datos de OpenAI](https://developers.openai.com/api/docs/guides/your-data) antes
de enviar ideas reales.

La validación semántica del backend sigue siendo autoritativa: JSON bien
formado no garantiza que la decisión respete la rúbrica. Si falta la
configuración del proveedor, el endpoint responde `503`; el fake solo se
registra en pruebas. La API envía a OpenAI el texto de la idea y la versión de
política, pero no el tono. El proveedor devuelve una evaluación neutral y el
servidor compone el titular y el mensaje visibles según el tono elegido. El
resultado del front presenta titular, puntuación y explicación específica; la
UI no etiqueta los defectos como «bloqueos».

## Entorno configurable

Valores locales por defecto:

| Variable                | Valor local                | Uso                                                                                         |
| ----------------------- | -------------------------- | ------------------------------------------------------------------------------------------- |
| `API_PORT`              | `3000`                     | Puerto HTTP de NestJS                                                                       |
| `WEB_ORIGIN`            | `http://localhost:5173`    | Origen CORS permitido por API                                                               |
| `PGHOST`                | `127.0.0.1`                | PostgreSQL local de Docker                                                                  |
| `PGPORT`                | `5433`                     | Puerto publicado al que conecta la API cuando corre en el host; en Compose se usa `db:5432` |
| `GRUMPHYA_DB_HOST_PORT` | `5433`                     | Puerto loopback publicado por Compose para PostgreSQL                                       |
| `PGDATABASE`            | `grumphya_dev`             | Base aislada de desarrollo                                                                  |
| `PGUSER`                | `grumphya_dev`             | Rol local del contenedor                                                                    |
| `PGPASSWORD`            | aleatoria en `.env.docker` | Solo desarrollo; archivo ignorado por Git                                                   |

Los valores los genera `pnpm db:setup` en `.env.docker`. Para compartir configuraciones, usa placeholders; no añadas secretos al repo.
