# Complejidad ciclomática: línea base y plan de mejora

Medición inicial del 7 de noviembre de 2026 sobre `f4ce50f` (`feat/containerization-ci-cd`). Es una línea base histórica para priorizar refactorizaciones, no un fallo de las puertas actuales de CI. La medición inicial se hizo antes de cambiar código de producción. Las cifras y rutas de las tablas históricas no se sustituyen por estimaciones: para el estado actual se vuelve a ejecutar `pnpm complexity:report` y se consulta [Arquitectura y revisión humana](architecture-and-code-review.md).

## Método y alcance

Se ejecutó la regla `complexity` de ESLint 10 con máximo `0` para obtener el valor de cada función, sin modificar la configuración del proyecto:

```sh
pnpm --filter @grumphya/api exec eslint src scripts --rule 'complexity: ["warn", 0]' --format json
pnpm --filter @grumphya/web exec eslint src --rule 'complexity: ["warn", 0]' --format json
```

Para la tabla se excluyeron archivos `.spec.` y `.test.`; se incluyeron funciones y callbacks de `src/` y scripts de la API. ESLint cuenta bifurcaciones y expresiones de cortocircuito, por lo que las validaciones con muchos `&&` y `||` pueden alcanzar valores altos aunque no tengan estados o efectos complejos. La cifra mide rutas dentro de una función; no mide acoplamiento, tamaño ni riesgo por sí sola. Las coberturas de ramas indicadas abajo son **del archivo**, no de la función concreta, y proceden de `pnpm --filter @grumphya/api test:coverage` y `pnpm --filter @grumphya/web test:coverage` en la misma sesión. Las pruebas PostgreSQL condicionadas sin entorno aislado no forman parte de esa cobertura local.

| Ámbito               | Funciones medidas | Complejidad > 10 |   > 15 |   > 20 |  Máximo |
| -------------------- | ----------------: | ---------------: | -----: | -----: | ------: |
| API `src/`           |               857 |               31 |     12 |      6 |     100 |
| Web `src/`           |               643 |               38 |     16 |      8 |      43 |
| Scripts de API       |                27 |                2 |      0 |      0 |      11 |
| **Total producción** |         **1.527** |           **71** | **28** | **14** | **100** |

La mediana es 2 y el percentil 90 es 7. La cobertura global de ramas de esta corrida fue 86,71 % en API y 84,75 % en web. El proyecto no configura hoy la regla `complexity` en sus archivos ESLint, de modo que `pnpm lint` puede pasar con estos valores.

## Focos examinados

| Función y ubicación                                                                                                                            | Complejidad | Ramas cubiertas en el archivo | Motivo para priorizar                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------: | ----------------------------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Callback de `createSecurityMiddleware` en [`security.middleware.ts`](../apps/api/src/security/security.middleware.ts)                          |         100 |                        94,6 % | Combina cabeceras, origen, tipo de contenido, clasificación de rutas, límites y desafío de acceso. Un cambio de orden puede debilitar controles.                       |
| `isDashboardData` en el antiguo `admin-dashboard.tsx`                                                                                          |          43 |                        93,0 % | Valida un contrato grande con una cadena booleana; su complejidad refleja en gran parte validación estructural.                                                        |
| `Roast` en [`roast.tsx`](../apps/web/src/features/roast/roast.tsx)                                                                             |          39 |                        90,6 % | Mezcla estado de cuota, ranking, diálogos y presentación.                                                                                                              |
| `Home` en [`home.tsx`](../apps/web/src/views/home.tsx)                                                                                         |          37 |                        79,2 % | Orquesta evaluación, reintentos, cuota y UI dentro de una vista de composición.                                                                                        |
| `parseSubmissionResponse` en el antiguo `evaluation-process.ts`                                                                                |          30 |                        91,7 % | Valida tres variantes del DTO y sus campos condicionales.                                                                                                              |
| `isEvaluationProcessResponse` y `checkAndSubmit` en [`idea-submission.service.ts`](../apps/api/src/idea-evaluation/idea-submission.service.ts) |     28 y 27 |                        77,2 % | La primera valida respuestas cacheadas; la segunda coordina similitud, idempotencia, reserva y liberación de cuota.                                                    |
| `submitRoast` en el antiguo `RoastInput.tsx`                                                                                                   |          27 |                        87,0 % | Medición histórica: combinaba envío, autenticación, errores, cuota y estado del formulario. El flujo actual está en `use-roast-input.ts` y el servicio del componente. |

En aquel corte, la mayor concentración de funciones por encima de 10 estaba en `idea-evaluation` de la API (11), `admin-dashboard` web (9) y `evaluation-decision.ts` de la API (9 de esas 11). La cobertura alta del middleware y del panel permitía refactorizar con una red de seguridad; la cobertura menor del envío de ideas y de `Home` pedía primero pruebas de comportamiento específicas.

Las ubicaciones de la tabla corresponden al corte medido. En el código actual,
`isDashboardData` está en `admin-dashboard.validation.dashboard.ts`,
`parseSubmissionResponse` en `evaluation.validation.ts` y `submitRoast` en
`components/use-roast-input.ts`. Los valores de complejidad y cobertura de la
tabla no describen esas implementaciones nuevas.

## Plan de la primera ronda

### 1. Registrar la métrica y proteger las rutas sensibles

- Añadir un informe reproducible de complejidad de código de producción a las verificaciones de calidad. Publicar el máximo y el número de funciones `> 10`, `> 15` y `> 20`; no aplicar de golpe un límite global que bloquee la línea base existente.
- En `security/`, caracterizar en una matriz método/ruta las cabeceras, origen, JSON o multipart, prioridad de límites, `Retry-After`, exclusión de preflight, refresh sin cookie y desafío de login. Conservar el orden de respuestas y efectos observables.
- Extraer dentro de `security/` funciones puras para clasificar la solicitud y escoger su política de límites; separar la validación de origen y contenido del contador de ventanas. Mantener `createSecurityMiddleware` como ensamblador. Objetivo: reducir su callback de 100 a **20 o menos** sin alterar los límites ni las respuestas.

### 2. Asegurar y simplificar la evaluación de ideas

- Completar las pruebas de `IdeaSubmissionService` sobre fallos entre búsqueda, actualización de coincidencia, evaluación, persistencia y confirmación de cuota; verificar liberación, reintento e idempotencia con el mismo identificador. La cobertura de ramas del archivo parte de **77,2 %**; objetivo inicial **85 %** mediante casos relevantes.
- Separar `checkAndSubmit` por etapas con nombres de negocio: caso especial, respuesta idempotente, búsqueda de coincidencia y evaluación nueva. Conservar en un solo lugar la responsabilidad de reservar, confirmar o liberar cada uso. No mover lógica de una sola función de negocio a `shared`.
- Dividir la validación de respuestas cacheadas por variante del resultado, con entrada `unknown` y comprobaciones en tiempo de ejecución. Objetivo: `checkAndSubmit` e `isEvaluationProcessResponse` en **15 o menos** cada una.

### 3. Reducir la orquestación de la interfaz

- Tras pruebas de reintento, cuotas, verificación de correo y teclado, mover el flujo de evaluación desde `Home` a un contenedor `IdeaEvaluation` en `features/idea-evaluation/idea-evaluation.tsx`; `Home` debe componer la página. El contenedor principal tendrá el nombre de su feature. Objetivo: `Home` en **15 o menos** y cobertura de ramas de `home.tsx` al menos **85 %**.
- Mantener `Roast` como contenedor de su feature. Extraer dentro de `features/roast/` el estado derivado de cuotas y el ciclo de envío de `RoastInput` a funciones o hooks con una responsabilidad comprobable; dejar la UI presentacional basada en props. Objetivo: `Roast` y `submitRoast` en **20 o menos** cada uno.

### 4. Ordenar contratos de datos extensos

- En `admin-dashboard`, partir `isDashboardData` por bloques del DTO (ingresos, costes, actividad y errores) con validadores nombrados y pruebas de campos ausentes, tipos incorrectos y límites. Mantenerlos locales a la feature mientras solo ella los use. Objetivo: ninguna función del contrato por encima de **20**.
- Aplicar el mismo criterio a `parseSubmissionResponse` y `parseEvaluationResponse` dentro de `idea-evaluation`, preservando la validación de `unknown`, títulos seguros y variantes discriminadas. Objetivo: **20 o menos** por función. No reducir la cifra eliminando comprobaciones o sustituyéndolas por aserciones de tipo.

## Criterios para cerrar cada paso

1. Registrar complejidad antes y después de las funciones tocadas; ninguna función nueva o modificada debe superar **15**, salvo excepción temporal documentada para una fase intermedia. No aumentar el total de funciones `> 20`.
2. Ejecutar `pnpm lint`, `pnpm test`, `pnpm typecheck` y las pruebas de integración pertinentes. Las suites HTTP de la API requieren permiso para abrir sockets locales; las pruebas con PostgreSQL deben usar su entorno aislado. Mantener las puertas de cobertura existentes.
3. Comprobar los contratos observables de seguridad, idempotencia, cuotas y accesibilidad antes de extraer código. Cada commit debe quedar funcional; medir tras cada extracción.
4. Aplicar la Scope Rule a cada pieza extraída: uso de una sola feature, directorio local; uso real de dos o más features, `shared`. Conservar `Roast` y `AdminDashboard` como contenedores con el nombre de su feature.

Meta de la primera ronda: bajar de **14 a 5 o menos** las funciones de producción `> 20` y dejar los flujos sensibles mencionados en los objetivos anteriores. Después, revisar las funciones que aún superen 15 (28 en la línea base) por riesgo y frecuencia de cambio, sin forzar extracciones que dificulten leer validaciones simples.

## Resultado de la primera ronda

El comando `pnpm complexity:report` reproduce la medición y forma parte de `pnpm quality:check`, la puerta de calidad de CI. Por ahora informa sin bloquear por un umbral global. Las pruebas de seguridad cubren una matriz de mutaciones de cookie con origen ajeno y comprueban que se rechazan antes de examinar el tipo de contenido. Las decisiones de colocación siguen el uso real: las políticas HTTP permanecen en `security/`, el flujo y los validadores de evaluación en `idea-evaluation/`, los componentes de conversación en `roast/` y el contrato del panel en `admin-dashboard/`.

| Métrica de producción | Inicial | Tras la primera ronda |
| --------------------- | ------: | --------------------: |
| Funciones `> 10`      |      71 |                    75 |
| Funciones `> 15`      |      28 |                    19 |
| Funciones `> 20`      |      14 |                     5 |
| Máximo                |     100 |                    27 |

El aumento de funciones `> 10` responde a la división de flujos largos en etapas nombradas; la cola de mayor riesgo disminuye. El callback de seguridad pasó de **100 a 14**; `checkAndSubmit`, de **27 a 7**; `isEvaluationProcessResponse`, de **28 a 5**; `Home`, de **37 a 9**; `Roast`, de **39 a 15**; y `submitRoast`, de **27 a 9**. `IdeaEvaluation` es ahora el contenedor del flujo y mide **4**. Los validadores `isDashboardData`, `parseSubmissionResponse` y `parseEvaluationResponse` quedaron por debajo de 15. Las validaciones de entradas `unknown` y los límites de contenido se conservaron.

La cobertura de ramas de `idea-submission.service.ts` alcanzó **90,16 %** y la de `home.tsx`, **87,5 %**. Las cinco funciones aún por encima de 20 están en `shared/accreditation-verification.ts` (27), `postgres-plan-usage.repository.ts` (24), `access-token.ts` (23), `evaluation-decision.ts` (22) y `register-with-plan.tsx` (21). Son la siguiente lista para revisar por frecuencia de cambio y riesgo; esta ronda no modificó esos flujos.

Verificación de cierre: `pnpm ci:verify quality` pasó con una base PostgreSQL temporal con `pgvector` (103 archivos y 985 pruebas de API; 55 archivos y 417 pruebas de web), incluidos formato, lint, tipos, build y comprobaciones de despliegue. `pnpm ci:verify e2e` pasó sus 56 casos en Chromium contra los servidores aislados de Playwright. El contenedor de PostgreSQL usado para esta verificación se eliminó al terminar.
