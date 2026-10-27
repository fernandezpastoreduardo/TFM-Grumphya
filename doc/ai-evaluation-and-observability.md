# Evaluación de IA, seguridad y observabilidad

## Banco de evaluación del evaluador

El corpus sintético versionado vive en `apps/api/evaluation/evaluator-cases.json`. Cada caso incluye una idea creada para pruebas, los estados esperados y, cuando el motivo debe ser estable, los códigos de rechazo aceptables. Incluye una idea vaga, diferenciación ausente, falta de valor de usuario en una idea que solo contabiliza una acción, contradicción económica, instrucciones maliciosas dentro de la idea, una interacción presencial de riesgo y un caso de privacidad. La instrucción del evaluador exige valorar por separado los fallos C01–C09 antes de considerar C10; la mera existencia de alternativas no es suficiente. La variedad del veredicto debe surgir de fallos reales distintos descritos por cada idea, nunca de introducir variación aleatoria ni inventar motivos para rechazar. Los titulares sí se redactan de nuevo para cada resultado y pueden variar por tono; no cambian el estado, la puntuación ni los motivos.

Los cuatro casos especiales de Home no forman parte de ese benchmark LLM: una lista determinista del servidor los clasifica antes de llamar a similitud o al evaluador. Las pruebas de `special-idea-cases.spec.ts` cubren los límites léxicos; las pruebas de `idea-submission.service.spec.ts` comprueban que la respuesta se reserva, se cachea y no invoca búsqueda ni evaluación. La frase corta «Un/Una X pero con IA» es un patrón acotado, no una regla para rechazar cualquier propuesta que use IA.

Ejecuta la comparación desde la raíz con `pnpm --filter @grumphya/api benchmark:evaluator`. Requiere `OPENAI_API_KEY`; no consume cuotas de cuentas, porque el runner llama directamente al adaptador del proveedor. El modelo predeterminado es el mismo configurado por defecto para la API. Para comparar modelos y prompts:

```sh
pnpm --filter @grumphya/api run benchmark:evaluator -- \
  --models gpt-5.4-mini,modelo-a \
  --prompts propuesta-v8=agentic-guidelines/prompts/evaluation-v8.txt
```

Cada fichero indicado con `--prompts` contiene las instrucciones del sistema que se comparan con las instrucciones actuales; solo se admiten ficheros regulares no vacíos dentro de `agentic-guidelines/prompts`, de hasta 64 KiB. Se rechazan rutas fuera del directorio, enlaces simbólicos que escapen de él y ficheros demasiado grandes o vacíos, para evitar leer archivos locales arbitrarios y enviarlos al proveedor. El adaptador conserva las instrucciones de título seguro y fidelidad de promesa. El runner valida la respuesta con el validador de producción y presenta acuerdo con las etiquetas, acuerdo entre variantes para estado y motivo, y número de casos. Un desacuerdo esperado devuelve código de salida 1. Revisa manualmente los fallos antes de cambiar la rúbrica o el prompt: el corpus es pequeño y sus etiquetas no sustituyen una evaluación humana ni demuestran calidad general. La comparación puede generar llamadas facturables al proveedor.

El informe agregado omite ideas, explicaciones, títulos y salidas del modelo. El proveedor recibe las ideas sintéticas del corpus y los prompts indicados. No uses ideas reales de usuarios como corpus. No guardes informes crudos del proveedor.

Los límites del prompt deben coincidir con el validador de `message`: una respuesta sin rechazo admite 8–40 palabras y 280 caracteres; una respuesta rechazada admite 8–120 palabras y 900 caracteres. Dar al modelo el límite de 900 caracteres en todos los estados puede hacer que una explicación válida según el prompt supere el tope de 280 y termine como `INVALID_EVALUATION_RESPONSE` (`visible_message`).

El roast pide una pulla personalizada, mordaz y fácil de entender, en una frase de hasta 200 caracteres. Si el mensaje insulta, debe volver la pulla contra quien lo envió; si contiene un plan, una idea o una intención, debe usar un detalle concreto e inocuo para rematarlo con humor. No debe limitarse a juzgar el tono ni describir el mensaje. La respuesta sigue siendo apta para todos los públicos: sin insultos explícitos al usuario, palabrotas, ataques a terceros, amenazas ni lenguaje discriminatorio. El servidor comprueba el formato, la longitud y un conjunto de expresiones abusivas, pero no puede garantizar automáticamente la mordacidad, claridad ni pertinencia semántica del roast.

## Pruebas de seguridad de IA

- El adaptador coloca las instrucciones de evaluación en el mensaje `system` y serializa la idea en un mensaje `user` como contenido no confiable. Una prueba contractual cubre un intento de prompt injection incrustado en una idea.
- El corpus incluye casos de instrucciones maliciosas y de diseño con riesgos previsibles. El benchmark detecta cambios de resultado; no es una prueba de red team automatizada y no demuestra resistencia semántica de un modelo.
- `security.middleware.spec.ts` comprueba el rate limit de evaluación; `anonymous-usage` y `plan-usage` cubren reservas y límites de cuotas. Los límites por IP siguen siendo por proceso, así que una granja de instancias requiere un limitador compartido antes de exponerse públicamente.
- Los tests PostgreSQL de ideas, rankings y borrado crean esquemas con UUID en la base de test y los eliminan al terminar. Los tests `user-rejected-ideas.postgres.spec.ts` y `approved-ideas.postgres.spec.ts` comprueban que la historia privada de una cuenta no aparece para otra. CI configura una base PostgreSQL/pgvector desechable para ejecutar estos casos.
- Las respuestas de modelo se validan en tiempo de ejecución y se reconstruyen según el contrato público. Las credenciales, el texto de ideas, el prompt completo y la salida cruda no se escriben en logs.

## Métricas de operaciones de IA

Cada llamada a OpenAI en evaluación, embeddings, equivalencia semántica y roast emite una línea JSON `ai_operation` a stdout. Incluye nombre de operación, modelo, resultado, duración, identificador aleatorio por llamada, tokens de entrada/salida disponibles y coste estimado. No incluye texto, cuenta, cookie, IP, token de sesión ni clave API; el identificador no permite correlacionar llamadas de una sesión.

El panel admin presenta estos controles en pestañas. **Benchmark de IA**
describe el corpus sintético y cómo ejecutar la comparación; no presenta
resultados históricos porque el runner no los persiste. **Telemetría de IA**
muestra costes agregados y usos sin precio. **Pruebas de seguridad** resume el
alcance de la suite automatizada y de los análisis ejecutados por CI. Ninguna
pestaña ejecuta modelos o pruebas desde el navegador. Para calcular promedios
por cuenta, el registro privado de consumos almacena tokens y costes asociados
a `userId`; estos identificadores no aparecen en los eventos stdout ni en la
interfaz.

Configura tarifas USD por millón de tokens que correspondan a la tarifa del proveedor para cada modelo activo. Los nombres de variables se forman así:

- `AI_IDEA_EVALUATION_INPUT_USD_PER_MILLION_TOKENS` y `AI_IDEA_EVALUATION_OUTPUT_USD_PER_MILLION_TOKENS`
- `AI_IDEA_EMBEDDING_INPUT_USD_PER_MILLION_TOKENS` y `AI_IDEA_EMBEDDING_OUTPUT_USD_PER_MILLION_TOKENS` (salida a cero)
- `AI_IDEA_EQUIVALENCE_INPUT_USD_PER_MILLION_TOKENS` y `AI_IDEA_EQUIVALENCE_OUTPUT_USD_PER_MILLION_TOKENS`
- `AI_ROAST_REPLY_INPUT_USD_PER_MILLION_TOKENS` y `AI_ROAST_REPLY_OUTPUT_USD_PER_MILLION_TOKENS`

Sin ambas tarifas y el uso devuelto por el proveedor, `estimatedCostUsd` vale `null`; no se inventa un coste. La estimación no incluye impuestos ni cargos externos. Estas variables son configuración de observabilidad, no secretos; guárdalas junto a la configuración del entorno y revísalas al cambiar de modelo o tarifa. El despliegue debe enrutar stdout a un colector con acceso restringido, retención definida y alertas agregadas. No se añade una interfaz pública para consultar métricas.

## Limitaciones y siguientes controles antes de abrir al público

La tasa antiabuso actual es por proceso y usa la IP como señal temporal. La telemetría de coste refleja llamadas a los adaptadores instrumentados, no el coste total de base de datos, infraestructura, moderación de avatar ni intentos rechazados antes del proveedor. Los precios deben actualizarse manualmente. El benchmark ejecuta prompts alternativos en el mismo adaptador, pero la versión de política y el validador son los actuales; cambiar la rúbrica también requiere revisar las etiquetas y pruebas contractuales. La revisión de privacidad y la configuración de un colector central siguen siendo requisitos operativos de producción.
