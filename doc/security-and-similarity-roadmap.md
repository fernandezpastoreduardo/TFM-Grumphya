# Plan de seguridad del registro y similitud de ideas

Este documento separa lo que el código hace hoy de los cambios solicitados. Los requisitos marcados **Planificado** no deben describirse como capacidades desplegadas hasta implementarlos y verificar sus pruebas.

## Registro: estado observado

- **Implementado:** `POST /api/registration-intents` y `POST /api/registrations` pasan por limitación por IP/proceso en ventanas de un minuto. Los topes actuales son 20 intenciones y 8 altas; verificación, confirmación y refresh tienen 10; toda la API tiene un máximo general de 120. Al superar el cupo se devuelve `429` con `Retry-After`.
- **Implementado:** parser JSON de 8 KB; validación en backend de plan, forma de payload, email, alias, longitud de contraseña (12–128), controles, política y token. Email/alias se normalizan. El token de intención y el refresh se transportan en cookies `HttpOnly`, `SameSite=Strict` (y `Secure` en producción). Los POST mutables de registro y refresh exigen `Origin` exacto y `application/json`.
- **Implementado:** `scrypt` parametrizado para el hash de la contraseña, respuesta genérica ante conflicto de unicidad y no registrar contraseñas/tokens.
- **Implementado en UI:** el botón queda deshabilitado durante la petición, un bloqueo síncrono previene un doble evento y un `202` bloquea nuevos envíos. El manejo visual específico de `429` debe verificarse en las pruebas de integración.
- **No implementado:** rate limit compartido entre procesos/réplicas. El middleware en memoria se puede evadir con distribución de tráfico y se reinicia con el proceso.

## Registro: requisitos planificados

1. **Hecho:** exigir en cliente y servidor 12–128 caracteres, al menos una mayúscula Unicode, una minúscula Unicode, un número Unicode y un carácter que no sea letra, número ni espacio en blanco. No recortar ni normalizar contraseña.
2. Mantener la limitación autoritativa en API, incluyendo tanto la solicitud iniciada desde el formulario como la ruta que la recibe. Revisar los cupos existentes con producto; responder `429` estable y `Retry-After`. El cliente debe mostrar un mensaje español accesible y evitar reenvíos hasta que proceda.
3. **Hecho en UI:** al primer submit válido, tomar un bloqueo sincrónico para impedir doble evento antes del siguiente render, deshabilitar el botón y mantenerlo bloqueado tras el resultado para evitar reenvíos ambiguos. El mensaje de error pide recargar antes de reintentar. Queda por añadir idempotencia de servidor para recuperar una respuesta perdida sin duplicar el registro.
4. Validar tipos, longitudes y enumeraciones de todo payload externo en backend; normalizar según campo. Mantener límite de cuerpo HTTP y no confiar en validación del navegador. Para futuras query/path params, permitir solo formatos explícitos, longitud acotada y decodificación segura. Codificar los valores según contexto de salida; no aplicar una función genérica de «sanitización» que altere contraseñas o texto legítimo.
5. **Hecho parcialmente:** hay pruebas para grupos de contraseña ausentes, campos inesperados, límites de rate limit y `Retry-After`, y doble submit/fallo ambiguo. Añadir cobertura específica para formulario ante `429`, límites exactos de contraseña, payload de tipo incorrecto/tamaño excesivo y confirmar que logs no contienen credenciales ni datos personales.
6. Como medida futura para despliegue multiinstancia, mover contadores a almacenamiento compartido/gateway y dimensionar topes bajo carga. Baneo de IP, huellas de navegador y detección de automatización quedan expresamente fuera de este alcance, tal como se ha pedido.

## Similitud de ideas: alcance funcional

`searchSimilarIdea` está implementado y probado como caso de uso con puertos inyectables, pero `pgvector` todavía no está conectado: no existe tabla/repositorio de ideas ni proveedor concreto de embeddings. El evaluador real tampoco está conectado en `AppModule` por defecto. Por tanto, aún no hay búsqueda vectorial en ejecución ni endpoint de similitud.

Flujo objetivo:

1. `searchSimilarIdea` compara la entrada con ideas previamente rechazadas. Calcula similitud coseno y solo considera match los valores **estrictamente superiores a 0,90**. La coincidencia no lee evaluaciones ni permite reutilizar su resultado.
2. Con match, `updateWorstIdea` incrementa el contador agregado inmediatamente, incluso si la persona no continúa con la evaluación. Ese envío lógico queda contabilizado una sola vez: si la persona continúa y la evaluación también devuelve `reject`, no se llama a `addToWorstIdeas` ni se incrementa de nuevo. La continuación conserva la misma clave de idempotencia del envío original, válida durante 24 horas. El incremento y el conteo semanal son atómicos e idempotentes por petición lógica. La respuesta para el aviso incluye el título público seguro y el contador total ya incrementado, pero nunca texto original, autor ni identificadores personales. La UI advierte que continuar consume un intento y ofrece un botón explícito. Si no se continúa, no se llama a `evaluationProcess` ni se consume intento. Si se continúa, el backend vuelve a comprobar la cuota y ejecuta la evaluación; el uso se confirma solo con resultado válido.
3. Sin match, se ejecuta `evaluationProcess`. Si el resultado es `reject`, su respuesta estructurada incluye un campo dedicado `safeTitle`; un verificador independiente debe aprobarlo antes de que `addToWorstIdeas` cree el registro con título y contador `1`. Si falla la comprobación, no se almacena ni publica la idea. Otros veredictos no entran en el corpus Worst Ideas. Si hubo match antes de evaluar, un `reject` posterior no vuelve a escribir ni incrementar esa idea.
4. El corpus no guarda el texto original ni autor. Se autoriza persistir el embedding junto al título y contador, versionado con proveedor/modelo y dimensión. Proveedor elegido: OpenAI API; baseline recomendado: `text-embedding-3-small` con 1536 dimensiones. La idea se envía a OpenAI para crear el embedding. Según la documentación consultada el 13 de octubre de 2026, el contenido de API no se usa para entrenar por defecto y los registros de control de abuso pueden retener contenido hasta 30 días; revisar la [guía de embeddings](https://developers.openai.com/api/docs/guides/embeddings) y los [controles de datos](https://developers.openai.com/api/docs/guides/your-data) antes de producción. El embedding no debe devolverse ni registrarse. Título, vector y contador caducan a los 24 meses de la última recepción, momento en que se elimina también el índice asociado. Para el ranking semanal, se agregan recepciones por fecha `Europe/Madrid`, sin identidad.
5. Aislar las semillas de desarrollo/pruebas de rankings reales. Hacer atómicas y recuperables las operaciones de embedding, contador e idempotencia.

## Plan TDD propuesto

### `searchSimilarIdea`

- **RED:** similitud exacta `0,90` da `no-match`; valor mayor da match; menor da no-match; resultados sin embedding compatible se ignoran; corpus vacío da no-match.
- **GREEN:** puerto de búsqueda y caso de uso puros, con umbral `0.90` nombrado y comparación `>`; validar en runtime la respuesta externa/DB como `unknown` y descartar dimensiones/modelos incompatibles.
- **Integración:** repositorio pgvector consulta exclusivamente filas rechazadas, ordena por similitud y limita a la mejor compatible. Respuesta no filtra embedding, texto original, autor o evaluación.

### `updateWorstIdea`

- **RED:** match único aumenta 23 a 24 inmediatamente al detectarlo, aunque no continúe a evaluación; continuar y recibir otro `reject` no vuelve a sumar; repetición de la misma clave idempotente durante 24 horas no aumenta otra vez; operaciones concurrentes no pierden incrementos; fallo no deja contador diario desincronizado.
- **GREEN:** incremento atómico y registro agregado del día local de Madrid. La búsqueda/actualización no consume uso.
- **Integración:** probar con PostgreSQL/pgvector aislado, incluyendo cambio de fecha local y límites transaccionales.

### `addToWorstIdeas`

- **RED:** solo `reject` permite invocar; inicializa contador en 1; títulos no seguros se descartan/no publican; no persiste texto fuente; reintento idempotente no duplica filas.
- **GREEN:** insertar título seguro, embedding versionado y conteo inicial de forma consistente; mantener la idea fuente solo en memoria durante la operación.
- **Integración:** verificar esquema, restricciones, rollback ante fallo parcial y respuesta de ranking que solo incluya título seguro y conteo.

### Orquestación y UI

- **RED:** match actualiza el contador una sola vez; continuar llama al evaluador sin volver a incrementar aunque el resultado sea `reject`; botón de continuar llama una sola vez; sin match sí evalúa y un rechazo nuevo llama `addToWorstIdeas`; otros estados no; errores en búsqueda/evaluación no consumen uso; reserva y confirmación de uso son idempotentes.
- **GREEN:** flujo explícito de aviso y confirmación accesible, con cuota comprobada otra vez en servidor y texto español de España.
- **E2E:** prueba en entorno aislado con repositorio vectorial y datos sintéticos; verificar aviso, continuar/cancelar, ranking y ausencia de texto/identidad en respuestas/logs.

## Decisiones cerradas y detalles de implementación

- Proveedor: OpenAI API; usar `text-embedding-3-small` y dimensión explícita `1536` como baseline de la primera implementación. Evaluar el umbral `> 0,90` con un corpus de prueba antes de activar búsqueda real.
- Tratamiento externo: el texto de idea se envía al endpoint de embeddings de OpenAI. La política de proveedor y la información de privacidad del producto deben reflejar ese procesamiento antes de abrir el servicio a usuarios reales.
- Retención interna: eliminar título seguro, embedding y contador después de 24 meses desde la última recepción. La búsqueda excluirá registros caducados aunque la limpieza física esté pendiente.
- Título: añadir `safeTitle` dedicado a la salida estructurada del evaluador para veredictos `reject`; un puerto verificador independiente valida y falla de forma cerrada. Sin aprobación, no se publica ni se incorpora al corpus.
- Aviso: mostrar el título seguro y el contador total posterior al incremento, junto con los intentos que consumiría continuar. No mostrar texto original, autor ni identificadores.
- Idempotencia: una clave por envío lógico, compartida por búsqueda, incremento y continuación; persistir solo su hash y eliminarla tras 24 horas. Un segundo rechazo en la continuación no suma otra unidad.
- Implementación pendiente: concretar las comprobaciones del verificador de títulos y hacer migración, adaptadores, transacciones, orquestación, UI y pruebas de integración/E2E.
