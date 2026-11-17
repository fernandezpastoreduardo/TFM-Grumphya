# TFM Grumphya

Grumphya es una aplicación web responsive, en español de España, que ayuda a evaluar ideas de aplicaciones web y móviles antes de invertir tiempo y dinero en desarrollarlas. Analiza riesgos, viabilidad y supuestos, y propone siguientes pasos con un tono configurable.

## Alcance del MVP y estado actual

La primera entrega definió el alcance funcional inicial. Las secciones siguientes
documentan ese alcance y las ampliaciones incorporadas después; no representan
una lista de trabajo pendiente.

### Primera entrega

- Entrada de idea por teclado o pegado, y dictado en navegadores que admiten reconocimiento local; el usuario revisa la transcripción antes de enviarla.
- Evaluación según la rúbrica conceptual vigente documentada en [`agentic-guidelines/scoring-viability-software.md`](agentic-guidelines/scoring-viability-software.md).
- Detección de ideas rechazadas repetidas sin reutilizar evaluaciones anteriores. Pgvector recupera hasta 20 candidatas por cercanía, sin umbral coseno fijo; un comparador semántico confirma la equivalencia de finalidad y público u objeto. Consulta el [estado de similitud](doc/security-and-similarity-roadmap.md).
- Tres usos anónimos de evaluación de ideas y tres de roast por perfil de navegador, en contadores independientes. El servidor purga el perfil tras 400 días sin actividad; cerrar el navegador no reinicia el cupo y no se crea historial personal anónimo.
- Alta y acceso de cuentas asociadas a un plan Iluminado o Faltón; la contratación se simula y no procesa dinero real.
- Cada plan dura un mes natural. Iluminado concede 11 evaluaciones de ideas al día; Faltón concede 11 envíos de roast al día. Los límites se reinician a las 00:00 de `Europe/Madrid`.
- Historial privado de ideas aprobadas y rechazadas para usuarios registrados; no es un registro completo de todas las evaluaciones.

### Ampliaciones ya disponibles

Ideas rechazadas y roast, rankings, ROI y contacto están implementados.

Los rankings públicos de humanos muestran solo alias y número de ideas aprobadas. El ranking semanal de ideas rechazadas muestra solo un título genérico seguro y el número de recepciones; nunca muestra autor ni texto original. Los datos de muestra sirven para desarrollo, pruebas y revisión visual, y no se entregan a usuarios finales.

### Pendiente de medio plazo

Integración de pagos reales para los planes.

## Arquitectura prevista

- Frontend: React 19, TypeScript 6 y Vite 7.
- Backend: NestJS 12 y TypeScript 6 como monolito modular.
- Persistencia: PostgreSQL 17 con `pgvector` 0.8.7 para buscar similitud semántica.
- La evaluación, la autorización, los límites y la activación de planes se validan en el backend.

## Instalación y arranque local

Requisitos: Git, Node.js `26.13.0`, pnpm `12.5.1` y Docker Desktop/Engine con Docker Compose v2. Los comandos siguientes usan una terminal compatible con POSIX (macOS, Linux, WSL o Git Bash). Clona el repositorio; en macOS, Linux o WSL con `nvm`, instala y activa la versión fijada:

```sh
git clone git@github.com:fernandezpastoreduardo/TFM-Grumphya.git
cd TFM-Grumphya
```

Con `nvm`, instala y activa la versión Node fijada:

```sh
nvm install
nvm use
```

Prepara dependencias y configuración local. `pnpm db:setup` genera `.env.docker` con secretos aleatorios de desarrollo; crea también los otros dos archivos locales que Compose y `pnpm dev` esperan:

```sh
npm install --global pnpm@12.5.1
pnpm install --frozen-lockfile
pnpm db:setup
touch .env.openai .env
```

Los archivos `.env*` están excluidos de Git; no compartas sus secretos. La aplicación no necesita una clave de OpenAI para arrancar, pero la evaluación de ideas, la similitud, el roast y la moderación de avatares requieren ese proveedor. Para habilitarlos, guarda `OPENAI_API_KEY` en `.env` y configura `EVALUATION_PROVIDER=openai` en `.env.openai`. Esas funciones envían solicitudes a OpenAI; revisa la [configuración y privacidad de IA](doc/development.md#evaluación-de-ideas) y [credenciales](doc/credentials.md) antes de probar con datos reales. Sin SMTP, los mensajes de verificación y recuperación quedan disponibles como previsualización local en <http://127.0.0.1:3000/api/dev/mail-preview/latest>; en desarrollo no hace falta configurar un servicio de correo.

### Desarrollo con Node.js y PostgreSQL en Docker

```sh
pnpm dev
```

Este comando levanta PostgreSQL 17 con pgvector en Docker y ejecuta NestJS y Vite en el equipo. Abre <http://127.0.0.1:5173>; la comprobación de API está en <http://127.0.0.1:3000/api/health>. Pulsa `Ctrl+C` para parar API y web; ejecuta `pnpm db:down` para detener también PostgreSQL. Los datos persisten en un volumen Docker.

### Aplicación completa en Docker

Para ejecutar PostgreSQL, API y web en contenedores locales, con los tres servicios en estado saludable:

```sh
docker compose --env-file .env.docker up -d --build --wait
```

Abre <http://127.0.0.1:5173>. Para aprovisionar la cuenta administradora local Jappy, define en `.env` una contraseña local `ADMIN_PASSWORD` de 12 a 128 caracteres que contenga mayúscula, minúscula, número y símbolo; ejecuta una vez, después de iniciar los servicios:

```sh
dotenv -e .env.docker -e .env -- pnpm --filter @grumphya/api provision-admin
```

Detén el stack sin borrar datos con:

```sh
docker compose --env-file .env.docker down
```

Los volúmenes conservan la base y los avatares; `down -v` los elimina. Para cambiar puertos o contraseñas, aprovisionar Jappy o resolver problemas de arranque, sigue la [guía de desarrollo local](doc/development.md).

### SonarQube Community Build local (opcional)

SonarQube se ejecuta como infraestructura separada de la aplicación. Requiere Docker y configurar sus propios archivos `.secrets/sonarqube_settings` y `.secrets/sonarqube_token`; el dashboard se abre mediante un puente local temporal. Consulta la [guía de instalación, dashboard y análisis](doc/sonarqube.md). Tras configurar el servidor, `pnpm sonar:verify` analiza el código local y exige el Quality Gate.

[`doc/README.md`](doc/README.md) reúne las demás guías de pruebas, operación y despliegue.

## Documentación

Para instrucciones de desarrollo, pruebas, operación y producción dirigidas a
personas, empieza por la [guía de contenidos de `/doc`](doc/README.md).

Las especificaciones para agentes y criterios internos de implementación están
en [`agentic-guidelines/`](agentic-guidelines/README.md); su guía de lectura
indica qué documento consultar según la tarea. [`AGENTS.md`](AGENTS.md) recoge
las reglas generales del repositorio. Las referencias visuales están en
[`ideas-and-designs/`](ideas-and-designs/).
