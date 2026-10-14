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

Contrato previsto para el ranking público, no implementado aún: devolverá `IdeaListItemWorstAll` para ideas rechazadas de la semana ISO actual en `Europe/Madrid`, ordenadas por el menor score de la rúbrica v1. La respuesta pública incluirá solo título y cantidad semanal, nunca autor ni texto original.

## getIdeaListWorstUser

Contrato previsto para historial privado, no implementado aún: devolverá `IdeaListItemWorstUser` del usuario autenticado. Los visitantes anónimos no tienen historial personal.

## searchSimilarIdea

`searchSimilarIdea` crea con OpenAI una firma semántica neutral y efímera de la idea y la convierte con `text-embedding-3-small` (1536 dimensiones) en un vector. Pgvector recupera hasta 20 candidatas rechazadas más cercanas, sin un umbral coseno fijo. `gpt-5.4-mini` compara la idea original y la firma con los títulos seguros y solo confirma coincidencia cuando coinciden finalidad y público/objeto (`sameIdea: true`). El vector selecciona candidatas; el comparador decide equivalencia. Las firmas no se guardan y las llamadas a Responses usan `store: false`. Busca solo ideas rechazadas y no consulta ni reutiliza evaluaciones, puntuaciones ni veredictos previos. Por diseño, una idea aprobada no se agrega al corpus y no puede activar el aviso de repetición en un envío posterior; primero debe haber sido rechazada y persistida.

Al encontrar coincidencia, `updateWorstIdea` incrementa el contador agregado de esa idea inmediatamente, aunque la persona no continúe, y la UI muestra el título seguro, el contador total actualizado y una frase valorativa acorde al tono seleccionado. El envío lógico se cuenta una sola vez: si la persona continúa y la evaluación vuelve a rechazar la idea, no se incrementa otra vez. La continuación reutiliza la clave de idempotencia original, válida durante 24 horas, y el servidor permite una sola continuación. La UI ofrece una acción explícita para evaluar igualmente. Hasta implementar cuotas autoritativas, no debe afirmar que la continuación descuenta un intento disponible.

**Pendiente:** la API todavía no implementa cuotas ni intentos restantes. Por tanto, no se debe afirmar que la evaluación adicional se descuenta de un límite de 3 usos anónimos o 11 usos diarios del plan Iluminado hasta implementar contadores autoritativos, reserva y confirmación de uso en servidor.

Sin coincidencia, se ejecuta `evaluationProcess`. Si el veredicto final es `RECHAZADA`, la respuesta estructurada incluye `safeTitle`; un verificador independiente lo valida antes de que la orquestación invoque `addToWorstIdeas` para añadir título, embedding y contador inicial `1`. Si el verificador falla, no se guarda ni publica la idea. Otros veredictos no se añaden al índice. La ruta de escritura no persiste el texto original.

La búsqueda incrementa el contador al detectar match, incluso si no se continúa; la operación es idempotente por petición lógica durante 24 horas. Título, embedding y contador caducan a los 24 meses de la última recepción; las consultas ya excluyen filas caducadas, pero falta automatizar la eliminación física. La clave OpenAI se configura en `OPENAI_API_KEY` y nunca se incluye en Git. El aviso muestra el título seguro y el total actualizado. El diseño y las limitaciones están en [plan de seguridad y similitud](../doc/security-and-similarity-roadmap.md).

## evaluationProcess

La especificación funcional, el contrato, la rúbrica y el plan TDD de esta feature están en [scoring-viability-software.md](./scoring-viability-software.md). Ese documento sustituye las instrucciones anteriores de `evaluationProcess` de este archivo.

## showEvaluationResults

Presenta score conceptual global (0–10, dos decimales), un titular propio de Grumphya y una explicación concreta que reúna los aspectos mediocres evaluados y el defecto decisivo. El titular cambia entre `soft` y `hard`; para un rechazo en tono `hard`, la explicación usa una plantilla directa construida con la acción absurda y su consecuencia, mientras `soft` conserva el mensaje sencillo y neutral. El modelo no recibe el tono: este no cambia la evaluación ni el score. La interfaz no presenta el defecto como «bloqueo». Sin fallo estructural evidente, el score es la media de criterios puntuados dividida entre 10; insuficiente devuelve `null`. El contrato completo está en `scoring-viability-software.md`.

## registerWithPlan

Feature `features/register-with-plan/`, con contenedor `RegisterWithPlan`. Solo se crea una cuenta al elegir Iluminado o Faltón; el uso anónimo gratuito no requiere registro.

### Flujo y contrato

1. En precios, elegir un plan envía `POST /api/registration-intents` con el código de plan. El servidor valida que sea contratable, crea una intención opaca, de un solo uso y corta duración (15 minutos), y la vincula a una cookie `HttpOnly`, `Secure` en producción, `SameSite=Strict` y `Path=/api`. La URL posterior es `/crear-cuenta` y no contiene plan, token ni datos de contratación. El plan se recupera exclusivamente de la intención guardada en servidor. La intención caducada, consumida o ausente obliga a volver a precios.
2. La creación de intención y el alta son operaciones mutables: validar `Origin` contra el origen esperado, exigir JSON y aplicar protección CSRF apropiada además de `SameSite`; no confiar solo en la cookie. El identificador de cookie debe ser aleatorio, no contener datos y almacenarse como hash cuando se persista. No aceptar del navegador precio, vigencia, permisos ni estado de pago.
3. `POST /api/registrations` envía `email`, `username`, `password` y `privacyPolicyAcknowledged: true`. El servidor vuelve a validar todo, comprueba la intención, normaliza email/alias, comprueba unicidad y crea una cuenta pendiente dentro de una transacción. Guarda únicamente un hash de contraseña con `scrypt` parametrizado. El servidor registra la versión y fecha/hora de la política que presentó y que el usuario confirmó; el booleano del cliente no es consentimiento genérico ni sustituye la base jurídica del tratamiento. El correo y el alias no se devuelven en logs.
4. El alta pendiente no inicia sesión, no activa plan, no concede permisos ni devuelve un DTO de cuenta activa. El sistema emite una verificación de email de un solo uso, con token aleatorio de alta entropía, almacenamiento solo de hash, caducidad de 24 horas y consumo atómico. El enlace no debe filtrar el token a terceros; tras validarlo, retirar el token de la URL y evitar recursos de terceros en esa vista.
5. **Modo local de pruebas:** no se envía un correo real. El adaptador guarda el enlace de verificación en memoria y marca `fernandezpastoreduardo@gmail.com` como destino QA previsto; la interfaz ofrece abrir ese enlace localmente e indica que no se ha enviado email. No se afirma que el correo introducido haya recibido un mensaje ni que el usuario controle esa dirección. En producción el modo simulado falla durante el arranque; allí se necesita un proveedor real que entregue al email validado.
6. Tras verificar el email, una cookie/enlace de confirmación de un solo uso permite confirmar la contratación simulada durante 15 minutos. La API activa la suscripción y guarda hashes de sesión en una única transacción; después entrega la cookie de refresh. No hay dinero real ni datos bancarios. Un token consumido no se puede reutilizar: si se pierde la respuesta de confirmación, el cliente no obtiene otra sesión y necesita un flujo de acceso o soporte, que aún no está implementado. Los permisos deben consultarse en servidor a partir de suscripción vigente.

### Validación, privacidad y abuso

- Email: máximo 254 caracteres; quitar espacios exteriores, normalizar dominio y comparar toda la dirección sin distinción de mayúsculas. No eliminar puntos ni sufijos particulares de proveedores. Validar sintaxis en servidor y cliente. La sintaxis inválida puede responder con el mensaje: «Venga ya, ese correo no es de verdad, escribe bien anda.»
- Alias: entre 3 y 30 caracteres; permitir letras/números Unicode y `_`, `.` o `-` solo entre caracteres alfanuméricos. Quitar espacios exteriores, normalizar Unicode NFC y aplicar unicidad sin distinción de mayúsculas con una regla estable. Rechazar controles y caracteres invisibles engañosos. Mantener por separado el alias normalizado y el de presentación.
- **Especificación objetivo:** contraseña de 12–128 caracteres, al menos una mayúscula, una minúscula, un número y un carácter especial; no recortar ni normalizar silenciosamente y rechazar controles. El backend actual solo valida longitud y caracteres de control; la complejidad indicada aún no está implementada. El MVP usa `scrypt` (`N=32768`, `r=8`, `p=1`, sal aleatoria de 16 bytes y clave derivada de 64 bytes); nunca almacenar o registrar el valor original. Revisar parámetros y algoritmo antes de escalar o cambiar el modelo de amenazas.
- Si email o alias ya existen, devolver exactamente el mismo estado HTTP, `code` y cuerpo genérico en ambos casos; por ejemplo: «No se ha podido completar el alta con esos datos. Revísalos o inicia sesión si ya tienes cuenta.» No distinguir cuál campo coincide. Evitar diferencias temporales evidentes y limitar intentos para reducir enumeración automatizada.
- La casilla empieza desmarcada y es obligatoria. El texto «He leído la política de privacidad» enlaza claramente a `/politica-de-privacidad`. Sin marca, el formulario no se envía y la API también rechaza la petición con un error claro y accesible. La página provisional solo identifica el título y el carácter pendiente de completar; no presentar el alta a usuarios reales hasta publicar la información legal necesaria.
- **Implementado en API:** middleware por IP/proceso y ventana de un minuto limita la API general a 120 solicitudes, creación de intención a 20, alta a 8 y verificación/confirmación/refresh a 10; los endpoints de evaluación tienen además su límite propio. Al superar el límite responde `429` y `Retry-After`. El parser JSON limita el cuerpo a 8 KB. La UX específica de `429` debe verificarse con las pruebas integradas. Los límites no son configurables, se reinician con el proceso y no se comparten entre réplicas; antes de producción multiinstancia deben trasladarse a almacenamiento compartido o gateway. No hay baneos por IP ni detección de automatización.
- **Sanitización/validación:** email y alias se normalizan/validan en el servicio del backend; la API recibe datos como `unknown` y valida su forma. Las rutas actuales no contienen parámetros sensibles de registro. Mantener validación por lista permitida y límites de tamaño para cualquier parámetro de ruta/query futuro; codificar al presentar texto y nunca interpolar entrada en HTML/SQL/URLs. Sanitizar no sustituye validación contextual ni consultas parametrizadas.
- **Doble envío:** una referencia bloquea sincrónicamente los submits tras el primer envío válido, el botón se deshabilita durante la petición y el estado pendiente bloquea nuevos envíos tras aceptación. Confirmar en pruebas que un fallo de red permite recuperar el flujo sin duplicar el alta.
- No registrar contraseñas, tokens, emails completos, alias, contenido de ideas ni enlaces de verificación. Usar logs de evento con códigos de error y métricas agregadas.

### TDD y criterios de aceptación

- Red primero: plan ausente/no permitido, intención caducada/reutilizada, CSRF/origen inválido, sintaxis de email inválida, política no marcada, límites de campos y contraseña inválida; añadir casos de mayúscula/minúscula/número/especial, `429` y doble submit al implementar la especificación objetivo.
- Con concurrencia, dos altas con la misma identidad producen como máximo una cuenta por las restricciones únicas de base de datos. Email duplicado y alias duplicado producen la misma respuesta HTTP/código/cuerpo; comprobar que las respuestas no revelan qué campo ya existe.
- El hash de contraseña es verificable con el algoritmo configurado; el valor original y los tokens no aparecen en base de datos ni logs. La intención y la verificación son de un solo uso y caducan según servidor.
- Antes de verificar: no hay sesión, suscripción activa ni permiso. Después de verificar pero antes de confirmar la simulación: tampoco hay suscripción/permisos. Una confirmación simulada exitosa activa el plan y emite sesión atómicamente. La activación no se duplica, pero un reintento con el token consumido no recupera la respuesta ni crea otra sesión; el MVP carece de login/recuperación.
- En local, no se envía correo: el enlace queda disponible mediante la vista de pruebas local, se muestra aviso inequívoco y no se expone a solicitudes remotas; configuración de producción con adaptador simulado se rechaza. Un email sintácticamente válido no se describe como verificado antes de consumir el token.
- Prueba E2E aislada: seleccionar plan → URL limpia → alta pendiente → error accesible de política → verificación → confirmación simulada → éxito y sesión; cubrir errores/caducidad, duplicados, repetición y que ningún fallo conceda permisos.

## submitRoast

La versión básica acepta tres envíos por sesión anónima o, con plan Faltón activo, once al día. Valida la entrada, reserva un uso, obtiene una respuesta y confirma el uso únicamente cuando hay respuesta válida. Si falla, libera la reserva. No crea historial personal anónimo. Las tarjetas y el ranking de roasts quedan para la entrega a corto plazo.

## publicRankings

«Humanos notables» muestra alias y número de **ideas distintas aprobadas** (`promising`), sin datos de esas ideas. «Worst Ideas» muestra solo título breve y cantidad de recepciones semanales de ideas rechazadas (`reject`), sin usuario ni texto original. El título público debe ser una síntesis genérica: se excluyen nombres propios, datos personales, citas literales y detalles singulares que puedan identificar al autor. Si no puede generarse un título seguro, esa idea no entra en el ranking.

## evaluateIdea

Caso de uso principal del MVP.

- Entrada: `ideaText`, `tone` (`soft` o `hard`) y contexto de usuario.
- Valida longitud y tono en servidor. La disponibilidad de intentos aún no se comprueba porque las cuotas de negocio no están implementadas.
- `IdeaSubmissionService` orquesta `searchSimilarIdea` antes de `evaluationProcess`; esta detección no lee datos de evaluación. Al coincidir, `updateWorstIdea` registra la recepción y la UI ofrece una acción explícita para continuar. Sin coincidencia, ejecuta `evaluationProcess`.
- Tras un rechazo nuevo, invoca `addToWorstIdeas`; el embedding y el título seguro se guardan sin el texto original. Ninguna idea aprobada se incorpora al ranking.
- La evaluación, persistencia e idempotencia de la recepción están conectadas en la API; los permisos y cuotas de uso todavía no. El evaluador real requiere configuración explícita.
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
