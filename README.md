# TFM Grumphya

Grumphya es una aplicación web responsive, en español de España, que ayuda a evaluar ideas de aplicaciones web y móviles antes de invertir tiempo y dinero en desarrollarlas. Analiza riesgos, viabilidad y supuestos, y propone siguientes pasos con un tono configurable.

## Alcance por entregas

### Primera entrega

- Entrada de idea por teclado, pegado o dictado por voz; el usuario revisa la transcripción antes de enviarla.
- Evaluación según la rúbrica v1 documentada en [`agentic-guidelines/features.md`](agentic-guidelines/features.md).
- Reutilización de una evaluación existente solo con similitud semántica estrictamente superior a `0,90`.
- Tres usos anónimos de evaluación de ideas y tres de roast por sesión, sin historial personal anónimo.
- Alta y acceso de cuentas asociadas a un plan Iluminado o Faltón; la contratación se simula y no procesa dinero real.
- Cada plan dura un mes natural. Iluminado concede 11 evaluaciones de ideas al día; Faltón concede 11 envíos de roast al día. Los límites se reinician a las 00:00 de `Europe/Madrid`.
- Historial privado para usuarios registrados.

### Corto plazo

Vistas completas de ideas rechazadas y roast, rankings, ROI y contacto.

Los rankings públicos de humanos muestran solo alias y número de ideas aprobadas. El ranking semanal de ideas rechazadas muestra solo un título genérico seguro y el número de recepciones; nunca muestra autor ni texto original. Los datos de muestra sirven para desarrollo, pruebas y revisión visual, y no se entregan a usuarios finales.

### Medio plazo

Integración de pagos reales para los planes.

## Arquitectura prevista

- Frontend: React, TypeScript y Vite.
- Backend: NestJS y TypeScript como monolito modular.
- Persistencia: PostgreSQL con `pgvector` para buscar similitud semántica.
- La evaluación, la autorización, los límites y la activación de planes se validan en el backend.

## Documentación

- [`AGENTS.md`](AGENTS.md): principios de arquitectura y prácticas del proyecto.
- [`agentic-guidelines/sections.md`](agentic-guidelines/sections.md): secciones, flujos y alcance de entregas.
- [`agentic-guidelines/features.md`](agentic-guidelines/features.md): casos de uso y rúbrica de evaluación v1.
- [`agentic-guidelines/Dtos.md`](agentic-guidelines/Dtos.md): contratos de datos.
- [`agentic-guidelines/persistence.md`](agentic-guidelines/persistence.md): modelo de persistencia.
- [`agentic-guidelines/components.md`](agentic-guidelines/components.md): responsabilidades de componentes.
- [`agentic-guidelines/copy-style.md`](agentic-guidelines/copy-style.md): voz y microcopy.
- [`agentic-guidelines/UI-aestethics.md`](agentic-guidelines/UI-aestethics.md): dirección visual y accesibilidad.
- [`ideas-and-designs/`](ideas-and-designs/): referencias visuales para diseño y maquetación.
