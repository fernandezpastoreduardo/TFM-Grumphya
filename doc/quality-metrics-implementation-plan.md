# Plan de métricas de calidad

## Estado de ejecución — 9 de noviembre de 2026

- **Privacidad:** revisión completada. No se incorporan métricas de resultados de ideas reales ni nuevos eventos de producto, porque podrían ampliar la finalidad o permitir inferencias en grupos pequeños. La configuración efectiva de logs y copias del alojamiento aún debe comprobarse en producción.
- **Contratos y telemetría:** implementados. La analítica de páginas rechaza claves no permitidas; la telemetría de IA limita etiquetas a valores seguros y elimina el identificador por operación.
- **Calidad de IA:** las pruebas existentes sobre casos sintéticos corren en CI. El benchmark comparativo contra el proveedor sigue siendo manual y puede generar coste.
- **Rendimiento:** implementada una línea base Lighthouse de laboratorio para tres rutas, escritorio y móvil, en CI. Los umbrales iniciales solo avisan. Los informes completos solo viven durante el job; Actions no los conserva ni sube artefactos.
- **Consulta desde el panel:** implementada la pestaña admin **Calidad web**, la ingesta CI→API autenticada y la retención de 90 días. Tras configurar `LIGHTHOUSE_INGEST_URL`, `LIGHTHOUSE_INGEST_TOKEN` y el secreto coincidente `QUALITY_METRICS_INGEST_TOKEN` en `grumphya_env`, un job posterior al despliegue de un `workflow_dispatch` autorizado en `main` envía seis resúmenes sintéticos (tres páginas × móvil/escritorio); Jappy consulta la última medición por combinación en `/panel-control`. Solo se conserva el resumen allowlisted en la base de datos.
- **Pendiente operativo:** revisar rotación, acceso y retención reales de logs de proxy/hosting, comprobar purgas en producción y ajustar umbrales tras observar variación de CI.

## Objetivo y límites

Ampliar la medición de calidad de Grumphya sin contratar servicios, añadir cookies o tecnologías de seguimiento, ni ampliar la finalidad de privacidad ya descrita. Las métricas servirán para detectar regresiones técnicas, mejorar el rendimiento y vigilar la consistencia de la evaluación de IA.

El plan parte del estado del repositorio revisado el 9 de noviembre de 2026. Ya existen medición agregada de páginas públicas y selecciones de planes, telemetría de operaciones de IA, métricas de seguridad y panel de administración. La versión 6 de la política de privacidad mantiene la información sobre contadores agregados de páginas públicas y añade los controles antiabuso con HMAC seudonimizado.

### Salvaguardas obligatorias

- No crear ni persistir identificadores de visitante, huellas de navegador, identificadores de sesión para analítica ni relaciones entre eventos.
- No medir personas únicas, retención individual, recorridos entre sesiones ni conversión atribuida a una persona.
- No añadir cookies, localStorage, fingerprinting, píxeles, SDKs de analítica, recursos de terceros ni etiquetas publicitarias.
- No almacenar IP, dirección de red, texto de idea/roast, contenido de prompts, email, alias, `userId`, identificadores de sesión o tokens en métricas de calidad.
- No añadir eventos libres del cliente. Usar nombres de evento, páginas, operaciones y resultados de listas cerradas validadas en servidor.
- Mantener datos agregados y plazos de retención acotados. Aplicar umbrales de agrupación antes de mostrar desgloses pequeños.
- Si una métrica no cabe en la finalidad y el tratamiento ya descritos, excluirla del alcance en vez de ampliar la política para acomodarla.

Los registros técnicos de acceso del proxy o del proveedor de alojamiento pueden contener direcciones IP independientemente de las métricas de la aplicación. En la ejecución se verificará su configuración y retención; esos registros no se reutilizarán para analítica.

## Inventario actual relevante

| Área                        | Estado actual                                                                                                                                                 | Reutilización prevista                                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Analítica propia de páginas | `anonymous_analytics_daily` agrega página, evento, dispositivo y plan; no guarda identificadores de visita. El cliente envía `page_view` y selección de plan. | Ampliar solo con métricas agregadas necesarias y dimensiones cerradas; preservar el esquema privado por defecto.                        |
| Operaciones de IA           | `ai_operation` registra operación, modelo, resultado, duración, tokens disponibles y coste estimado sin texto o identidad.                                    | Añadir solo códigos de fallo/resultados necesarios, sin contexto ni correlación de sesiones.                                            |
| Calidad de evaluador        | Corpus sintético y `benchmark:evaluator`; ejecutar el benchmark contra proveedor requiere `OPENAI_API_KEY` y puede generar coste.                             | Mantener las pruebas deterministas en CI; las llamadas comparativas al modelo quedan manuales y fuera de la ruta gratuita automatizada. |
| Seguridad y salud           | Controles agregados de login y endpoint de health existentes.                                                                                                 | Reutilizar los existentes; no convertir señales antiabuso de IP en métricas analíticas.                                                 |
| Rendimiento web             | No se encontró una medición RUM propia.                                                                                                                       | Usar pruebas de laboratorio en CI y herramientas locales gratuitas; no introducir instrumentación en producción.                        |

## Métricas incluidas

### Calidad funcional y de IA

- Resultados del corpus sintético: acuerdo con etiquetas, consistencia entre ejecuciones/variantes y casos que fallan. El informe conserva únicamente cifras, identificadores de caso sintético y versiones de rúbrica/prompt.
- Regresión determinista de reglas, límites de uso, sanitización y accesibilidad mediante la suite existente.
- Telemetría operacional existente de IA: resultado, duración, tokens disponibles y coste estimado con operación/modelo/códigos de fallo de listas permitidas y sin identificador por operación.

Se excluyen los conteos de resultados de ideas reales, aunque fueran agregados: podrían revelar actividad o resultados de ideas en grupos pequeños y ampliar la finalidad actualmente descrita. No se añade un historial de resultados por cuenta ni un ratio de validez de respuestas reales.

### Salud y operación

- Reutilizar los errores HTTP 5xx agregados y los códigos de diagnóstico seguro ya presentes en el panel, sin añadir filas de métricas por petición.
- Disponibilidad de API y base de datos mediante healthchecks existentes y resultados de CI/despliegue.
- Operaciones de IA: resultado, duración, tokens y coste estimado según la telemetría actual, sin identificador por operación.
- Retención, fallos de purga y disponibilidad de tareas programadas se revisan operativamente; no se persiste una nueva traza o fila por ejecución.

No añadir histogramas de latencia HTTP por petición, bodies, query strings, cabeceras de autenticación, IP, texto de idea, prompt, salida del modelo o identificadores de petición. Los percentiles y presupuestos web se obtienen de pruebas sintéticas.

### Producto agregado

- Mantener vistas por página/día, selección de plan/día o mes y clase de dispositivo que ya están implementadas.
- No añadir nuevos contadores de solicitudes, finalización, resultado de ideas o actividad autenticada en esta entrega.
- No calcular embudos usuario a usuario, visitantes únicos, sesiones, cohortes, atribución de compra, navegación autenticada ni repetición individual.

### Rendimiento y accesibilidad

- Lighthouse en entorno de laboratorio para rutas clave: rendimiento, accesibilidad, buenas prácticas y SEO.
- Presupuestos de regresión para LCP, CLS, INP cuando sea medible en laboratorio, tamaño de bundle y peso de recursos críticos.
- Pruebas de teclado, formularios, nombres accesibles y contraste con las herramientas gratuitas ya compatibles con el stack.
- Pruebas sintéticas en escritorio y móvil; registrar en CI solo resultado, ruta, commit y valores técnicos. Sin enviar datos del navegador de visitantes.

Los resultados de laboratorio no representan la experiencia real de toda la población usuaria. Esa limitación se mostrará en el panel/reporte.

## Fases de implementación

### Fase 0 — Congelar contrato de privacidad y diccionario de métricas

1. Confirmar el inventario de datos persistidos, el esquema de `anonymous_analytics_daily`, el panel admin, telemetría stdout, logs de Caddy/hosting y tarea de retención.
2. Especificar para cada métrica: propósito, agregación, dimensiones permitidas, fuente, acceso, retención y comprobación de ausencia de identificadores.
3. Confirmar que la política versión 6 cubre la analítica propia y los controles de seguridad actuales y que las métricas nuevas caben en la finalidad descrita de calidad/seguridad/operación. Si no caben, no implementarlas dentro de este plan.
4. Verificar que las direcciones IP de infraestructura no se copian al almacén de métricas ni se reutilizan para analítica.

**Aceptación:** diccionario aprobado técnicamente; cero identificadores de navegador/sesión/usuario en las métricas nuevas; ninguna cookie o SDK nuevo; cualquier dato fuera del alcance se elimina del plan de implementación.

### Fase 1 — Fortalecer la instrumentación agregada existente

1. Revisar y validar con esquema de ejecución todas las entradas de métricas y sus dimensiones enumeradas.
2. Añadir pruebas de contrato que rechacen campos adicionales como `userId`, `sessionId`, `visitorId`, `ip`, texto libre o URL completa.
3. Asegurar que las agregaciones se realizan en el servidor y que el cliente solo puede enviar eventos permitidos.
4. Revisar topes, control de abuso, tratamiento de errores y purga de `anonymous_analytics_daily`.
5. Exponer en el panel únicamente series agregadas con mínimos de agrupación adecuados; no mostrar celdas pequeñas que faciliten inferencias.

**Aceptación:** un evento permitido solo incrementa una celda agregada; una entrada con campos de identidad o texto libre se rechaza; los tests prueban que ninguna cookie o almacenamiento local se crea para analítica.

### Fase 2 — Calidad del servicio y operaciones

1. Reutilizar el healthcheck, errores seguros y telemetría de IA ya implementados; esta fase no añade almacenamiento ni eventos de petición nuevos.
2. Limitar las etiquetas de telemetría a operaciones, modelos y códigos de fallo permitidos; omitir identificadores por llamada.
3. Usar checks de despliegue/CI para salud y rendimiento sintético; no añadir un colector SaaS ni nuevas alertas pagadas.
4. Mantener separadas las señales antiabuso por IP de cualquier métrica de calidad. No persistir IP para analítica.
5. Mantener la vista admin actual; solo corregir documentación o etiquetas si la instrumentación existente cambia.

**Aceptación:** los campos no contienen datos de petición/persona; una prueba de logs verifica ausencia de texto, IP, cookies, credenciales y tokens; fallos del colector no impiden la función principal.

### Fase 3 — Medición de calidad de evaluaciones

1. Mantener el corpus sintético versionado como benchmark reproducible.
2. Integrar en CI las comprobaciones sin proveedor: validación estructural, reglas de negocio, límites de salida, sanitización, categorías y pruebas de regresión.
3. Definir un formato de reporte sin ideas reales ni salidas crudas del modelo: fecha, commit, versiones de rúbrica/prompt, casos totales, acuerdo y fallos por caso sintético.
4. Mantener la comparación real de modelos/prompts como comando manual claramente marcado como potencialmente facturable; no ejecutarlo en PR ni en despliegue.
5. No incorporar resultados de evaluaciones reales ni informe por cuenta al panel admin. El resultado sintético puede mantenerse como artefacto CI/documentación.

**Aceptación:** la CI no necesita clave de proveedor; los reportes automatizados no contienen texto real ni respuestas crudas; comparar un modelo externo nunca se dispara automáticamente.

### Fase 4 — Rendimiento, accesibilidad y regresión visual

1. Elegir rutas principales y viewport móvil/escritorio para pruebas Lighthouse de laboratorio.
2. Establecer umbrales iniciales como informativos; recoger una línea base y después convertirlos en gates para evitar falsos positivos.
3. Añadir comprobaciones de accesibilidad automatizadas y mantener E2E visual aislado de producción.
4. Mantener los informes completos solo en el runner durante el job; no subirlos a Actions. Publicar únicamente el resumen allowlisted.
5. Documentar que Lighthouse sintético no sustituye RUM ni acredita Core Web Vitals de campo.

**Aceptación:** las mediciones se ejecutan sobre entornos sintéticos/aislados, no envían datos de usuarios, son reproducibles por commit y sus umbrales no generan ruido de red no controlable.

La consulta admin y la ingesta del resumen Lighthouse están implementadas. Para activarlas en un entorno desplegado, configura `LIGHTHOUSE_INGEST_URL` exactamente como `https://<PRODUCTION_DOMAIN>/api/internal/lighthouse-quality/ingest` y `LIGHTHOUSE_INGEST_TOKEN` en los secretos de GitHub Actions. Configura el mismo token Base64URL, de al menos 32 caracteres (se recomiendan 32 bytes aleatorios codificados en Base64URL), como `QUALITY_METRICS_INGEST_TOKEN` en `grumphya_env` de la API y despliega la migración incluida. El laboratorio entrega únicamente el resumen permitido como salida temporal del job, sin recibir el token; un job posterior al despliegue lo envía desde `workflow_dispatch` en `main` aprobado, iniciado y reejecutado por `fernandezpastoreduardo`. La vista admin `GET /api/admin/web-quality` enseña hasta seis resúmenes, uno por página/dispositivo, y la purga horaria borra datos de más de 90 días. Si falta la configuración de ingesta, el paso se omite; si su formato no es válido o el endpoint falla, emite un aviso sin fallar el despliegue. Los informes temporales no se guardan como artefactos de Actions.

### Fase 5 — Revisión, retención y operación

1. Auditar panel, stdout, base de datos, backups y logs del proxy para confirmar el flujo real de datos y retención.
2. Verificar que la purga está activa en el entorno desplegado y que el colector de logs (si existe) tiene acceso restringido y retención conocida.
3. Actualizar el diccionario y documentación operativa. Actualizar la política solo si una revisión concluye que el tratamiento excede lo actualmente informado; en ese caso, detener esa métrica hasta resolverlo.
4. Revisar trimestralmente utilidad, granularidad, retención y accesos; eliminar métricas que no guíen una decisión concreta.

**Aceptación:** cada métrica tiene dueño y decisión que informa; retención comprobada; ninguna métrica de analítica almacena IP o permite seguimiento individual.

## Secuencia de trabajo y uso de subagentes

Al ejecutar el plan, dividir el trabajo en pistas no conflictivas y usar subagentes para acelerar revisiones:

1. **Revisión de privacidad y datos**: inventariar esquemas/eventos/logs, comprobar que no se recogen IPs o identificadores para analítica y proponer ajustes solo a la documentación si el contrato existente los cubre.
2. **Revisión backend/observabilidad**: instrumentación agregada, límites, retención, contratos y pruebas de privacidad en API.
3. **Revisión frontend/calidad**: Lighthouse de laboratorio, accesibilidad, presupuestos de rendimiento y reporte de CI.
4. **Integración principal**: coordinar interfaces, resolver conflictos, verificar arquitectura por alcance (local si una sola feature; shared si 2+), ejecutar lint/tests y revisar que la CI no necesita secretos de IA.

Las pistas pueden avanzar en paralelo tras acordar el diccionario de métricas; cambios compartidos en migraciones, panel admin o política deben tener un único responsable de integración para evitar conflictos.

## Coste y dependencias

- Sin licencias de analítica, observabilidad o dashboards.
- Reutilizar PostgreSQL, CI y panel admin que ya existen.
- Lighthouse y pruebas automatizadas pueden ejecutarse con herramientas libres en CI; no introducir proveedor RUM.
- El benchmark automatizado offline no consume API. Las comparaciones con OpenAI pueden consumir cuota y quedan bajo ejecución manual explícita.
- Costes residuales: tiempo de CI, almacenamiento de resúmenes en la base existente y operación de la infraestructura.

## Comprobaciones de cierre de cada fase

- `pnpm lint`, `pnpm test`, typecheck/build según afectación, y pruebas E2E aisladas cuando la fase toque recorridos de usuario.
- Inspección de migraciones y purga cuando se añada persistencia.
- Búsqueda de cookies, almacenamiento local, identificadores estables, IPs, texto de usuario y llamadas de terceros en la ruta de métricas.
- Confirmación de que datos de muestra no aparecen en métricas de producción.
- Revisión del diccionario y del panel para asegurar que cada indicador informa una decisión real.
