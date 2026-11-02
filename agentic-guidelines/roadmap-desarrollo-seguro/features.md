# Features de la fase inicial

## F0. Preservar la verdad pública

**Historia.** Como visitante quiero entender que el sello es una demostración académica y qué parte del caso se ha revisado realmente.

**Trabajo.** Mantener la etiqueta demonstration, los límites y la comparación del dominio autorizado. Evitar que la nueva búsqueda convierta una ficha de revisión interna en una «verificación externa». Reutilizar la imagen del sello solo con el texto aclaratorio y la condición de hostname ya existentes. La frase «Aplicación certificada» incrustada en el WebP sigue requiriendo una aclaración visible; no ampliar su uso para otros dominios.

**Aceptación.** En /, /precios, /desarrollo-seguro/ y /acreditaciones/DS-GRUMPHYA-2026-001 se ve «Demostración académica» o «Prototipo académico» junto a cualquier imagen de sello. Un fallo del registro no muestra imagen ni afirma vigencia. La ficha enumera método, fecha y límites de cada evidencia.

## F1. Buscar un dominio sin escanearlo

**Historia.** Como visitante introduzco un dominio para encontrar una ficha disponible.

**Entrada.** Un hostname, no una URL. El formulario acepta teclado y envío, tiene etiqueta visible e indica ejemplos. Se normaliza a ASCII/IDNA y minúsculas, se retira un punto final si existe y se validan longitud y etiquetas. No aceptar protocolo, ruta, consulta, puerto, usuario, IP literal ni espacios. El servidor vuelve a validar; el cliente solo ayuda a corregir.

**Salida.** grumphya.com resuelve al caso DS-GRUMPHYA-2026-001. Cualquier dominio público sintácticamente válido sin caso muestra «Aún no hay evaluación para este dominio» y una explicación de que la búsqueda no lo escanea. Entrada inválida muestra error de campo, sin eco inseguro. El desconocido no recibe 404 de infraestructura ni ficha vacía.

**Ruta propuesta.** Conservar la landing estática en /desarrollo-seguro/. Añadir allí un formulario GET del mismo origen hacia /acreditaciones/buscar con parámetro dominio. Esta ruta React realiza la consulta al endpoint nuevo. Cambiar solo la directiva form-action de la CSP estática a self, si el formulario lo necesita; conservar script-src none y los recursos propios. Si el router actual exige otro nombre, registrar la decisión y actualizar los enlaces de estos documentos en la implementación.

**Aceptación.** La búsqueda no causa DNS, GET, HEAD ni navegador automatizado desde el servidor hacia el dominio consultado. No crea fila de caso ni evidencia. Funciona con JavaScript desactivado hasta la navegación al resultado, y la página React ofrece estados cargando, encontrado, sin evaluación y error temporal.

## F2. Caso persistido y ficha compatible

**Historia.** Como visitante quiero ver el caso de Grumphya servido por una fuente estable, con el mismo identificador público y sin fechas ficticias.

**Trabajo.** Introducir tablas de la fase inicial descritas en [persistence.md](persistence.md). Migrar los datos del único caso actual sin cambiar el significado de issuedAt y validatedAt. Sustituir la constante de producción por repositorio, manteniendo el caso de uso y GET /api/accreditations/:id. Separar las evidencias internas de una hipotética observación externa futura. No añadir endpoint de edición pública.

**Aceptación.** El endpoint existente conserva sus campos y estado demonstration. Un ID inexistente sigue devolviendo 404. La ficha solo cambia mediante migración de datos o procedimiento administrativo explícito y auditado; una petición pública nunca la modifica. Si la base falla, el endpoint falla de forma segura y el sello oculta la imagen.

## F3. Evidencias internas trazables

**Historia.** Como lector quiero saber qué prueba o revisión respalda cada afirmación y cuál es su límite.

**Trabajo.** Usar el catálogo de [controls-and-evidence.md](controls-and-evidence.md). Para cada evidencia publicada, guardar método, resumen, referencia a prueba o archivo, SHA o versión revisada cuando exista, fecha real de observación y limitación. Añadir o mejorar pruebas de navegador para las rutas públicas citadas por el copy actual, porque la prueba existente solo cubre completamente la página estática del prototipo. Un test que se incorpora ahora no retrovalida el pasado: su fecha de observación será la de su ejecución real.

**Aceptación.** No aparece «comprobado cada hora» ni «último escaneo» en ausencia de un escaneo real. Si una evidencia no se puede reproducir, se muestra como no verificada o se retira del resumen. El reporte diferencia prueba automatizada interna, revisión de configuración y declaración descriptiva.

## F4. Preparación para una extracción futura

**Historia.** Como mantenedor quiero trasladar Desarrollo Seguro a otro repositorio sin copiar lógica de Grumphya ni datos personales.

**Trabajo.** Definir interfaces de lectura de casos, reloj y publicación de evidencias; separar modelos de Desarrollo Seguro de modelos de usuarios/ideas de Grumphya. Mantener rutas y enlaces centralizados. Documentar las futuras entradas de escaneo y cola, pero no crear contenedores o credenciales de escáner inactivos que parezcan funcionales.

**Aceptación.** La lógica de búsqueda y proyección pública no importa servicios de autenticación, ideas, planes, OpenAI o correo. El módulo se puede probar con repositorio en memoria. La extracción futura tiene lista concreta de dependencias y datos a mover.

## Fuera del incremento

Registro automático de dominios de terceros, prueba de titularidad, sello para otros sitios, crawler, Playwright contra Internet, cron, cola, SSRF de runtime, revisión de sesiones privadas, ASVS completo, WCAG completa, declaración RGPD, dominio/hosting propio, cambio del proxy de producción y migración a otro repositorio. Las decisiones previstas se describen, pero Luna no las implementa en esta fase.
