# Documentación de Grumphya

`/doc` reúne guías para personas que desarrollan, revisan o mantienen Grumphya. Elige una ruta de lectura según lo que necesites hacer; no hace falta leer todos los documentos.

## Empezar por una tarea

### Usar la aplicación y entender sus funciones

- [Límites de uso anónimo](anonymous-usage.md): cuotas, reintentos y retención de datos.
- [Alta, perfil, contratación simulada y avatar](user-profile.md): selección de plan, verificación del correo y funciones de la cuenta.
- [Bloqueo de envíos hasta verificar el correo](email-verification-gate.md): contrato de API, diálogo y límites de identidad por navegador.
- [Recuperación de contraseña](password-reset.md): solicitar y completar el restablecimiento.
- [Ideas aprobadas privadas](approved-ideas.md): qué se guarda en el perfil y quién puede verlo.
- [Baja física de cuenta](user-delete.md): datos que elimina la baja y límites de esa eliminación.
- [Páginas de error](error-pages.md): estados y comportamiento de la interfaz.

### Preparar el entorno y desarrollar

- [Desarrollo local](development.md): requisitos, configuración y comandos habituales.
- [Stack instalado](stack.md): versiones fijadas y decisiones de actualización.
- [Dirección e implementación de la UI](ui.md): decisiones visuales vigentes y referencias de diseño.
- [Evaluación de IA, seguridad y observabilidad](ai-evaluation-and-observability.md): benchmark y métricas operativas.
- [Línea base de calidad y cobertura](quality-baseline.md): mediciones de calidad registradas.
- [Complejidad ciclomática](cyclomatic-complexity-plan.md): línea base actual, focos de riesgo y plan de refactorización.
- [Verificación de infraestructura](verification.md): comprobaciones de una sesión fechada; es un registro histórico, no el resultado más reciente garantizado.

### Administrar y operar

- [Panel de administración](admin-dashboard.md): acceso, métricas, límites y datos mostrados.
- [Producción en un VPS](production.md): preparación y despliegue manual.
- [Credenciales y secretos](credentials.md): configuración disponible y manejo seguro de secretos.
- [CI/CD y seguridad de la imagen](ci-cd.md): flujos automatizados y controles de publicación.
- [SonarQube Community Build privado](sonarqube.md): operación, Quality Gate y análisis local bajo demanda o antes de publicar `main`.
- [Enlace a desarrolloseguro.org](desarrolloseguro.org.md): integración con el proyecto y dominio independientes.
- [Caddy compartido con Desarrollo Seguro](shared-caddy-integration.md): instalación, validación y reversión de los sitios adicionales y su red.

### Revisar privacidad y seguridad

- [Evaluación de privacidad](privacy-policy-assessment.md): evidencia técnica, decisiones del responsable y asuntos pendientes de revisión.
- [Seguridad del registro y similitud](security-and-similarity-roadmap.md): estado implementado y trabajo pendiente, separados explícitamente.
- [Límites de uso anónimo](anonymous-usage.md): datos asociados a las cuotas y sus periodos de retención.
- [Baja física de cuenta](user-delete.md): alcance de la eliminación de datos de una cuenta.

## Registros y experimentos fechados

Estos documentos describen incidentes o pruebas concretas. Sus resultados sirven como antecedente; no deben leerse como el estado actual del sistema sin contrastarlos con las guías operativas y el código vigente.

- [Incidencia de acceso al VPS y despliegue, octubre de 2026](incident-vps-access-and-deployment-2026-10.md).
- [Fallos de CI, 29 de octubre de 2026](ci-failures-2026-10-29.md).
- [Experimento local con Qwen 3 4B](experiments/local-qwen3-4b.md).

## Cómo interpretar y mantener esta documentación

- Las guías de funciones y operación describen el comportamiento que debe contrastarse con el código actual. Ante una discrepancia, el código y las migraciones vigentes determinan qué hace la aplicación; actualiza la guía correspondiente cuando confirmes el cambio.
- [Stack](stack.md) y los archivos de configuración del proyecto son la referencia para versiones y requisitos. Los números de una verificación fechada son observaciones de esa sesión.
- La política que se presenta a las personas usuarias se mantiene en el código de la aplicación: [Política de privacidad](../apps/web/src/features/register-with-plan/privacy-policy.tsx). La evaluación en `/doc` aporta contexto técnico y cuestiones pendientes; no sustituye el aviso ni una revisión jurídica.
- Los documentos que contienen “plan”, “roadmap”, “evaluación” o “pendiente” pueden incluir trabajo futuro. Comprueba sus etiquetas antes de asumir que algo está implementado o desplegado.
- Las decisiones visuales e instrucciones internas para agentes están en [`agentic-guidelines/`](../agentic-guidelines/). Esa carpeta complementa estas guías, pero está dirigida principalmente al agente de desarrollo.

## Seguridad de la documentación

No guardes contraseñas, tokens, claves privadas ni secretos de proveedores en `/doc` o en Git. Para preparar secretos de producción, sigue [Producción](production.md); no hay un gestor de secretos integrado.
