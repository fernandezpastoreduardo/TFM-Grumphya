# Describes naming & content guides to develope components referenced on sections.md or features.md

## Components del MVP

### IdeaInput

Nombre único del componente de captura. Contiene el área de texto, mascota, botón de envío, selector «piel fina / mejor golpe» y control de dictado. Captura una idea escrita, pegada o transcrita. Props: `tone`, `onSubmit`, `remainingAttempts`, `isSubmitting` y `error`. Debe usar `label`, estado de carga y mensaje accesible de validación. El dictado no envía la idea automáticamente.

### EvaluationResult

Presenta veredicto, puntuación, riesgos, supuestos y próximos pasos. No calcula ni modifica el resultado.

### RepeatedIdeaNotice

Informa de que la idea es semánticamente similar a otra, muestra el título público seguro y el contador total ya incrementado, y ofrece «Evaluar igualmente». La frase valorativa sigue el tono seleccionado (`soft` o `hard`). No presenta el texto original ni datos de autor. Hasta que la API implemente cuotas autoritativas, no afirma que continuar descuente un intento ni muestra intentos restantes.

### UsageLimitNotice

Explica que no quedan intentos y ofrece la acción que corresponda sin revelar reglas internas.

### LoginForm / CreateAccountForm

Formularios accesibles. Los errores de autenticación deben ser genéricos y nunca confirmar si un usuario existe.

`RegisterWithPlan` es el contenedor de `features/register-with-plan/`: consulta el estado de la intención de alta al cargar `/crear-cuenta`, coordina el alta pendiente, verificación y confirmación simulada, y renderiza los estados correspondientes. No obtiene el plan de query params ni concede permisos en cliente.

`CreateAccountForm` solicita email, alias, contraseña y una casilla inicialmente desmarcada con el texto «He leído la política de privacidad» enlazado a `/politica-de-privacidad`. La casilla es obligatoria, con error asociado al control y anuncio accesible. Email sintácticamente inválido puede dar mensaje específico; conflictos de email/alias comparten el mismo mensaje y respuesta genérica. El formulario distingue claramente alta pendiente, email verificado pendiente de contratación, éxito y error. Si el entorno usa el sink de correo de desarrollo/QA, presenta un aviso visible de que el mensaje de prueba se redirige al buzón fijo y no verifica el control del email escrito.

La vista `/politica-de-privacidad` provisional muestra un título y los estilos del sitio e indica que el contenido está pendiente de completar. No debe aparentar ofrecer información legal completa.

### ErrorCreature

Componente presentacional para estados 400, 429 y 500. El copy y la ilustración deben respetar `copy-style.md` y `UI-aestethics.md`.

Los componentes específicos permanecen dentro de su feature hasta que exista un segundo consumidor real.
