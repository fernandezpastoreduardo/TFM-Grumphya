# Describes naming & content guides to develope components referenced on sections.md or features.md

## Components del MVP

### IdeaInput

Nombre único del componente de captura. Contiene el área de texto, mascota, botón de envío, selector «piel fina / mejor golpe» y control de dictado. Captura una idea escrita, pegada o transcrita. Props: `tone`, `onSubmit`, `remainingAttempts`, `isSubmitting` y `error`. Debe usar `label`, estado de carga y mensaje accesible de validación. El dictado no envía la idea automáticamente.

### EvaluationResult

Presenta veredicto, puntuación, riesgos, supuestos y próximos pasos. No calcula ni modifica el resultado.

### RepeatedIdeaNotice

Informa de que la idea es semánticamente similar a otra, muestra el título público seguro y el contador total ya incrementado, y ofrece «Evaluar igualmente». La frase valorativa sigue el tono seleccionado (`soft` o `hard`). No presenta el texto original ni datos de autor. El endpoint de usos anónimos devuelve el cupo restante; detectar la coincidencia no lo consume y continuar reserva una evaluación.

### UsageLimitNotice

Explica que no quedan intentos y ofrece la acción que corresponda sin revelar reglas internas.

### LoginForm / CreateAccountForm

Formularios accesibles. Los errores de autenticación deben ser genéricos y nunca confirmar si un usuario existe.

`RegisterWithPlan` es el contenedor de `features/register-with-plan/`: consulta la intención del plan al cargar `/crear-cuenta`, coordina el alta directa y activa de la cuenta y la suscripción simulada, y presenta los estados accesibles del formulario. Tras completar el alta, muestra durante cinco segundos el modal de pago simulado y después navega a `/perfil`. No obtiene el plan de query params ni concede permisos en cliente. Las cuentas nuevas quedan activas con el correo aún sin verificar; la verificación de email está pendiente y se registra en `wanna-bes.md`.

`CreateAccountForm` solicita email, alias, contraseña y una casilla inicialmente desmarcada con el texto «He leído la política de privacidad» enlazado a `/politica-de-privacidad`. La casilla es obligatoria, con error asociado al control y anuncio accesible. Email sintácticamente inválido puede dar mensaje específico; conflictos de email/alias comparten el mismo mensaje y respuesta genérica. El formulario distingue los estados de carga, error y alta satisfactoria. El alta satisfactoria activa la cuenta y el plan en el servidor y da paso al modal de pago simulado; no se envían correos ni se solicitan datos bancarios.

La vista `/politica-de-privacidad` provisional muestra un título y los estilos del sitio e indica que el contenido está pendiente de completar. No debe aparentar ofrecer información legal completa.

### ErrorPages

Componente presentacional de las páginas 404, 429 y 500. Reutiliza el marco
compartido de navegación, tema y escena; usa una ilustración PNG transparente por
error que integra la mascota y los accesorios de la lámina aprobada. El 404 corresponde a rutas desconocidas,
el 429 al límite temporal de creación de perfiles anónimos y el 500 a errores
de renderizado React. Los errores recuperables de API permanecen en contexto.
El copy, las acciones y el contraste siguen `copy-style.md` y
`UI-aestethics.md`. Las rutas de previsualización solo existen en desarrollo.

Los componentes específicos permanecen dentro de su feature hasta que exista un segundo consumidor real.

### WorstIdeasAll

Listado de las peores ideas de todos los usuarios ordenado por cantidad de veces que se han introducido de manera descendente. Se muestra el título seguro conceptual de la idea sin indicar identidad de ningún usuario implicado

### WorstIdeasUser

Listado de las peores ideas del usuario logueado ordenado por veces que se han introducido de manera descendente. Se muestra el título seguro conceptual de la idea sin indicar identidad de ningún usuario implicado.
+ Si el usuario no está logueado debe aparecer el contenido indicado en el prototipo:

    Tu historial
    Tú también tienes tus pinitos.
    Cuando tengas cuenta, aquí podrás revisar tus ideas rechazadas. Solo tú verás tu historial.

    Ver planes para crear una cuenta↗

+ Si el usuario está logueado pero no tiene ideas rechazadas debe aparecer el siguiente contenido al estilo del prototipo:

    Tu historial
    Tú también harás tus pinitos.
    Cuando plantes alguno, aquí podrás revisar tus ideas rechazadas. Solo tú verás tu historial.

### Roast

- El contenedor `Roast` presenta la conversación siguiendo el formato de mensajería del prototipo y conecta el envío con la feature `submitRoast`.
- Los intercambios de muestra solo aparecen si no consta ningún envío previo. La UI detecta actividad comparando el cupo disponible con su valor inicial y, en cuentas, consultando además el contador acumulado de roast, que persiste aunque se reinicie la cuota diaria. Los mensajes enviados se muestran durante la sesión actual, pero no existe historial de texto para reconstruirlos al volver.
- `RoastInput` permite escribir y enviar el mensaje, muestra el estado de envío y los errores, evita el doble envío y comunica los intentos restantes devueltos o confirmados por el servidor.
- `RoastInput` tiene etiqueta accesible, contador de caracteres, feedback anunciado por lectores de pantalla y contraste legible en los modos claro y oscuro.
