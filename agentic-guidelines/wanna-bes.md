# Wanna-bes

Este archivo reúne mejoras y asuntos pendientes de valorar e incorporar a un roadmap. Una entrada aquí no significa que esté aprobada ni planificada: conserva el contexto para priorizarla más adelante.

## Rate limits compartidos entre procesos

**Estado:** pendiente de priorización e incorporación al roadmap.

Los límites por minuto de la API guardan sus contadores en memoria por proceso. Hoy esto incluye el límite general de 120 solicitudes por IP/minuto y el límite de 10 solicitudes por IP/minuto para evaluación y roast. Al ejecutar varias réplicas, cada una aplica su propio contador; si el balanceador distribuye las peticiones, el límite efectivo puede multiplicarse. Al reiniciar un proceso, sus contadores se pierden.

El límite secundario de creación de perfiles anónimos —20 por IP en 24 horas— sí se persiste en PostgreSQL y no comparte esta limitación.

**Mejora a valorar:** mover los contadores por minuto a un almacén compartido, como Redis, o a un gateway que aplique el límite antes de distribuir las solicitudes. Definir la estrategia al preparar el despliegue con varias réplicas y comprobar límites simultáneos y recuperación ante reinicios.
