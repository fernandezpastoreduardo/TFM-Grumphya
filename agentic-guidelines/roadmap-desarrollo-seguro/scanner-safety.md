# Seguridad del escáner y protección del VPS

## Estado actual de la frontera de red

La sonda y el conector de salida todavía no están implementados. El processor solo acepta un `ScanExecutor` inyectado; no hay ejecución de red ni se deben habilitar scans. La API standalone escucha actualmente en `0.0.0.0:3001`; no está conectada a Compose ni publicada, y **no debe arrancarse en el VPS**. Antes de integrarla, limitarla a una red interna sin puerto de host y enrutar acceso solo desde Caddy. La validación de hostname del core no es una defensa SSRF completa: el aislamiento/filtrado de egress descrito a continuación aún debe implementarse y probarse.

## Modelo de amenaza

El buscador público permite que un atacante proponga hostnames y que un proceso del VPS haga solicitudes. Eso crea riesgo de SSRF, acceso a PostgreSQL/API internos, metadatos del proveedor, DNS rebinding, redirecciones, agotamiento de CPU/RAM/disco, abuso contra terceros y fuga de datos del sitio escaneado. El worker comparte host físico con Grumphya: un fallo grave puede afectar ambos servicios. La fase operativa no se abre al público hasta pasar los controles de esta página. Referencia: [OWASP SSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html).

## Fronteras de procesos y red

La arquitectura objetivo no expone API ni worker en puertos públicos. El worker controla trabajos y almacena resultados, pero la navegación de páginas debe correr en un **probe sin credenciales de base**, sin secretos de Grumphya, sin Docker socket, sin montajes del host y sin privilegios. El probe solo podrá alcanzar un conector de salida controlado. Ese conector resolverá el hostname, validará A/AAAA, fijará la IP al socket y conservará Host/SNI y validación TLS. La política de egress del host debe bloquear cualquier salida directa desde probe/worker hacia loopback, redes Docker, RFC1918, link-local, metadatos, ULA IPv6 y otros rangos no públicos. La red interna de la base será solo alcanzable por API/worker mediante credenciales Desarrollo Seguro; probe/conector no la alcanzarán. Si no se puede aplicar una política equivalente para IPv6, deshabilitar IPv6 en el probe hasta resolverlo.

No confiar solo en un regex o en una consulta DNS previa: volver a validar en cada conexión, reintento y redirección para impedir TOCTOU/rebinding. Rechazar IP literales, URL con credenciales, puertos arbitrarios, esquemas distintos de HTTP/HTTPS y hostnames locales/reservados. Limitar redirecciones al mismo hostname; otro host solo si es alias declarado del dominio inscrito y se revalida. El propio IP público del VPS se permite únicamente para grumphya.com/alias declarado en 80/443; otro hostname que apunte a ese IP se rechaza. Si el acceso al IP público desde el mismo VPS no funciona, registrar unknown y resolver la topología; nunca sustituirlo silenciosamente por acceso a contenedor o 127.0.0.1.

El navegador usa el conector de salida para **todas** sus solicitudes. Una política de firewall impide que lo evite. Los intentos de terceros se capturan y abortan; no se contacta a sus servidores. No ejecutar formularios, POST, mutaciones, fuzzing, scripts propios persistidos en el objetivo ni herramientas DAST activas. El navegador ejecuta JavaScript público del sitio como un visitante normal, en contexto efímero sin credenciales y con límites. No deja scripts ni cookies en Grumphya. [RFC 9110](https://datatracker.ietf.org/doc/html/rfc9110) describe HEAD/GET como métodos seguros, aunque una web mal construida puede tener efectos secundarios; por eso la muestra evita enlaces con acciones.

## Presupuesto inicial de trabajo

Una ejecución activa global al principio; un scan por dominio a la vez; máximo tres rutas del dominio inscrito y una ruta para diagnóstico ajeno. Fijar límites de tiempo total, número de solicitudes, redirecciones, bytes, tamaño de documento, memoria y procesos en configuración versionada, con valores conservadores medidos en CI y en el VPS. El worker tiene límite de CPU/memoria/pids y no puede hacer crecer el almacenamiento sin límite. Se aplica cuota por IP en memoria con ventana corta y cuota por dominio/global en PostgreSQL; no guardar IP de visitantes en informes. Añadir cola máxima, Retry-After y circuit breaker si Grumphya/DB se degradan.

Antes de seguir enlaces o rutas declaradas, consultar robots.txt y respetar bloqueos. User-Agent identifica Desarrollo Seguro y ofrece URL/contacto; no fingir ser navegador humano. Ofrecer opt-out administrativo de dominios ajenos. La búsqueda no autoriza escanear subdominios, puertos, APIs ni rutas privadas.

## Pruebas de bloqueo

Antes de conectar el executor de fase 2 con la persistencia, imponer una allowlist estricta de scope, paths/métodos, IDs de control, campos de evidence y formato de summaries. Normalizar/rechazar paths con host, query, fragmento o escapes del scope. Redactar secretos, cookies, cabeceras sensibles, HTML y datos personales antes de almacenar; el límite de tamaño/estructura de la rutina SQL no es redacción. Probar entradas adversarias en la frontera de ingesta y confirmar que ninguna evidencia cruda llega a PostgreSQL.

El conjunto adversario incluye IPv4/IPv6 internas, 127.0.0.1, ::1, metadatos, CNAME a privado, rebinding tras validación, redirección a privado, redirección a host distinto, puertos 22/5432/3000, respuesta infinita, compresión explosiva, HTML con recursos terceros y navegación JavaScript hacia IP interna. Probar a nivel de conector y en una red Docker de integración: ni un paquete llega al servicio señuelo interno. Verificar que probe no puede leer secretos ni conectar a la DB de Grumphya. Si cualquiera falla, deshabilitar escaneo arbitrario y no publicar un pass de privacidad incompleto.
