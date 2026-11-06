# TFM Grumphya

Grumphya es una aplicación web responsive, en español de España, que ayuda a evaluar ideas de aplicaciones web y móviles antes de invertir tiempo y dinero en desarrollarlas. Analiza riesgos, viabilidad y supuestos, y propone siguientes pasos con un tono configurable.

## Alcance del MVP y estado actual

La primera entrega definió el alcance funcional inicial. Las secciones siguientes
documentan ese alcance y las ampliaciones incorporadas después; no representan
una lista de trabajo pendiente.

### Primera entrega

- Entrada de idea por teclado o pegado, y dictado en navegadores que admiten reconocimiento local; el usuario revisa la transcripción antes de enviarla.
- Evaluación según la rúbrica conceptual vigente documentada en [`agentic-guidelines/scoring-viability-software.md`](agentic-guidelines/scoring-viability-software.md).
- Detección de ideas rechazadas repetidas sin reutilizar evaluaciones anteriores. La implementación actual recupera hasta 20 candidatas por cercanía y delega la decisión de equivalencia a un comparador semántico. La regla `> 0,90` de `AGENTS.md` aún no está reconciliada con este comportamiento; consulta el [estado de similitud](doc/security-and-similarity-roadmap.md).
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

Requisitos: Node.js 26.13.0, pnpm 12.5.1 y Docker con Docker Compose. En macOS o Linux, si usas `nvm`, desde la raíz del repositorio instala y activa la versión fijada:

```sh
nvm install
nvm use
npm install --global pnpm@12.5.1
```

Después instala dependencias, prepara la configuración local y arranca la aplicación:

```sh
pnpm install
pnpm db:setup
touch .env.openai .env
pnpm dev
```

`pnpm db:setup` crea `.env.docker` con credenciales aleatorias para PostgreSQL y secretos locales; los archivos `.env*` están excluidos de Git. Crea `.env.openai` y `.env` en la raíz antes de arrancar, aunque pueden estar vacíos si no vas a usar funciones de IA. Para habilitar la evaluación con OpenAI, añade `OPENAI_API_KEY` a `.env` y `EVALUATION_PROVIDER=openai` a `.env.openai`; no guardes claves reales en Git.

`pnpm dev` levanta PostgreSQL con `pgvector` en Docker y ejecuta NestJS y Vite en el equipo. Abre <http://127.0.0.1:5173>; la API está en <http://127.0.0.1:3000/api/health>. Para parar la aplicación usa `Ctrl+C`; para detener también PostgreSQL sin borrar sus datos, ejecuta `pnpm db:down`.

La guía de [`desarrollo local`](doc/development.md) incluye el stack completo en Docker, configuración de IA y aprovisionamiento del administrador. [`doc/README.md`](doc/README.md) reúne el resto de la documentación, pruebas y despliegue de producción.

## Documentación

Para instrucciones de desarrollo, pruebas, operación y producción dirigidas a
personas, empieza por la [guía de contenidos de `/doc`](doc/README.md).

Las especificaciones para agentes y criterios internos de implementación están
en [`agentic-guidelines/`](agentic-guidelines/README.md); su guía de lectura
indica qué documento consultar según la tarea. [`AGENTS.md`](AGENTS.md) recoge
las reglas generales del repositorio. Las referencias visuales están en
[`ideas-and-designs/`](ideas-and-designs/).
