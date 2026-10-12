# Describes naming & functionality guides to develope features referenced on sections.md

## getUserIdea

This only captures the text content from `IdeaInput`. It can be added by the user in three ways:

- pasting text from clipboard,
- writing with device's keyboard
- using device's microphone. In this case we have to call transcriptUserIdea

La Home may show a brief, temporary client-side synthesis beside the mascot while the idea is being written. This preview is presentation only: it is not evaluated, sent, or persisted.

## transcriptUserIdea

Forma parte de la primera entrega. Solicita permiso de micrófono, transcribe temporalmente y vuelca el texto en `IdeaInput` para revisión antes del envío. Si falla o se deniega el permiso, conserva el texto existente y permite escribir. No se persiste el audio.

- El contenedor `TranscriptUserIdea` vive en `features/transcript-user-idea/`; el adaptador `shared/utils/speech-to-text.ts` es compartido porque la transcripción de roast también lo utilizará.
- La transcripción se concatena al texto editable, respetando el límite de 2.000 caracteres. No se envía ni se persiste desde este flujo.
- Se usa reconocimiento del navegador en `es-ES` (`SpeechRecognition` o `webkitSpeechRecognition`). El audio se entrega al servicio de voz que implemente el navegador; la aplicación no lo recibe ni lo almacena. Hay que informar este comportamiento y dejar disponible la escritura manual.
- Los errores se reducen a categorías seguras (`unsupported`, `permission-denied`, `no-speech`, `failed`); no se muestran mensajes crudos del navegador.

## getIdeaListWorstAll

Returns `IdeaListItemWorstAll` entries for rejected ideas received in the current ISO week in `Europe/Madrid`, ordered by the lowest score from rubric v1. The public response contains only title and weekly reception count, never author or original text.

## getIdeaListWorstUser

Returns private `IdeaListItemWorstUser` entries from the authenticated user's submissions. Anonymous visitors have no personal idea history.

## searchSimilarRecordedIdea

Feature independiente y previa a `evaluationProcess`: compara semánticamente la idea entrante mediante RAG, sin consultar evaluaciones, puntuaciones, veredictos ni otros datos derivados de una evaluación. Su contrato de coincidencia —incluido si informa, detiene o deja continuar el flujo— se definirá al desarrollar esa feature.

## evaluationProcess

La especificación funcional, el contrato, la rúbrica y el plan TDD de esta feature están en [scoring-viability-software.md](./scoring-viability-software.md). Ese documento sustituye las instrucciones anteriores de `evaluationProcess` de este archivo.

## showEvaluationResults

Para el primer corte de `evaluationProcess`, presenta el score conceptual global (0–10, dos decimales) y una sola frase explicativa. `soft` y `hard` conservan los controles actuales: `soft` usa redacción normal y `hard` añade el prefijo borde; el tono no cambia evaluación ni score. La fórmula del score en resultados sin rechazo está pendiente en `scoring-viability-software.md`.

## registerWithPlan

En la primera entrega solo se crean cuentas seleccionando Iluminado o Faltón. El servidor crea la cuenta, registra una contratación **simulada** y activa el plan cuando la confirmación simulada tiene éxito. No se piden datos bancarios ni se cobra dinero. La activación es idempotente y los permisos se consultan en servidor por vigencia del plan, no por un valor editable del cliente. Una activación fallida no concede usos.

## submitRoast

La versión básica acepta tres envíos por sesión anónima o, con plan Faltón activo, once al día. Valida la entrada, reserva un uso, obtiene una respuesta y confirma el uso únicamente cuando hay respuesta válida. Si falla, libera la reserva. No crea historial personal anónimo. Las tarjetas y el ranking de roasts quedan para la entrega a corto plazo.

## publicRankings

«Humanos notables» muestra alias y número de **ideas distintas aprobadas** (`promising`), sin datos de esas ideas. «Worst Ideas» muestra solo título breve y cantidad de recepciones semanales de ideas rechazadas (`reject`), sin usuario ni texto original. El título público debe ser una síntesis genérica: se excluyen nombres propios, datos personales, citas literales y detalles singulares que puedan identificar al autor. Si no puede generarse un título seguro, esa idea no entra en el ranking.

## evaluateIdea

Caso de uso principal del MVP.

- Entrada: `ideaText`, `tone` (`soft` o `hard`) y contexto de usuario.
- Valida longitud, contenido y disponibilidad de intentos.
- Ejecuta la feature independiente `searchSimilarRecordedIdea` antes de `evaluationProcess`; esta detección no lee datos de evaluación.
- La política del flujo al obtener una coincidencia queda pendiente de definir en la especificación de esa feature; no se reutiliza una evaluación desde la detección semántica.
- Cuando corresponda evaluar, ejecuta `evaluationProcess`. Persistencia e intentos pertenecen a capas/orquestación posteriores, no a `evaluationProcess`.
- Salida del primer corte: estado, score conceptual según la política definida y una frase; contrato detallado en `scoring-viability-software.md`.
- Errores: entrada vacía, contenido no evaluable, límite agotado, proveedor de IA no disponible.

## Reglas de implementación

La captura de texto pertenece a `idea-input`; la evaluación pertenece a `idea-evaluation`. Ningún componente de interfaz decide puntuaciones, permisos o consumo de intentos.

## Criterios de aceptación

- Con la misma salida estructurada del evaluador y la misma versión de rúbrica, el score y el veredicto son deterministas.
- La disponibilidad se comprueba en servidor; un intento se reserva de forma atómica y solo se confirma con resultado válido. Los errores liberan la reserva. Un identificador de petición idempotente evita cobros dobles por reintentos de red.
- Una idea repetida incrementa su contador sin duplicar innecesariamente la evaluación.
- La respuesta diferencia datos, riesgos, supuestos y recomendaciones.
- En una sesión anónima no se crea historial personal. En una cuenta registrada, cada envío válido aparece en su historial, también si reutiliza una evaluación.
- Tests de borde v1: score `39/40/69/70`, dos criterios desconocidos, similitud `0,90` frente a un valor mayor, doble clic/reintento idempotente y reinicio del contador en medianoche de `Europe/Madrid`.
