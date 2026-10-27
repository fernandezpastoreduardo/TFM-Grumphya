# TFM Grumphya

Grumphya es una aplicación web responsive, en español de España, que ayuda a evaluar ideas de aplicaciones web y móviles antes de invertir tiempo y dinero en desarrollarlas. Analiza riesgos, viabilidad y supuestos, y propone siguientes pasos con un tono configurable.

## Alcance del MVP y estado actual

La primera entrega definió el alcance funcional inicial. Las secciones siguientes
documentan ese alcance y las ampliaciones incorporadas después; no representan
una lista de trabajo pendiente.

### Primera entrega

- Entrada de idea por teclado o pegado, y dictado en navegadores que admiten reconocimiento local; el usuario revisa la transcripción antes de enviarla.
- Evaluación según la rúbrica v1 documentada en [`agentic-guidelines/features.md`](agentic-guidelines/features.md).
- Detección de ideas rechazadas repetidas con coincidencia semántica estrictamente superior a `0,90`; no se reutilizan evaluaciones anteriores.
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

## Arranque del entorno técnico

Consulta [`doc/README.md`](doc/README.md) para instalar requisitos, arrancar los servicios, ejecutar pruebas y preparar un despliegue de producción. En desarrollo, Docker Compose levanta PostgreSQL con `pgvector`.

## Documentación

- [`AGENTS.md`](AGENTS.md): principios de arquitectura y prácticas del proyecto.
- [`agentic-guidelines/sections.md`](agentic-guidelines/sections.md): secciones, flujos y alcance de entregas.
- [`agentic-guidelines/features.md`](agentic-guidelines/features.md): casos de uso y rúbrica de evaluación v1.
- [`agentic-guidelines/ai-evaluation.md`](agentic-guidelines/ai-evaluation.md): evaluación comparativa del modelo, seguridad y privacidad de telemetría.
- [`doc/ci-cd.md`](doc/ci-cd.md): pipeline de integración, pruebas aisladas y análisis de dependencias e imagen.
- [`agentic-guidelines/Dtos.md`](agentic-guidelines/Dtos.md): contratos de datos.
- [`agentic-guidelines/persistence.md`](agentic-guidelines/persistence.md): modelo de persistencia.
- [`agentic-guidelines/components.md`](agentic-guidelines/components.md): responsabilidades de componentes.
- [`agentic-guidelines/copy-style.md`](agentic-guidelines/copy-style.md): voz y microcopy.
- [`agentic-guidelines/UI-aestethics.md`](agentic-guidelines/UI-aestethics.md): dirección visual y accesibilidad.
- [`doc/ui.md`](doc/ui.md): resumen de la UI aprobada y su implementación.
- [`ideas-and-designs/`](ideas-and-designs/): referencias visuales para diseño y maquetación.
