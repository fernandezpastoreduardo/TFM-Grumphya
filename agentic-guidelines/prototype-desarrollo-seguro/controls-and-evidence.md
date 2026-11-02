# Perfiles de controles observables

## `controls-v1`: perfil original, sin cambios

## Alcance y veredicto

El perfil v1 mide páginas **públicas y anónimas**. Para `grumphya.com`, las únicas rutas admitidas son `/`, `/precios` y `/acreditaciones/DS-GRUMPHYA-2026-001`; para cualquier otro dominio solo se admite `/`. Cada informe enumera exactamente host, rutas, método, versión del perfil, hora UTC y vantage=same_vps. No extrapolar a cuentas autenticadas, otras rutas, código, base de datos, backups, proveedores o cumplimiento legal.

Cada control devuelve pass, fail, unknown o not_applicable con evidencia mínima y límite. Una comprobación bloqueada, en timeout o incompleta da unknown; not_applicable exige una justificación auditable y no oculta errores. Un fail obligatorio decide fail; sin fails, cualquier unknown obligatorio decide inconclusive; solo todos los obligatorios aplicables en pass permiten pass. Un control puede ser advisory sin decidir el veredicto. La fecha de caducidad del informe decide su vigencia, no recalifica el veredicto histórico.

## Controles obligatorios

| ID         | Prueba de bajo impacto                                                          | Pass                                                                                                                         | Fail / unknown                                                                                                       |
| ---------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| DS-DNS-01  | Resolver host público, A/AAAA y destino de conexión validado                    | La IP elegida es pública y autorizada para el host exacto                                                                    | IP interna/reservada: rechazar scan; fallo DNS: unknown.                                                             |
| DS-TLS-01  | Handshake HTTPS con SNI y validación de cadena/nombre/fecha                     | Certificado válido y host coincide                                                                                           | Certificado inválido/caducado: fail; no se pudo establecer conexión: unknown.                                        |
| DS-TLS-02  | Probar versiones TLS permitidas de forma acotada                                | TLS 1.2/1.3 disponible y versiones antiguas rechazadas                                                                       | TLS antiguo aceptado: fail; prueba bloqueada: unknown.                                                               |
| DS-HTTP-01 | HEAD y GET seguros a host/rutas de muestra; HTTP solo para observar redirección | HTTP→HTTPS sin downgrade; respuesta HTTPS correcta                                                                           | Página no disponible o downgrade: fail; bloqueo/timeout: unknown.                                                    |
| DS-HDR-01  | Leer cabeceras de documentos HTML muestreados                                   | HSTS suficiente, nosniff, anti-embebido, Referrer-Policy y CSP aplicada con directivas de protección definidas en versión v1 | Falta o configuración permisiva: fail; cabecera inaccesible: unknown. No aceptar CSP solo Report-Only como aplicada. |
| DS-PRIV-01 | Navegador efímero limpio, registrar destinos y bloquear terceros                | Sin intentos de solicitudes a terceros en las rutas muestreadas antes de consentimiento                                      | Intento de tercero: fail; navegador incompleto: unknown.                                                             |
| DS-PRIV-02 | Inspeccionar cookies/almacenamiento observados                                  | Sin cookie de tercero; cookies propias sensibles con Secure, HttpOnly y SameSite adecuados                                   | Cookie insegura/tercero: fail; inspección incompleta: unknown; sin cookies: not_applicable solo para atributos.      |
| DS-PRIV-03 | Inspeccionar recursos cargados                                                  | Sin contenido mixto ni navegación HTTP de recursos esenciales                                                                | HTTP inseguro: fail; recurso no inspeccionable: unknown.                                                             |
| DS-QUAL-01 | Cargar páginas y recursos esenciales de la muestra                              | Documentos accesibles y recursos esenciales sin error crítico                                                                | Error reproducible: fail; bloqueo/timeout: unknown.                                                                  |

La migración `003_guarded_worker_operations.sql` registra estos nueve IDs como controles obligatorios de `controls-v1`. Un trigger bloquea `UPDATE` y `DELETE`; los roles runtime no tienen DML y nuevas filas/perfiles solo se incorporan mediante migraciones confiables. La migración `004_scan_payload_guards.sql` y el core implementan predicados semánticos para no aceptar `pass` sin evidencia mínima y consistente. El core transforma un `pass` incompleto en `unknown`, deriva `fail` ante señales concluyentes y convierte `not_applicable` en `unknown`; la DB rechaza `pass` directo que no satisfaga sus predicados y rechaza `not_applicable` directo. `controls-v1` se conserva intacto y su historial/caché permanece separado por `profile_version`; introducir v2 no recalifica sus informes.

## Contrato de ingesta local — fase técnica 2 completada

La fase técnica 1 y el endurecimiento local de payload están implementados. El core y las migraciones `004_scan_payload_guards.sql`/`005_controls_v2_route_coverage.sql` limitan `scope` a las rutas exactas anteriores, exigen incluir `/`, rechazan duplicados y aplican el contrato del perfil seleccionado. Las reglas por control fijan métodos y evidencia estructurada; campos no incluidos en la allowlist se descartan, un campo conocido con tipo/valor inválido se rechaza y `summary`/`limitation` se generan a partir del ID/estado en lugar de persistir texto libre. La suite PostgreSQL aislada posterior a 005 pasó 52/52, 0 omitidas. Esta protección local de integridad de payload y persistencia no implementa un executor seguro ni habilita scans.

| Control    | Método(s) admitido(s)               | Campos de evidencia permitidos                                                                     |
| ---------- | ----------------------------------- | -------------------------------------------------------------------------------------------------- |
| DS-DNS-01  | `DNS` sobre `/`                     | `addressClass` (enum), `aRecordCount` y `aaaaRecordCount` (contadores)                             |
| DS-TLS-01  | `TLS` sobre `/`                     | `protocol` (TLSv1.2/TLSv1.3), `certificateValid` y `hostnameMatches` (booleanos)                   |
| DS-TLS-02  | `TLS` sobre `/`                     | `tls10Accepted`, `tls11Accepted`, `tls12Accepted`, `tls13Accepted` (booleanos)                     |
| DS-HTTP-01 | `HEAD` o `GET` sobre ruta del scope | `statusCode` (HTTP 100–599), `redirectedToHttps` (booleano), `finalScheme` (`http`/`https`)        |
| DS-HDR-01  | `GET` sobre ruta del scope          | `hsts`, `nosniff`, `frameProtection`, `referrerPolicy`, `csp` (booleanos)                          |
| DS-PRIV-01 | `GET` sobre ruta del scope          | `thirdPartyAttempts`, `blockedRequests` (contadores)                                               |
| DS-PRIV-02 | `GET` sobre ruta del scope          | `cookieCount`, `insecureCookieCount`, `thirdPartyCookieCount` (contadores), `inspected` (booleano) |
| DS-PRIV-03 | `GET` sobre ruta del scope          | `mixedContentCount`, `insecureNavigationCount` (contadores)                                        |
| DS-QUAL-01 | `GET` sobre ruta del scope          | `documentStatusCode` (HTTP 100–599), `failedEssentialResourceCount` (contador)                     |

Los predicados implementados para derivar el estado cuando llega `pass` son:

| Control    | Evidencia mínima                                                           | Derivación local de estado                                                                                                               |
| ---------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| DS-DNS-01  | `addressClass`, `aRecordCount`, `aaaaRecordCount`                          | Pasa con `public` y al menos un A/AAAA. `private`/`reserved` aborta admisión; sin valores suficientes da `unknown`.                      |
| DS-TLS-01  | `protocol`, `certificateValid`, `hostnameMatches`                          | Pasa con TLS 1.2/1.3 y ambos `true`; certificado inválido o hostname distinto da `fail`; incompleto da `unknown`.                        |
| DS-TLS-02  | `tls10Accepted`, `tls11Accepted`, `tls12Accepted`, `tls13Accepted`         | TLS 1.0/1.1 aceptado da `fail`; pasa si ambos se rechazan y TLS 1.2 o 1.3 se acepta; en otro caso `unknown`.                             |
| DS-HTTP-01 | `statusCode`, `redirectedToHttps`, `finalScheme`                           | HTTP ≥400, sin redirección HTTPS o esquema final HTTP da `fail`; pasa con 200–399, redirección y esquema HTTPS; incompleto da `unknown`. |
| DS-HDR-01  | `hsts`, `nosniff`, `frameProtection`, `referrerPolicy`, `csp`              | Algún booleano `false` da `fail`; pasa si todos son `true`; incompleto da `unknown`.                                                     |
| DS-PRIV-01 | `thirdPartyAttempts`, `blockedRequests`                                    | Algún intento a tercero da `fail`; pasa si ambos contadores son cero; otros valores dan `unknown`.                                       |
| DS-PRIV-02 | `cookieCount`, `insecureCookieCount`, `thirdPartyCookieCount`, `inspected` | Cookie insegura o de tercero da `fail`; pasa si se inspeccionó y ambos contadores de riesgo son cero; otros valores dan `unknown`.       |
| DS-PRIV-03 | `mixedContentCount`, `insecureNavigationCount`                             | Algún contador >0 da `fail`; pasa si ambos son cero; incompleto da `unknown`.                                                            |
| DS-QUAL-01 | `documentStatusCode`, `failedEssentialResourceCount`                       | Estado ≥400 o recurso esencial fallido da `fail`; pasa con estado 200–399 y cero fallos de recursos; incompleto da `unknown`.            |

El core conserva estados recibidos `fail` y `unknown`; convierte `not_applicable` a `unknown` porque aún no existe contrato auditable de justificación. La DB rechaza `not_applicable` directo. Las reglas de evidencia y predicados semánticos de la matriz anterior se aplican a ambos perfiles. En `controls-v1`, como en el contrato original, la cobertura de los nueve IDs no exige cada combinación control×ruta; la cobertura exacta introducida para `controls-v2` se detalla a continuación.

## `controls-v2`: cobertura exacta por ruta

La migración `005_controls_v2_route_coverage.sql` añade el perfil versionado `controls-v2` con los mismos nueve controles, sin modificar ni recalificar `controls-v1`. El core calcula el conjunto esperado y rechaza checks ausentes, duplicados o fuera del contrato; PostgreSQL registra reglas versionadas en `ds_profile_check_rules` y exige la cobertura completa en la transacción de finalización. La frescura y la caché se particionan por versión del perfil, por lo que un resultado `controls-v1` no satisface una solicitud `controls-v2`.

| Ámbito                 | Cobertura exacta requerida                                                                                         | Checks |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------ | -----: |
| Host, una vez por host | DS-DNS-01 `DNS`, DS-TLS-01 `TLS`, DS-TLS-02 `TLS` (con `targetPath: /`)                                            |      3 |
| Cada ruta del scope    | DS-HTTP-01 `HEAD` y `GET`; DS-HDR-01 `GET`; DS-PRIV-01 `GET`; DS-PRIV-02 `GET`; DS-PRIV-03 `GET`; DS-QUAL-01 `GET` |      7 |

Por tanto, el conjunto completo contiene **10 checks para una ruta, 17 para dos y 24 para tres** (`3 + 7 × número de rutas`). Los tres checks de host se incluyen una sola vez por ejecución; los siete restantes se repiten para cada ruta declarada. La cobertura se exige para cualquier veredicto, no solo para `pass`; `pass` además debe satisfacer los predicados semánticos por control. La cobertura es relativa al scope declarado: un run con solo `/` puede cumplir el contrato v2 respecto a la portada, pero no representa el resto de la superficie de Grumphya. El informe debe hacer visibles las rutas que se midieron.

En `controls-v2`, una respuesta `HEAD` con status 405 o 501 se normaliza a `unknown` cuando la petición sí redirigió a HTTPS y el esquema final es HTTPS. El core deriva `unknown` aunque el payload solicite otro estado, y PostgreSQL solo acepta `unknown` para esa combinación. La regla no declara el control superado. `controls-v1` mantiene su conducta original.

La suite PostgreSQL aislada posterior a migration 005 pasó 52/52, 0 omitidas. Aun así, esta implementación comprueba formato, cobertura y coherencia semántica, no la autenticidad de las observaciones: un worker comprometido podría presentar valores permitidos inventados. La futura frontera confiable del executor debe derivar la evidencia de observaciones reales. No hay probe ni executor, no se realizan solicitudes ni scans y no se ha desplegado o migrado la base productiva. Antes de habilitar ejecución real siguen pendientes DNS/IP pinning, validación en cada conexión/redirección, firewall/egress probado y medición de capacidad del VPS; los umbrales exactos del control HDR siguen requiriendo cierre de rúbrica.

La especificación ejecutable de DS-HDR-01 debe fijar valores mínimos exactos y pruebas antes de activar el perfil; usar como base las guías de [MDN Observatory](https://developer.mozilla.org/en-US/observatory/docs/tests_and_scoring), sin copiar una nota global. En particular, la CSP aplicada de Grumphya actual es más limitada que su CSP Report-Only: el escáner debe reflejarlo fielmente, aunque el primer resultado sea fail. La corrección de Grumphya, si se decide, se tramita como cambio propio y probado; no se rebaja el control para mostrar verde.

Para privacidad estricta, «tercero» significa origen distinto del host evaluado y de alias del titular declarados y revisados. No considerar automáticamente como propio un CNAME que apunte a un proveedor. Las solicitudes a terceros se anotan como intento y se abortan antes de contactarles; por ello el informe puede afirmar «sin intentos observados» o «se intentó contactar», no describir cookies que ese tercero habría enviado. No usar recursos externos del escáner para medir el sitio.

## Señales informativas

security.txt, CAA/DNSSEC, métricas de rendimiento sintético, semántica HTML y reglas automáticas de accesibilidad se muestran como advisory con método y límites. No convertir un resultado de laboratorio en Core Web Vitals reales ni una prueba automática en conformidad WCAG AA. [W3C](https://www.w3.org/WAI/test-evaluate/tools/selecting/) exige revisión humana para aspectos no automatizables.

## Evidencia y copy

Guardar solo tipo de fallo, nombre de cabecera/código, metadatos TLS públicos, ruta sin query y contadores. Nunca guardar HTML, capturas, cuerpos, valores de cookies, tokens o direcciones IP de visitantes. El veredicto público se redacta como «supera/no supera controles observables v1 en la muestra»; incluye «medido desde el VPS de Grumphya» y hora. «No evaluable» y «caducado» tienen visual propio y no conservan color/texto de aprobación. Una búsqueda de dominio ajeno solo produce diagnóstico, no aval del titular ni permiso para mostrar un sello.

No afirmar «certificación oficial», «auditoría independiente», «cumple RGPD», «sin vulnerabilidades» o «sitio accesible WCAG AA». [OWASP ASVS 5.0](https://asvs.owasp.org/) y [Mozilla Observatory](https://developer.mozilla.org/en-US/observatory/docs/faq) dejan claro que las comprobaciones externas no cubren todas las propiedades de una aplicación. La guía de [AEPD](https://www.aepd.es/documento/guia-cookies.pdf) orienta cookies, pero la conformidad legal necesita análisis aparte.
