# Plan de pruebas para Luna

## Método

Implementar cada slice con ciclo rojo → verde → refactor. Escribir primero una prueba que exprese el comportamiento público o una invariante de datos; usar dobles de repositorio y reloj para unidades, PostgreSQL efímero para integración y Playwright para recorridos. No escribir tests que solo repitan una función línea por línea. La suite de esta fase no necesita Internet ni secretos de producción.

## Matriz obligatoria

| Nivel | Casos |
| --- | --- |
| Normalizador | grumphya.com y mayúsculas/punto final → canonicalDomain; IDN válido → ASCII; URL, puerto, credenciales, IP literal, localhost, sufijos reservados, etiquetas inválidas y entradas largas → 400. |
| Caso de uso de búsqueda | Dominio conocido → known_case e ID exacto; desconocido válido → unassessed sin crear registros; fallo de repositorio → error temporal; doble que detecta llamadas externas prueba que no existe escaneo. |
| Contrato API | 200 de ambos miembros de la unión; 400/429/503 con código estable; no-store; no datos internos en JSON; GET /api/accreditations/:id mantiene contrato y 404 para ID ausente. |
| Persistencia | Migración en base vacía y poblada; seed de Grumphya exacto; segunda ejecución idempotente; orden de dominios/criterios/assurances; índices y FK; no fecha automática de validación; fallo de DB no usa registro hardcoded. |
| Proyección de evidencia | Null permanece null; documented_unverified no se convierte en verificado; texto privado no sale; versión y fecha reales se muestran separadas de fechas de la ficha. |
| React | Formulario accesible, errores de campo, estado cargando, resultado conocido/desconocido, respuesta malformada, 503, enlace a ficha, contraste y teclado. /acreditaciones/buscar no se confunde con /acreditaciones/:id. |
| Sello | demonstration + hostname autorizado muestra imagen y aclaración; otro hostname, suspended, revoked, expired, unknown, respuesta inválida o fallo de API muestran solo enlace textual. |
| Privacidad | E2E de la landing y rutas públicas citadas comprueba recursos/cookies en navegador limpio; la búsqueda no llama al dominio introducido ni a terceros; CSP conserva script-src none y solo amplía form-action a self. |
| E2E | Usuario abre sello → prototipo → busca Grumphya → ficha; busca dominio sin caso → mensaje honesto; introduce URL inválida → corrección; recarga directa de ambas rutas; viewport móvil 320 y 390 px. |

## Pruebas de evidencia

La prueba de «sin recursos de terceros» debe inspeccionar peticiones observadas, cookies y destino de recursos en todas las rutas que la ficha mencione. Un test que solo mira prototype/index.html no respalda Home, Planes ni la ficha. Si aparece un recurso externo, el test falla o la afirmación pública se estrecha al alcance que sí se comprobó; no se añade una excepción genérica para mantener un resultado verde.

El test de transporte de esta fase valida configuración y smoke local del stack, no certifica el TLS de grumphya.com. El reporte etiqueta método y entorno. No realizar pentest, navegación contra dominios de terceros ni intentos de conexión a direcciones internas desde la app.

## Gates por entrega

Tras cada slice coherente ejecutar los comandos del repositorio que correspondan. Antes de cerrar el incremento, ejecutar pnpm format:check, pnpm lint, pnpm typecheck, pnpm test, pnpm build, pnpm test:e2e y pnpm migrations:check, o el gate pnpm quality:check más E2E si sigue siendo equivalente en main. Registrar comando, resultado, fecha y motivo de cualquier prueba no ejecutada. Verificar el smoke de Compose que sirve /desarrollo-seguro/ si la configuración de Nginx/CSP cambia.

La entrega se bloquea si un resultado desconocido parece certificado, si un error conserva el sello visual como vigente, si las pruebas implican red externa, si hay datos ficticios con fecha de «último escaneo», o si se rompe el endpoint existente.
