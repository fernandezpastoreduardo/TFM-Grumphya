# Evaluación de IA, seguridad y observabilidad

## Banco de evaluación del evaluador

El corpus sintético versionado vive en `apps/api/evaluation/evaluator-cases.json`. Cada caso incluye una idea creada para pruebas, los estados esperados y, cuando el motivo debe ser estable, los códigos de rechazo aceptables. Incluye una idea vaga, diferenciación ausente, falta de valor de usuario en una idea que solo contabiliza una acción, contradicción económica, instrucciones maliciosas dentro de la idea, una interacción presencial de riesgo y un caso de privacidad. La instrucción del evaluador exige valorar por separado los fallos C01–C09 antes de considerar C10; la mera existencia de alternativas no es suficiente. La variedad del veredicto debe surgir de fallos reales distintos descritos por cada idea, nunca de introducir variación aleatoria ni inventar motivos para rechazar. Los titulares sí se redactan de nuevo para cada resultado y pueden variar por tono; no cambian el estado, la puntuación ni los motivos.

La media de una evaluación sin vetos determina si el resultado puede presentarse como “Sigue en pie, por ahora”: por debajo de 7/10 el estado público es `REQUIERE_REVISION`, con un mensaje que explica qué aporta la propuesta, qué limita la nota y qué conviene validar. Este estado no se guarda como idea prometedora. El umbral ordena la presentación del resultado; no representa una probabilidad de éxito.

Desde `grumphya-concept-v11`, la nota interna asignable a cada criterio va de 0 a 79. La API multiplica por `10/79` la nota del primer veto o la media de los criterios puntuados cuando no hay veto, y redondea el resultado visible a dos decimales. El umbral de 7/10 se aplica a esa nota redondeada: 55 equivale a 6,96/10 y 56 a 7,09/10. Esta conversión cambia la interpretación numérica respecto de versiones anteriores; no se recalculan los scores de rechazos ya almacenados ni se usan para ordenar los rankings.

Los cuatro casos especiales de Home no forman parte de ese benchmark LLM: una lista determinista del servidor los clasifica antes de llamar a similitud o al evaluador. Las pruebas de `special-idea-cases.spec.ts` cubren los límites léxicos; las pruebas de `idea-submission.service.spec.ts` comprueban que la respuesta se reserva, se cachea y no invoca búsqueda ni evaluación. La frase corta «Un/Una X pero con IA» es un patrón acotado, no una regla para rechazar cualquier propuesta que use IA.

Ejecuta la comparación desde la raíz con `pnpm --filter @grumphya/api benchmark:evaluator`. Requiere `OPENAI_API_KEY`; no consume cuotas de cuentas, porque el runner llama directamente al adaptador del proveedor. El modelo predeterminado es el mismo configurado por defecto para la API. Para comparar modelos y prompts, crea antes el directorio `agentic-guidelines/prompts` y guarda allí un fichero de texto no vacío con la variante que quieras probar. El nombre `modelo-a` y el fichero de este ejemplo son marcadores que debes sustituir:

```sh
pnpm --filter @grumphya/api run benchmark:evaluator -- \
  --models gpt-5.4-mini,modelo-a \
  --prompts propuesta-v8=agentic-guidelines/prompts/evaluation-v8.txt
```

Cada fichero indicado con `--prompts` contiene las instrucciones del sistema que se comparan con las instrucciones actuales; solo se admiten ficheros regulares no vacíos dentro de `agentic-guidelines/prompts`, de hasta 64 KiB. Se rechazan rutas fuera del directorio, enlaces simbólicos que escapen de él y ficheros demasiado grandes o vacíos, para evitar leer archivos locales arbitrarios y enviarlos al proveedor. El adaptador conserva las instrucciones de título seguro y fidelidad de promesa. El runner valida la respuesta con el validador de producción y presenta acuerdo con las etiquetas, acuerdo entre variantes para estado y motivo, y número de casos. Un desacuerdo esperado devuelve código de salida 1. Revisa manualmente los fallos antes de cambiar la rúbrica o el prompt: el corpus es pequeño y sus etiquetas no sustituyen una evaluación humana ni demuestran calidad general. La comparación puede generar llamadas facturables al proveedor.

El informe agregado omite ideas, explicaciones, títulos y salidas del modelo. El proveedor recibe las ideas sintéticas del corpus y los prompts indicados. No uses ideas reales de usuarios como corpus. No guardes informes crudos del proveedor.

Los límites del prompt deben coincidir con el validador de `message`: `IDEA_INSUFICIENTE` admite 8–40 palabras y 280 caracteres; `SIN_BLOQUEO_EVIDENTE`, 25–90 palabras, 700 caracteres y de dos a cuatro oraciones; `RECHAZADA`, 8–120 palabras, 900 caracteres y de una a cuatro oraciones. Dar al modelo el límite de 900 caracteres en todos los estados puede hacer que una explicación válida según el prompt supere el tope del estado correspondiente y termine como `INVALID_EVALUATION_RESPONSE` (`visible_message`). En los rechazos, `hardSetup` y `hardConsequence` son fragmentos auxiliares no visibles: una cadena con formato inválido se descarta sin invalidar una explicación válida; los campos y sus tipos siguen sujetos al contrato estructural. El esfuerzo predeterminado de razonamiento es `low` para acortar la espera; `OPENAI_REASONING_EFFORT` permite configurar `medium` o `high` si la calidad observada lo justifica.

El roast pide una pulla personalizada, mordaz y fácil de entender, en una frase de hasta 200 caracteres. Si el mensaje insulta, debe volver la pulla contra quien lo envió; si contiene un plan, una idea o una intención, debe usar un detalle concreto e inocuo para rematarlo con humor. No debe limitarse a juzgar el tono ni describir el mensaje. La respuesta sigue siendo apta para todos los públicos: sin insultos explícitos al usuario, palabrotas, ataques a terceros, amenazas ni lenguaje discriminatorio. El servidor comprueba el formato, la longitud y un conjunto de expresiones abusivas, pero no puede garantizar automáticamente la mordacidad, claridad ni pertinencia semántica del roast.

## Pruebas de seguridad de IA

- El adaptador coloca las instrucciones de evaluación en el mensaje `system` y serializa la idea en un mensaje `user` como contenido no confiable. Una prueba contractual cubre un intento de prompt injection incrustado en una idea.
- El corpus incluye casos de instrucciones maliciosas y de diseño con riesgos previsibles. El benchmark detecta cambios de resultado; no es una prueba de red team automatizada y no demuestra resistencia semántica de un modelo.
- `security.middleware.spec.ts` comprueba el rate limit de evaluación; `anonymous-usage` y `plan-usage` cubren reservas y límites de cuotas. Los límites por IP siguen siendo por proceso, así que una granja de instancias requiere un limitador compartido antes de exponerse públicamente.
- Los tests PostgreSQL de ideas, rankings y borrado crean esquemas con UUID en la base de test y los eliminan al terminar. Los tests `user-rejected-ideas.postgres.spec.ts` y `approved-ideas.postgres.spec.ts` comprueban que la historia privada de una cuenta no aparece para otra. CI configura una base PostgreSQL/pgvector desechable para ejecutar estos casos.
- Las respuestas de modelo se validan en tiempo de ejecución y se reconstruyen según el contrato público. Las credenciales, el texto de ideas, el prompt completo y la salida cruda no se escriben en logs.

## Métricas de operaciones de IA

Cada operación del adaptador de OpenAI en evaluación, embeddings, equivalencia semántica y roast emite una línea JSON `ai_operation` a stdout. Incluye operación, modelo, resultado, duración, tokens de entrada/salida disponibles y coste estimado. Operación, modelo y `failureCode` se limitan a etiquetas seguras; las etiquetas desconocidas se sustituyen por `other` o se omiten. No se emite identificador por operación. Los fallos clasificados de roast incluyen un código acotado, como `OPENAI_ROAST_TIMEOUT` u `OPENAI_ROAST_HTTP_5XX`, sin el cuerpo del proveedor. El evento se emite una vez por operación lógica, incluso si el roast hace un reintento; por ello no contabiliza ni desglosa todas las solicitudes HTTP del reintento. No incluye texto, cuenta, cookie, IP, token de sesión ni clave API.

La evaluación de ideas permite como máximo un reintento cuando la respuesta del proveedor incumple el contrato visible, estructural o semántico. Las dos llamadas comparten un presupuesto inicial de 120 segundos. Si la primera respuesta inválida llega cuando quedan menos de 30 segundos, la segunda dispone de una gracia acotada: el plazo total puede extenderse como máximo 30 segundos después del límite inicial y nunca se crea una tercera llamada. Los registros seguros `EVALUATION_RETRY_SCHEDULED`, `EVALUATION_RETRY_COMPLETED` y `EVALUATION_TIMEOUT` incluyen validación cuando corresponde, número de intento y tiempo transcurrido, sin texto de idea ni identificadores. Junto a la duración por llamada `ai_operation`, permiten comprobar si la segunda respuesta llegó dentro del plazo inicial o necesitó la gracia.

El panel de costes estima las entradas cacheadas de `gpt-5.4-mini` a 0,075 USD por millón de tokens y el resto de entradas a 0,75 USD; la salida cuesta 4,50 USD por millón. La fuente de precios consultada es la [ficha oficial del modelo](https://developers.openai.com/api/docs/models/gpt-5.4-mini). La migración `035_admin_ai_cached_input_tokens` conserva el contador de caché para llamadas nuevas. Los registros anteriores no incluyen ese dato y su estimación histórica no se puede reconstruir con exactitud. El total del panel es una estimación de uso, no el importe facturado por OpenAI.

El panel admin presenta estos controles en pestañas. **Benchmark de IA**
explica el corpus sintético y la estructura de un informe posible, pero no
ofrece un comando, no ejecuta el benchmark y no está conectado a un historial de
resultados. El informe ilustrativo incluye versión de política y fecha,
recuento de casos y variantes, acuerdo con las etiquetas y consistencia de
estado/motivo; no es un resultado almacenado. La CLI documentada arriba sigue
siendo una ejecución manual independiente y sus resultados no se conectan al
panel. **Telemetría de IA** muestra costes agregados, usos sin precio y
actividad reciente agrupada por hora, operación y modelo durante las últimas
24 horas. Esa tabla muestra recuento de usos, volúmenes de tokens de
entrada/cacheados/salida en rangos —menos de 1.000; de 1.000 a menos de 5.000;
de 5.000 a menos de 20.000; y 20.000 o más— y coste estimado; no expone los
recuentos exactos de tokens. Omite los grupos con menos de tres usos. La tabla
no incluye texto de ideas, identificadores de evento, actor, cuenta, IP ni
sesión. **Seguridad y acceso** resume pruebas de seguridad
y métricas agregadas de protección de login. Ninguna pestaña ejecuta modelos o
pruebas desde el navegador. Para calcular promedios por cuenta, el registro
privado de consumos almacena tokens y costes asociados a `userId`; estos
identificadores no aparecen en los eventos stdout ni en la tabla de actividad
reciente.

Las métricas de `AbuseProtection` que muestra la pestaña «Seguridad y acceso»
cubren una ventana móvil de 15 minutos y siguen limitadas al login: solicitudes
de login admitidas por el rate limit, retos emitidos/aceptados/rechazados,
fallos de autenticación durante el modo challenge, solicitudes denegadas por el
bloqueo temporal, recuento de claves HMAC con bloqueo vigente y estado del
detector de login. Los detectores de login, alta y contacto son independientes
por ámbito: cada uno se activa durante 15 minutos cuando alcanza 10 solicitudes
admitidas por segundo durante tres segundos consecutivos. Las solicitudes
denegadas por rate limit no activan el reto. El panel no expone contadores de
retos ni actividad de alta/contacto. Los fallos cuentan solo una respuesta
`401 LOGIN_UNAVAILABLE` durante el modo challenge de login e incluyen los
fallos recientes usados al activarlo. Son contadores volátiles en memoria por
proceso y se reinician con el proceso; no registran ni muestran IP, usuario,
cuenta o sesiones individuales. No hay sincronización entre procesos o
réplicas. El bloqueo temporal se aplica a una clave HMAC de la IP observada,
por lo que puede afectar a varias personas detrás de una misma salida NAT.

Los errores HTTP 5xx conservan códigos y diagnósticos seguros para las métricas
del panel, pero los eventos nuevos no guardan contexto de entrada ni texto de
ideas. Un `HTTP_503` sin diagnóstico significa que el filtro recibió una
excepción sin código funcional ni diagnóstico seguro; el panel no conserva
ruta ni caso de uso, así que no permite atribuirlo a una función, a
desarrolloseguro o a un ataque. Los errores de auditoría técnica sí usan códigos
propios, como `evidence_unavailable`, y no deberían agruparse como `HTTP_503`.
Para identificar un evento genérico hay que correlacionar su hora con los
registros de API protegidos; no se debe resetear el contador hasta conocer su
causa. El detalle administrativo no devuelve contextos. La migración
`036_redact_application_error_context.sql` pone a `NULL` los contextos ya
guardados en la base; la columna permanece en el esquema y las copias de
seguridad históricas no se modifican. La retención física de los eventos sigue
siendo de 30 días.

Configura tarifas USD por millón de tokens que correspondan a la tarifa del proveedor para cada modelo activo. Los nombres de variables se forman así:

- `AI_IDEA_EVALUATION_INPUT_USD_PER_MILLION_TOKENS` y `AI_IDEA_EVALUATION_OUTPUT_USD_PER_MILLION_TOKENS`
- `AI_IDEA_EMBEDDING_INPUT_USD_PER_MILLION_TOKENS` y `AI_IDEA_EMBEDDING_OUTPUT_USD_PER_MILLION_TOKENS` (salida a cero)
- `AI_IDEA_EQUIVALENCE_INPUT_USD_PER_MILLION_TOKENS` y `AI_IDEA_EQUIVALENCE_OUTPUT_USD_PER_MILLION_TOKENS`
- `AI_ROAST_REPLY_INPUT_USD_PER_MILLION_TOKENS` y `AI_ROAST_REPLY_OUTPUT_USD_PER_MILLION_TOKENS`

Sin ambas tarifas y el uso devuelto por el proveedor, `estimatedCostUsd` vale `null`; no se inventa un coste. La estimación no incluye impuestos ni cargos externos. Estas variables son configuración de observabilidad, no secretos; guárdalas junto a la configuración del entorno y revísalas al cambiar de modelo o tarifa. El despliegue debe enrutar stdout a un colector con acceso restringido, retención definida y alertas agregadas. No se añade una interfaz pública para consultar métricas.

## Limitaciones y siguientes controles antes de abrir al público

La tasa antiabuso actual es por proceso y usa la IP como señal temporal. La telemetría de coste refleja llamadas a los adaptadores instrumentados, no el coste total de base de datos, infraestructura, moderación de avatar ni intentos rechazados antes del proveedor. Los precios deben actualizarse manualmente. El benchmark ejecuta prompts alternativos en el mismo adaptador, pero la versión de política y el validador son los actuales; cambiar la rúbrica también requiere revisar las etiquetas y pruebas contractuales. La revisión de privacidad y la configuración de un colector central siguen siendo requisitos operativos de producción.
