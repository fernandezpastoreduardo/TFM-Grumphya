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
- La transcripción se concatena al texto editable, respetando el límite de 800 caracteres. No se envía ni se persiste desde este flujo.
- Se usa reconocimiento del navegador en `es-ES` (`SpeechRecognition` o `webkitSpeechRecognition`). El audio se entrega al servicio de voz que implemente el navegador; la aplicación no lo recibe ni lo almacena. Hay que informar este comportamiento y dejar disponible la escritura manual.
- Los errores se reducen a categorías seguras (`unsupported`, `permission-denied`, `no-speech`, `failed`); no se muestran mensajes crudos del navegador.

## getIdeaListWorstAll

Returns `IdeaListItemWorstAll` entries for rejected ideas received in the current ISO week in `Europe/Madrid`, ordered by the lowest score from rubric v1. The public response contains only title and weekly reception count, never author or original text.

## getIdeaListWorstUser

Returns private `IdeaListItemWorstUser` entries from the authenticated user's submissions. Anonymous visitors have no personal idea history.

## searchSimilarRecordedIdea

- Entrada: idea de aplicación web o móvil previamente validada.
- Genera un embedding con la versión activa del modelo y busca en PostgreSQL/`pgvector` la idea canónica evaluada más cercana. Solo compara vectores del mismo modelo y dimensión.
- Similitud v1: `1 - distancia_coseno`, acotada a `[0, 1]`. Si el mayor valor es **estrictamente mayor que 0,90**, devuelve la idea canónica y su evaluación base; `0,90` exacto devuelve `null`.
- Si hay coincidencia, reutiliza directamente esa evaluación, incrementa una sola vez el contador de recepciones y registra la nueva presentación en el historial solo si hay usuario registrado. El tono solicitado se aplica al mostrar la misma evaluación base, sin cambiar score ni veredicto.
- Si no hay coincidencia, devuelve `null` y se ejecuta `evaluationProccess`.
- Si falla la búsqueda, devuelve error recuperable; no se trata el fallo como `null` ni se consume intento.

## evaluationProcess

Evalúa solo ideas de **aplicaciones web o móviles**. Produce una evaluación base independiente del tono. Si el texto no describe mínimamente qué hace la aplicación y para quién, devuelve `IDEA_NOT_EVALUABLE` sin consumir un intento.

### Rúbrica v1

Seis criterios reciben una nota entera de 0 a 4: `0` = muy débil o riesgo grave, `1` = débil, `2` = incierto o dato no aportado, `3` = razonable, `4` = bien fundamentado por el texto. Una nota de 2 por falta de datos debe señalarse como supuesto; no se inventan hechos de mercado.

| Criterio                             | Peso | Aspectos de una app web/móvil                                                        |
| ------------------------------------ | ---: | ------------------------------------------------------------------------------------ |
| Problema y usuario                   |   25 | Usuario objetivo, necesidad concreta, frecuencia e intensidad.                       |
| Diferenciación                       |   15 | Alternativas y ventaja propuesta.                                                    |
| Captación y adopción                 |   15 | Canal plausible para llegar al usuario y fricción de uso.                            |
| Viabilidad técnica y operativa       |   20 | Desarrollo, integraciones, mantenimiento, dependencia de IA/APIs y escalado inicial. |
| Economía                             |   15 | Costes de construcción y operación frente al posible valor o ingreso.                |
| Privacidad, seguridad y cumplimiento |   10 | Datos sensibles, permisos, abuso y obligaciones previsibles.                         |

`score = round(sum(peso * nota / 4))`, entre 0 y 100. `0–39 = reject`, `40–69 = review`, `70–100 = promising`. Si faltan datos en dos o más criterios, el veredicto máximo es `review`, aunque el score sea superior. Se mantiene el score numérico y se explican las incógnitas. Un posible daño grave o tratamiento delicado de datos genera una advertencia y recomendación de revisión humana, sin afirmar ilegalidad sin evidencia.

El proveedor de IA devuelve seis notas justificadas, riesgos, supuestos y próximos pasos. El backend valida la estructura, recalcula score y veredicto y registra `rubricVersion = v1` y versión del evaluador. Una respuesta inválida o un fallo del proveedor no guarda evaluación parcial ni consume intento. El análisis es una orientación basada en el texto aportado, no una predicción de éxito.

## showEvaluationResults

Presenta puntuación, veredicto, razones, incertidumbres y siguientes pasos. `soft` y `hard` cambian la redacción, pero nunca las notas, el score, el veredicto o los riesgos. La evaluación canónica se almacena sin tono y se presenta con el tono elegido, también cuando procede de una coincidencia reutilizada.

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
- Busca una idea semánticamente similar antes de invocar al evaluador.
- Si existe una evaluación reutilizable con similitud `> 0,90`, devuelve su resultado y registra la repetición.
- Si no existe, ejecuta `evaluationProcess`, guarda la evaluación base y actualiza el contador.
- Salida: `EvaluationResult`.
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
