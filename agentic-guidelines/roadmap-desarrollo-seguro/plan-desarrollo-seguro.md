# Desarrollo Seguro: plan de producto y arquitectura

**Fecha:** 2 de noviembre de 2026. **Estado:** propuesta para valorar; no se ha adquirido `desarrolloseguro.com` ni se ha desplegado este servicio.

## 1. Decisión propuesta

Construir primero un **prototipo funcional dentro de TFM-Grumphya** que compruebe `grumphya.com` cada hora y permita consultar dominios públicos. Diseñar el motor, sus datos y la API como un módulo separable. En una fase posterior, extraerlo a un repositorio, base de datos, contenedores y despliegue propios en `desarrolloseguro.com`, compartiendo únicamente el VPS y el proxy HTTPS de entrada.

El resultado público debe denominarse **«verificación externa periódica»** y mostrar exactamente qué se observó, cuándo y en qué páginas. «Certificado seguro», «cumple RGPD» o «sin vulnerabilidades» serían afirmaciones que un escaneo externo no puede sostener. [OWASP ASVS 5.0](https://asvs.owasp.org/) abarca controles internos, y [Mozilla Observatory](https://developer.mozilla.org/en-US/observatory/docs/faq) advierte que incluso su máxima nota no prueba seguridad completa.

## 2. Punto de partida comprobado

Este proyecto corresponde al repositorio [TFM-Grumphya](https://github.com/fernandezpastoreduardo/TFM-Grumphya). Allí hay un [prototipo HTML/CSS bajo `/desarrollo-seguro/`](https://github.com/fernandezpastoreduardo/TFM-Grumphya/blob/main/doc/desarrollo-seguro.md), un sello en el pie de Grumphya y una ficha React en `/acreditaciones/DS-GRUMPHYA-2026-001`. La ficha consulta `GET /api/accreditations/DS-GRUMPHYA-2026-001`; el registro está [fijado en código con estado `demonstration`](https://github.com/fernandezpastoreduardo/TFM-Grumphya/blob/main/apps/api/src/verify-accreditation/get-accreditation.service.ts). No existen hoy escaneo, buscador de dominios, caducidad horaria ni persistencia de resultados.

La aplicación usa React/Vite, NestJS/TypeScript, PostgreSQL, pnpm, Vitest, Playwright y Docker. Su [Compose de producción](https://github.com/fernandezpastoreduardo/TFM-Grumphya/blob/main/compose.production.yaml) ya incluye Caddy en 80/443. La futura aplicación deberá integrarse en ese proxy por nombre de dominio; no podrá publicar otro 80/443 en el mismo host.

## 3. Contrato público de verificación

| Estado                                       | Significado público                                                                                                    |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Vigente: cumple controles observables v1** | Último escaneo completo, perfil v1, hace menos de 60 minutos, todos los controles obligatorios evaluables y aprobados. |
| **Vigente: no cumple**                       | Escaneo completo reciente con al menos un control obligatorio fallido.                                                 |
| **No evaluable**                             | Error de red, bloqueo, cobertura insuficiente o control obligatorio sin evidencia; nunca equivale a aprobado.          |
| **En curso**                                 | Se ha iniciado un escaneo; se ve el último resultado, fechado y claramente etiquetado como histórico.                  |
| **Caducado**                                 | No existe escaneo completo válido en los últimos 60 minutos; se retira la afirmación de vigencia.                      |
| **Demostración**                             | Datos simulados del TFM; no confundir con una verificación real.                                                       |

Cada ejecución guarda `domain`, `profile_version`, `started_at`, `completed_at`, `expires_at`, resultado, lista de controles y versión del motor. Cada control conserva identificador, URL/host y método probados, evidencia mínima redactada, resultado `pass/fail/unknown/not_applicable`, severidad y límite de interpretación. El historial es inmutable; un cambio de reglas crea otra versión de perfil y no recalifica retrospectivamente resultados viejos. La ficha muestra hora UTC y hora local, antigüedad, alcance y causas concretas. No promedia resultados desconocidos como aprobados.

**Titularidad:** buscar cualquier dominio público genera un **diagnóstico abierto**, nunca un aval del titular. Para publicar el sello en un sitio se exige alta y prueba de control del dominio mediante DNS TXT o archivo `/.well-known/` sin JavaScript. `grumphya.com` puede ser el primer dominio dado de alta. La titularidad y la conformidad son hechos distintos.

## 4. Controles del perfil v1

La muestra inicial se fija por dominio: página principal HTTPS, rutas públicas principales declaradas por el titular y, cuando sea razonable, una ruta de autenticación pública. Cada ficha enumera esas rutas. No se rastrea todo el sitio ni se accede a sesiones privadas.

| Bloque                    | Controles horarios obligatorios                                                                                                                                                                                        | Qué demuestra y qué no                                                                                                                                                                                    |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Transporte**            | DNS público resoluble; HTTPS con certificado válido para el host; redirección HTTP→HTTPS sin degradación; TLS bajo un perfil versionado; recursos de la muestra sin HTTP inseguro.                                     | Configuración observada desde el escáner en ese momento; no prueba todos los trayectos o clientes.                                                                                                        |
| **Seguridad web**         | HSTS; CSP con reglas aplicables; protección frente a embebido; `X-Content-Type-Options`; política de referente; atributos `Secure`, `HttpOnly` y `SameSite` de cookies propias cuando procedan.                        | Cabeceras y cookies observadas; no prueba autorización, inyección, almacenamiento de contraseñas ni ausencia de vulnerabilidades.                                                                         |
| **Privacidad observable** | Navegador limpio, sin consentimiento; registrar solicitudes a terceros y almacenamiento/cookies en las rutas muestreadas. Perfil estricto: ninguna solicitud a terceros ni cookie de terceros antes de consentimiento. | «No se observaron terceros en la muestra», nunca «no hay terceros en todo el producto». Las solicitudes detectadas se bloquean después de registrarse para no contactar a esos terceros desde el escáner. |
| **Calidad básica**        | Disponibilidad y respuesta correcta de páginas muestreadas; recursos esenciales sin error; comprobaciones automáticas de accesibilidad y enlaces principales.                                                          | Observación sintética; no representa experiencia real de usuarios ni conformidad WCAG completa.                                                                                                           |

Indicadores adicionales, **sin decidir el sello v1**: `security.txt`, DNS CAA/DNSSEC si aplican, rendimiento de laboratorio y tendencias, y más pruebas automáticas de accesibilidad. Mantenerlos separados evita convertir configuraciones opcionales o mediciones ruidosas en una falsa garantía. La [W3C](https://www.w3.org/WAI/test-evaluate/tools/selecting/) explica que las herramientas automáticas no determinan por sí solas la accesibilidad. La guía de la [AEPD](https://www.aepd.es/documento/guia-cookies.pdf) sirve para orientar la revisión de cookies, pero la conformidad legal requiere análisis del tratamiento real.

Un nivel futuro, sujeto a consentimiento y revisión humana, podrá recibir evidencias del titular sobre OWASP ASVS, dependencias, control de acceso, backups, procesos de privacidad y accesibilidad. Esas evidencias llevarán fecha, autor y método de revisión; no se mezclarán con los controles horarios externos.

## 5. Mecánica de la hora y experiencia del sello

1. El planificador encola un nuevo escaneo de cada dominio **registrado y verificado** cuando se cumplen 60 minutos desde el último resultado completo. La consulta de cualquier dominio público también puede iniciar uno, con cuota y límites de uso.
2. Al abrir el sello o buscar un dominio, si hay un resultado completo del perfil vigente con menos de 60 minutos, se devuelve ese resultado sin volver a escanear. Si no lo hay, se encola inmediatamente un escaneo; solicitudes simultáneas comparten el mismo trabajo.
3. La página muestra «escaneando» y actualiza el resultado al terminar. Si el trabajo tarda más que una petición web, la API devuelve `202` y la página consulta su estado. Si falla, queda «no evaluable» o «caducado», con el último resultado histórico fechado; jamás se mantiene un aprobado vigente por una caída del escáner.
4. El contador de 60 minutos se calcula desde `completed_at` del último escaneo válido. Un cambio de versión del perfil invalida el caché anterior. Las horas de ejecución y expiración se guardan en UTC.
5. La periodicidad es una **observación cada hora**, no vigilancia continua. El informe explica el intervalo entre mediciones.

Para la fase futura, el sello en Grumphya será un **SVG local y un enlace HTML normal** a `https://desarrolloseguro.com/d/grumphya.com`, con `rel="noreferrer noopener"` y `referrerpolicy="no-referrer"`. Texto recomendado: «Consultar verificación externa». No se insertan imagen, iframe, script, píxel, fuente ni `preconnect` servidos desde Desarrollo Seguro. Así, cargar Grumphya no causa petición alguna a ese tercero; el visitante solo contacta el nuevo sitio cuando decide abrirlo. Desarrollo Seguro tendrá su propia información de privacidad y registros mínimos. Se debe revisar el texto vigente de la política de Grumphya antes de afirmar que no requiere actualización jurídica.

## 6. Arquitectura y seguridad del escáner

```text
Grumphya: SVG y enlace local ── clic ──> Desarrollo Seguro (web)
                                             │
                                   API de consulta / búsqueda
                                             │
                                       PostgreSQL propio
                                             │
                                    cola + planificador
                                             │
                                  worker aislado de escaneo
                                             │ GET/HEAD, DNS, TLS,
                                             │ navegador efímero
                                             └──> sitios públicos
```

**Motor:** aceptar solo un hostname normalizado (IDNA); no aceptar URLs arbitrarias, IP literales, credenciales, puertos, fragmentos ni rutas proporcionadas por visitantes. Resolver A/AAAA y bloquear direcciones no públicas, loopback, red privada, enlace local, multicast y metadatos. Conectar a la IP validada conservando Host/SNI, y volver a validar cada redirección, reintento y resolución para impedir DNS rebinding. Solo 80/443 y `GET`/`HEAD`; sin formularios, credenciales, fuzzing, payloads, fuerza bruta, búsquedas de rutas ocultas ni ZAP activo. Añadir protección de salida por red, límites de redirecciones, bytes, tiempo, URLs, tasa por IP/dominio y concurrencia. Respetar `robots.txt` para el rastreo de rutas y ofrecer identificación y contacto del escáner. Es un escaneo **externo de bajo impacto**, no puramente pasivo: las solicitudes HTTP sí llegan al sitio y generan sus logs habituales. [OWASP SSRF](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html) · [RFC 9110](https://datatracker.ietf.org/doc/html/rfc9110) · [RFC 9309](https://datatracker.ietf.org/doc/html/rfc9309)

**Procesos:** web React/Vite y API NestJS; planificador y worker TypeScript en procesos/contenedores separados; PostgreSQL 17 para resultados y cola transaccional con lease, deduplicación por dominio+perfil y recuperación de trabajos interrumpidos. No hace falta pgvector ni IA para los controles v1. Guardar solo fragmentos de evidencia necesarios, sin cuerpo completo de páginas ni datos personales obtenidos accidentalmente. Establecer retención y borrado de diagnósticos públicos; logs de acceso con IP truncada o retención corta según necesidad operativa.

**Mismo VPS:** un solo Caddy publica 80/443 y enruta ambos nombres; cada aplicación conserva su red, secretos, usuario de base, volúmenes, backups y despliegue. El worker no recibe Docker socket ni acceso a la red de Grumphya o del host; solo alcanza su propia cola/base y los destinos públicos permitidos. Darle límites de CPU, memoria y procesos y solo una navegación concurrente inicial. En un VPS de 2 vCPU/4 GB, medir memoria, CPU y latencia de Grumphya bajo carga antes de activar el navegador horario. Si no cabe con margen, reducir dominios admitidos o mover el worker fuera del VPS: el requisito de mismo VPS queda condicionado por esa prueba. [Caddy HTTPS](https://caddyserver.com/docs/automatic-https) · [Docker resource constraints](https://docs.docker.com/engine/containers/resource_constraints/)

## 7. Bundle de trabajo por fases

| Fase y entrega                                | Componentes / criterio de aceptación                                                                                                                                                                                                                                           | Esfuerzo orientativo* |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------: |
| **0. Contrato verificable**                   | Perfil v1 versionado, matriz de controles, alcance de páginas, estados, método de titularidad, modelo de datos y amenaza SSRF documentados.                                                                                                                                    |          2–4 jornadas |
| **1. Prototipo funcional TFM**                | Reemplazar `demonstration` por resultados reales para Grumphya en una ficha claramente etiquetada; buscador de dominios públicos; API y tablas separables; worker Docker; escaneo programado y bajo demanda con caché de 60 min; historial, errores y sello local neutral.     |        12–20 jornadas |
| **2. Endurecimiento y validación**            | TDD de reglas y seguridad; pruebas de navegador sobre páginas públicas; carga y consumo en VPS; protección SSRF en redirección/DNS; revisión de falsos positivos; observabilidad y recuperación. El TFM debe demostrar un fallo y un éxito reales, no solo capturas estáticas. |         6–10 jornadas |
| **3. Proyecto independiente futuro**          | Extraer código sin reescribir el motor; repo y CI/CD propios; web/API/worker/DB/volúmenes/backups independientes; nuevo dominio y Caddy por hostname; migrar historial si aporta valor; cambiar enlace del sello y retirar o redirigir la demo antigua.                        |         8–15 jornadas |
| **4. Programa de garantía ampliada opcional** | Prueba de titularidad a escala, evidencias internas voluntarias, revisión humana ASVS/WCAG/privacidad, procedimiento de apelación y renovación.                                                                                                                                | Se presupuesta aparte |

\*Rangos de planificación para una persona familiarizada con el stack; **no son un presupuesto cerrado**. La fase 1 contiene un escáner real, no solo una maqueta. El dominio, capacidad adicional, almacenamiento de backups y revisión especializada son costes futuros no contratados. Antes de la fase 3 hay que medir el margen real del VPS y verificar disponibilidad/precio del dominio.

## 8. TDD y pruebas que bloquean la entrega

- Reloj inyectable: resultado con 59:59 min se reutiliza; a 60:00 se genera un solo trabajo; cambio de perfil invalida el caché; solicitudes concurrentes no duplican escaneos.
- Fallo crítico → `no cumple`; control obligatorio desconocido → `no evaluable`; timeout o worker caído → aprobado anterior caducado y nunca presentado como vigente.
- DNS privado, IPv6 interna, redirección a `localhost`, metadata y DNS rebinding se rechazan antes de conectar; los límites de bytes y tiempo detienen respuestas maliciosas.
- Navegador limpio: registrar intento de petición externa, cookie de tercero, HTTP mixto y cookies propias inseguras en fixtures de prueba; no cargar scripts de terceros reales durante la suite.
- Integración con PostgreSQL: leases, reintentos, recuperación tras reinicio, historial inmutable y versión de reglas. E2E de búsqueda, ficha, enlace de sello y estados de carga/error.
- Despliegue: ambos dominios responden con certificados correctos; API/DB/worker no tienen puertos públicos; reiniciar o desplegar Desarrollo Seguro no altera datos ni disponibilidad de Grumphya; restaurar backup de la base nueva en aislamiento.

**Puerta para continuar a fase 3:** resultados reales estables durante al menos varios ciclos horarios, carga aceptable en el VPS, interpretación de hallazgos revisada y texto del sello aprobado como descripción fiel del alcance.
