# Sello demostrativo de Desarrollo Seguro

Desarrollo Seguro es una entidad **ficticia** creada para el Trabajo Fin de Máster. Grumphya es su primer caso de demostración. El sello y su ficha pública explican una propuesta de acreditación verificable; **no constituyen una certificación oficial, una auditoría independiente ni una garantía de seguridad**.

## Qué permite comprobar el prototipo

El distintivo del pie de página enlaza a la ficha pública `/acreditaciones/DS-GRUMPHYA-2026-001`. La ficha consulta `GET /api/accreditations/DS-GRUMPHYA-2026-001` y muestra la entidad emisora, la aplicación, el identificador público, el estado que responde el servidor, los dominios autorizados y el alcance declarado. La lista de dominios autorizados para esta primera ficha contiene únicamente `grumphya.com`. El visitante debe comparar el dominio de la página donde encontró el sello con esa lista; el dibujo del sello por sí solo no acredita ningún sitio.

El pie de página consulta esa API en el mismo origen y solo muestra la imagen S4 cuando la respuesta indica `demonstration` e incluye `grumphya.com` entre los dominios autorizados. En producción también comprueba que el hostname de la página coincida exactamente con un dominio de esa lista; en desarrollo local permite previsualizar el sello. Mientras carga, si falla la consulta o si el registro está suspendido, revocado, caducado o en un estado desconocido, conserva un enlace **textual** a la ficha sin mostrar la imagen. Cuando se muestra S4, el texto visible aclara que se trata de una demostración académica sin certificación oficial. Mostrar S4 en este caso no convierte el estado `demonstration` en una acreditación vigente.

El estado y la lista de dominios proceden de un registro de un único caso en el servidor. El estado inicial es `demonstration`, sin fecha de emisión ni caducidad definida: **no afirma una certificación vigente**. Los estados `suspended`, `revoked`, `expired` y los valores desconocidos no deben presentarse como válidos; un identificador inexistente devuelve 404. Cambiar el estado requiere modificar y desplegar el código, pues este prototipo no tiene consola de emisión ni base de datos de acreditaciones.

Ni `Host`, ni `Referer`, ni `Origin`, ni un identificador público copiado del HTML demuestran por sí mismos que el sitio que enseña el distintivo sea el autorizado. La comprobación del hostname en el frontend evita mostrar S4 por accidente al desplegar Grumphya en otro dominio, pero **no autentica el origen del distintivo ni impide copiarlo**. Cualquier tercero podría copiar la imagen y enlazar a una ficha real; la comprobación útil sigue siendo el dominio que aparece en la barra de direcciones, contrastado con el dominio autorizado que muestra la ficha.

La imagen WebP es un recurso estático público y seguirá siendo descargable aunque el registro deje de estar en estado `demonstration`. La retirada visual del sello depende del frontend de Grumphya al consultar el estado; no existe un mecanismo que retire copias alojadas por terceros. La respuesta del registro usa `Cache-Control: no-store` y la consulta del frontend solicita `cache: "no-store"`, para no basar la decisión visual en una respuesta antigua.

## Alcance y evidencias

Esta primera entrega documenta el **mecanismo demostrativo de publicación y consulta** de una acreditación para una sola aplicación. El alcance de la ficha es un prototipo académico y sus criterios son áreas **propuestas** para una futura evaluación:

- Gestión de identidad, sesiones y control de acceso.
- Protección de datos personales y privacidad.
- Pruebas automatizadas y seguridad del despliegue.

No se asigna a estos criterios un resultado «superado». Los controles técnicos de Grumphya, sus pruebas y sus asuntos pendientes se describen en [CI/CD y seguridad de la imagen](ci-cd.md), [evaluación de privacidad](privacy-policy-assessment.md) y [verificación del proyecto](verification.md). Esos documentos son evidencia del desarrollo del TFM, pero no equivalen a una evaluación externa ni prueban el cumplimiento de todos los controles de un esquema de certificación.

La ficha de esta fase se sirve bajo el mismo proyecto y dominio que Grumphya. Por ello, si se comprometiera la aplicación o el servidor, también podría alterarse la información de verificación.

## Recursos visuales

El logotipo L4 se conserva como `/assets/desarrollo-seguro/logo-l4.webp` y el sello S4 como `/assets/desarrollo-seguro/sello-s4.webp`. Cada archivo ocupa aproximadamente 54 KB. Son reproducciones raster generadas a partir de la lámina de referencia mediante ImageGen y optimizadas, alojadas en la propia aplicación: el navegador no necesita solicitar imágenes, scripts ni recursos de seguimiento a terceros para mostrarlos. S4 conserva el texto «Aplicación certificada» de la referencia gráfica, pero **esa frase forma parte de la ilustración y no describe el estado real de Grumphya**. El texto del pie y la ficha aclaran que solo es una demostración académica sin certificación oficial ni auditoría independiente.

Estos WebP **no son un SVG vectorial revisado ni recortes exactos del original**. Al haber sido generados a partir de la referencia, pueden diferir en detalles de formas, proporciones o tipografía. Su uso fuera del prototipo requiere una revisión visual final y la aprobación de los recursos definitivos. No se sustituye al personaje por un símbolo genérico.

## Comprobación del prototipo

Con la aplicación arrancada, abre `/` y una página interior como `/precios`: el pie debe mostrar el sello y el texto «Demostración académica · Sin certificación oficial». Al abrirlo, la ficha debe indicar `grumphya.com` como único dominio autorizado, estado «Prototipo académico», fechas no definidas y los criterios propuestos. En producción, comprueba que la dirección del sitio donde viste el sello sea exactamente `grumphya.com` antes de atribuirle la ficha; en `localhost` la imagen es solo una previsualización de desarrollo. Una URL con otro identificador, como `/acreditaciones/DS-OTRA-2026-001`, no debe mostrar la ficha de Grumphya.

Las pruebas automatizadas del servicio y su endpoint están en `apps/api/src/verify-accreditation/`; las del sello y la ficha están junto a sus componentes en `apps/web/src/`, y el recorrido de navegador en `apps/web/e2e/accreditation-verification.spec.ts`. Este último usa una respuesta simulada de la API para comprobar la navegación y el diseño móvil: por sí solo no demuestra que el registro real desplegado tenga el estado esperado. Para verificar ese dato en el entorno publicado, consulta también `https://grumphya.com/api/accreditations/DS-GRUMPHYA-2026-001` y contrasta su respuesta con la ficha.

## Evolución prevista

La ubicación del enlace de verificación se mantiene en `apps/web/src/shared/accreditation-verification.ts` para poder trasladar las fichas a un dominio y servicio independientes en una fase posterior. Antes de presentar una acreditación real harían falta, como mínimo, una entidad verificadora operativamente independiente, criterios publicados, evidencias revisadas, procedimiento de emisión y revocación, y una comprobación legal de las afirmaciones y la marca. Ninguna de esas capacidades forma parte de este prototipo.
