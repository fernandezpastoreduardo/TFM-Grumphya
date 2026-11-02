# Controles, evidencia y lenguaje público

## Regla de interpretación

La fase inicial documenta **evidencia interna del proyecto**, no realiza escaneo de Internet. Cada afirmación debe responder: qué se observó, con qué método, en qué versión o entorno, cuándo, qué rutas cubrió y qué queda fuera. Si falta una respuesta, bajar el estado a documented_unverified o retirar la afirmación. Un test local o CI nunca se presenta como medición de grumphya.com en producción.

La ficha sigue siendo demonstration aunque todas las pruebas internas pasen. No hay porcentaje global ni aprobado general. Los estados de cada assurance describen soporte documental, no conformidad de un dominio.

## Catálogo inicial

| ID          | Afirmación pública permitida                                                  | Evidencia inicial que Luna debe comprobar                                                                                | Límite obligatorio                                                                                                    |
| ----------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| DS-PRIV-01  | «El proyecto documenta tratamiento, borrado y retención de datos»             | Política publicada, rutas/servicios de borrado y tests existentes; citar archivo y SHA                                   | No equivale a auditoría jurídica ni prueba de configuración efectiva en producción.                                   |
| DS-FIRST-01 | «En las rutas públicas ensayadas en CI no se observaron recursos de terceros» | E2E con navegador limpio en /, /precios, /desarrollo-seguro/ y ficha; registrar destinos, cookies y alcance de la prueba | La prueba no cubre sesiones, todos los navegadores ni el sitio publicado. Si el E2E no cubre alguna ruta, no citarla. |
| DS-TRANS-01 | «El despliegue configura HTTPS y cabeceras de protección»                     | Caddyfile, Compose, smoke de producción y tests de cabeceras; indicar revisión de configuración                          | No afirmar que el endpoint público se midió desde fuera ni que todo tráfico/almacenamiento está cifrado.              |
| DS-AUTH-01  | «La aplicación contiene pruebas de autenticación, permisos y límites»         | Rutas de pruebas y CI que realmente ejecuta esos suites; SHA                                                             | No equivale a pentest, ASVS completo o ausencia de vulnerabilidades.                                                  |
| DS-DELIV-01 | «El proceso de entrega incluye comprobaciones de calidad y dependencias»      | Workflow de CI y resultado de una ejecución identificable si se decide publicar                                          | La existencia de un workflow no demuestra que el despliegue público corresponda al commit probado.                    |

Antes de marcar verified_internal, Luna debe ejecutar o localizar una ejecución real de la prueba y poder enlazar su fuente/versionRef. No usar una fecha antigua de la ficha como fecha de un test nuevo. Si no hay ejecución conservada, marcar documented_unverified. La evidencia publicada será un resumen redactado; no almacenar trazas completas del navegador ni datos personales.

## Copy permitido y prohibido

**Permitido:** «Demostración académica»; «revisión técnica interna limitada»; «comprobado en pruebas del repositorio el [fecha/versión]»; «sin evaluación disponible»; «la búsqueda no inicia un escaneo».

**Reservado para fase futura con evidencias reales:** «verificación externa periódica», «último escaneo», «vigente durante una hora», «cumple controles observables». Esos textos requieren una ejecución real identificable, perfil versionado, caducidad y tratamiento de errores.

**No afirmar en esta fase ni deducir de un escaneo externo futuro:** «certificado oficialmente», «cumple RGPD», «sin vulnerabilidades», «100 % seguro», «sin cookies en todo el sitio», «accesibilidad WCAG AA completa». [OWASP ASVS](https://asvs.owasp.org/) y [Mozilla Observatory](https://developer.mozilla.org/en-US/observatory/docs/faq) explican los límites de verificaciones parciales; [W3C](https://www.w3.org/WAI/test-evaluate/tools/selecting/) requiere juicio humano para evaluar accesibilidad completa.

## Privacidad del propio prototipo

El formulario y la ficha usan únicamente el mismo origen. No añadir fuentes, analítica, iframes, píxeles, badges remotos ni cookies nuevas. La búsqueda no comunica el dominio introducido a un tercero. El servidor debe evitar registrar la consulta completa si los logs pueden retener dominios personales; conservar solo métricas agregadas o la retención operativa imprescindible. Los resultados de casos desconocidos no se guardan. Mantener la CSP estricta del prototipo; solo permitir form-action self para la búsqueda, sin habilitar scripts por comodidad.

La guía de la [AEPD sobre cookies](https://www.aepd.es/documento/guia-cookies.pdf) orienta el análisis, pero las cookies propias también requieren evaluar finalidad y base legal. Cualquier cambio real de tratamiento exige revisar la política vigente antes de publicar.

## Contrato reservado para la fase de escaneo real

El futuro perfil externo versionado distinguirá pass, fail, unknown y not_applicable por control, con evidencia, URL muestreada, hora UTC y caducidad. Transportes, cabeceras, recursos/cookies en navegador limpio y disponibilidad podrán evaluarse externamente de forma acotada. Pruebas de código, acceso, backups y RGPD seguirán fuera de esa inferencia. El escáner deberá protegerse contra SSRF, límites de recursos y falsos positivos antes de abrir consultas arbitrarias. Estas reglas orientan el diseño; **no son tareas del incremento inicial**. [OWASP SSRF](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html).
