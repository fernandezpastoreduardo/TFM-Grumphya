# Evaluación del evaluador y seguridad de IA

- El corpus de regresión contiene únicamente casos sintéticos, etiquetados y versionados en `apps/api/evaluation/evaluator-cases.json`.
- Las variantes de modelo y prompt se ejecutan con el adaptador real y el validador de producción. Se comparan contra resultados esperados y entre sí por estado y motivo.
- Un resultado divergente requiere revisión humana antes de aceptar un cambio en la rúbrica; una puntuación alta en un corpus pequeño no demuestra calidad general.
- Las ideas son datos no confiables. Las instrucciones del evaluador permanecen en el mensaje `system`; el contenido se envía en un mensaje `user` separado. Los tests comprueban esta frontera y el cumplimiento estructural de la salida.
- Las cuotas y la propiedad de los datos se aplican en servidor. Las pruebas de rate limit y de aislamiento PostgreSQL forman parte del job de CI y usan una base temporal.
- Ninguna idea, mensaje, prompt completo, salida cruda, cookie, dirección IP o identificador de cuenta puede aparecer en telemetría operativa.

El uso, las etiquetas, la ejecución del benchmark, las métricas, sus costes estimados y sus limitaciones están descritos en [`doc/ai-evaluation-and-observability.md`](../doc/ai-evaluation-and-observability.md). La revisión de riesgo del despliegue queda en [`doc/ci-cd.md`](../doc/ci-cd.md).
