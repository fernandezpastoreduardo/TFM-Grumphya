# Describes naming & content guides to develope components referenced on sections.md or features.md

## Components del MVP

### IdeaInput

Nombre único del componente de captura. Contiene el área de texto, mascota, botón de envío, selector «piel fina / mejor golpe» y control de dictado. Captura una idea escrita, pegada o transcrita. Props: `tone`, `onSubmit`, `remainingAttempts`, `isSubmitting` y `error`. Debe usar `label`, estado de carga y mensaje accesible de validación. El dictado no envía la idea automáticamente.

### EvaluationResult

Presenta veredicto, puntuación, riesgos, supuestos y próximos pasos. No calcula ni modifica el resultado.

### RepeatedIdeaNotice

Informa de que la idea es semánticamente similar a otra y muestra el contador permitido por producto.

### UsageLimitNotice

Explica que no quedan intentos y ofrece la acción que corresponda sin revelar reglas internas.

### LoginForm / CreateAccountForm

Formularios accesibles. Los errores de autenticación deben ser genéricos y nunca confirmar si un usuario existe.

### ErrorCreature

Componente presentacional para estados 400, 429 y 500. El copy y la ilustración deben respetar `copy-style.md` y `UI-aestethics.md`.

Los componentes específicos permanecen dentro de su feature hasta que exista un segundo consumidor real.
