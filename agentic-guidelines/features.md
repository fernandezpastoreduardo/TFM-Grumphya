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

Presenta score conceptual global (0–10, dos decimales), un titular propio de Grumphya y una explicación concreta que reúna los aspectos mediocres evaluados y el defecto decisivo. El titular cambia entre `soft` y `hard`; tono no cambia evaluación ni score. La interfaz no presenta el defecto como «bloqueo». Sin fallo estructural evidente, el score es la media de criterios puntuados dividida entre 10; insuficiente devuelve `null`. El contrato completo está en `scoring-viability-software.md`.

## registerWithPlan

Feature `features/register-with-plan/`, con contenedor `RegisterWithPlan`. Solo se crea una cuenta al elegir Iluminado o Faltón; el uso anónimo gratuito no requiere registro.

### Flujo y contrato

1. En precios, elegir un plan envía `POST /api/registration-intents` con el código de plan. El servidor valida que sea contratable, crea una intención opaca, de un solo uso y corta duración (15 minutos), y la vincula a una cookie `HttpOnly`, `Secure` en producción, `SameSite=Strict` y `Path=/api`. La URL posterior es `/crear-cuenta` y no contiene plan, token ni datos de contratación. El plan se recupera exclusivamente de la intención guardada en servidor. La intención caducada, consumida o ausente obliga a volver a precios.
2. La creación de intención y el alta son operaciones mutables: validar `Origin` contra el origen esperado, exigir JSON y aplicar protección CSRF apropiada además de `SameSite`; no confiar solo en la cookie. El identificador de cookie debe ser aleatorio, no contener datos y almacenarse como hash cuando se persista. No aceptar del navegador precio, vigencia, permisos ni estado de pago.
3. `POST /api/registrations` envía `email`, `username`, `password` y `privacyPolicyAcknowledged: true`. El servidor vuelve a validar todo, comprueba la intención, normaliza email/alias, comprueba unicidad y crea una cuenta pendiente dentro de una transacción. Guarda únicamente un hash de contraseña con `scrypt` parametrizado. El servidor registra la versión y fecha/hora de la política que presentó y que el usuario confirmó; el booleano del cliente no es consentimiento genérico ni sustituye la base jurídica del tratamiento. El correo y el alias no se devuelven en logs.
4. El alta pendiente no inicia sesión, no activa plan, no concede permisos ni devuelve un DTO de cuenta activa. El sistema emite una verificación de email de un solo uso, con token aleatorio de alta entropía, almacenamiento solo de hash, caducidad de 24 horas y consumo atómico. El enlace no debe filtrar el token a terceros; tras validarlo, retirar el token de la URL y evitar recursos de terceros en esa vista.
5. **Modo local de pruebas:** no se envía un correo real. El adaptador guarda el enlace de verificación en memoria y marca `fernandezpastoreduardo@gmail.com` como destino QA previsto; la interfaz ofrece abrir ese enlace localmente e indica que no se ha enviado email. No se afirma que el correo introducido haya recibido un mensaje ni que el usuario controle esa dirección. En producción el modo simulado falla durante el arranque; allí se necesita un proveedor real que entregue al email validado.
6. Tras verificar el email, el usuario confirma la contratación simulada con una petición autenticada por el estado de verificación y protegida contra CSRF. El servidor determina el plan desde la intención/registro persistidos y activa la suscripción mediante operación idempotente. Solo tras confirmación exitosa puede emitir una sesión. No hay dinero real ni datos bancarios. Fallos y reintentos no duplican cuenta, contratación, suscripción ni usos. Los permisos se consultan en servidor a partir de suscripción vigente.

### Validación, privacidad y abuso

- Email: máximo 254 caracteres; quitar espacios exteriores, normalizar dominio y comparar toda la dirección sin distinción de mayúsculas. No eliminar puntos ni sufijos particulares de proveedores. Validar sintaxis en servidor y cliente. La sintaxis inválida puede responder con el mensaje: «Venga ya, ese correo no es de verdad, escribe bien anda.»
- Alias: entre 3 y 30 caracteres; permitir letras/números Unicode y `_`, `.` o `-` solo entre caracteres alfanuméricos. Quitar espacios exteriores, normalizar Unicode NFC y aplicar unicidad sin distinción de mayúsculas con una regla estable. Rechazar controles y caracteres invisibles engañosos. Mantener por separado el alias normalizado y el de presentación.
- Contraseña: entre 12 y 128 caracteres; no recortar ni normalizar silenciosamente. Rechazar caracteres de control y limitar el tamaño del cuerpo HTTP. El MVP usa `scrypt` (`N=32768`, `r=8`, `p=1`, sal aleatoria de 16 bytes y clave derivada de 64 bytes); nunca almacenar o registrar el valor original. Revisar parámetros y algoritmo antes de escalar o cambiar el modelo de amenazas.
- Si email o alias ya existen, devolver exactamente el mismo estado HTTP, `code` y cuerpo genérico en ambos casos; por ejemplo: «No se ha podido completar el alta con esos datos. Revísalos o inicia sesión si ya tienes cuenta.» No distinguir cuál campo coincide. Evitar diferencias temporales evidentes y limitar intentos para reducir enumeración automatizada.
- La casilla empieza desmarcada y es obligatoria. El texto «He leído la política de privacidad» enlaza claramente a `/politica-de-privacidad`. Sin marca, el formulario no se envía y la API también rechaza la petición con un error claro y accesible. La página provisional solo identifica el título y el carácter pendiente de completar; no presentar el alta a usuarios reales hasta publicar la información legal necesaria.
- Límite MVP aplicado en memoria por IP y ventana de un minuto: 20 intenciones, 8 altas y 10 verificaciones/confirmaciones/renovaciones; responde `429` con `Retry-After`. No es configurable, se reinicia al reiniciar el proceso y no se comparte entre réplicas: antes de producción multiinstancia, trasladar los contadores a almacenamiento compartido y configurar ventanas/cupos adecuados. La intención se borra al completar y caduca a los 15 minutos.
- No registrar contraseñas, tokens, emails completos, alias, contenido de ideas ni enlaces de verificación. Usar logs de evento con códigos de error y métricas agregadas.

### TDD y criterios de aceptación

- Red primero: plan ausente/no permitido, intención caducada/reutilizada, CSRF/origen inválido, sintaxis de email inválida, política no marcada, límites de campos y contraseña inválida.
- Con concurrencia, dos altas con la misma identidad producen como máximo una cuenta por las restricciones únicas de base de datos. Email duplicado y alias duplicado producen la misma respuesta HTTP/código/cuerpo; comprobar que las respuestas no revelan qué campo ya existe.
- El hash de contraseña es verificable con el algoritmo configurado; el valor original y los tokens no aparecen en base de datos ni logs. La intención y la verificación son de un solo uso y caducan según servidor.
- Antes de verificar: no hay sesión, suscripción activa ni permiso. Después de verificar pero antes de confirmar la simulación: tampoco hay suscripción/permisos. Solo una confirmación simulada exitosa activa el plan y permite sesión; fallo y reintentos son seguros e idempotentes.
- En local, no se envía correo: el enlace queda disponible mediante la vista de pruebas local, se muestra aviso inequívoco y no se expone a solicitudes remotas; configuración de producción con adaptador simulado se rechaza. Un email sintácticamente válido no se describe como verificado antes de consumir el token.
- Prueba E2E aislada: seleccionar plan → URL limpia → alta pendiente → error accesible de política → verificación → confirmación simulada → éxito y sesión; cubrir errores/caducidad, duplicados, repetición y que ningún fallo conceda permisos.

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
- Salida del primer corte: estado, score conceptual, titular y explicación; contrato detallado en `scoring-viability-software.md`.
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
