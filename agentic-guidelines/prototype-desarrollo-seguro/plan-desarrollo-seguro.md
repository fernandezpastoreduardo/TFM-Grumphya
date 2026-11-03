# Desarrollo Seguro: plan de producto y arquitectura

**Fecha:** 3 de noviembre de 2026. **Estado:** la fase técnica local, incluido el perfil aditivo `controls-v3`, está implementada y validada: migration 006 exige `finalScheme=https` antes de permitir `pass` para DS-HDR-01, preservando los criterios históricos de v1/v2. PostgreSQL aislado pasó 62/62, 0 omitidas. El executor/red sigue bloqueado por DNS/IP pinning, firewall/egress y medición de capacidad del VPS. Hay health API, processor con puerto executor y helpers locales, pero faltan probe/conector, executor de red y endpoints de consulta. No se han ejecutado scans reales ni se ha desplegado la nueva aplicación; la migración no se ha aplicado a producción. El estado por componente y las puertas abiertas están en [components.md](components.md) y [operations.md](operations.md).

## 1. Decisión de alcance

La primera fase operativa **sí incluye escaneo real**: grumphya.com inscrito y observado cada hora, y cualquier dominio público admisible consultado bajo demanda desde un buscador. Clic en el sello y búsqueda usan el mismo caché de 60 minutos y el mismo trabajo en cola. La aplicación, API, worker, sonda y datos se separan lógicamente de Grumphya, pero comparten **VPS, dominio grumphya.com, repositorio, Compose/CI y release manual**. [README.md](README.md) define el alcance ejecutable; [execution.md](execution.md) lo ordena para Luna.

El sello y el informe se presentan como **«verificación técnica automatizada de superficies públicas»**. La fuente observable será el propio VPS de Grumphya, identificada como same_vps. No usar «certificación oficial», «auditoría independiente», «cumple RGPD», «sin vulnerabilidades» ni «estándares más altos» como veredicto global. [OWASP ASVS](https://asvs.owasp.org/) incluye controles internos que una sonda pública no puede verificar; [Mozilla Observatory](https://developer.mozilla.org/en-US/observatory/docs/faq) también limita la interpretación de su puntuación. La futura perspectiva de red independiente y la revisión de controles internos se planificarán por separado.

## 2. Punto de partida y evolución

Hoy existe una landing HTML/CSS en `prototype-desarrollo-seguro/` servida bajo `/desarrollo-seguro/`, un sello en el footer de Grumphya, y una ficha React en `/acreditaciones/DS-GRUMPHYA-2026-001` respaldada por `GET /api/accreditations/:id`. El registro antiguo está fijado en código con estado demonstration; no constituye un escaneo. La primera entrega lo conserva como demostración histórica o lo remite al informe operativo, sin mezclar fechas ni estados.

El stack principal es React/Vite, NestJS/TypeScript, PostgreSQL, pnpm, Vitest/Playwright y Docker. Caddy ya ocupa 80/443 en el VPS. La aplicación DS operativa encaja bajo /desarrollo-seguro/app/ y /api/desarrollo-seguro/v1/, con procesos y base lógica propios dentro de la misma infraestructura. Véanse [components.md](components.md), [persistence.md](persistence.md) y [operations.md](operations.md).

## 3. Contrato público y alcance de la afirmación

| Estado                                   | Condición pública                                                                                                                                  |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vigente: cumple controles observables v1 | Escaneo completo del perfil vigente terminado hace menos de 60 minutos, muestra declarada y todos los controles obligatorios aplicables aprobados. |
| Vigente: no cumple                       | Escaneo completo reciente con al menos un obligatorio fallido.                                                                                     |
| No evaluable                             | Fallo de red, cobertura insuficiente, control obligatorio unknown o ejecución incompleta.                                                          |
| En curso                                 | Existe trabajo compartido; el último resultado, si lo hay, aparece histórico y fechado.                                                            |
| Caducado                                 | No hay escaneo completo vigente; ningún aprobado anterior sigue activo.                                                                            |
| Demostración                             | Datos académicos anteriores, separados del informe operativo.                                                                                      |

El informe guarda dominio, perfil y motor versionados, inicio/fin/expiración UTC, origen de la solicitud, fuente same_vps, muestra, controles y evidencia mínima redactada. Cada control tiene URL/ruta, método, estado pass/fail/unknown/not_applicable y límite de interpretación. El historial es inmutable. Un perfil nuevo invalida el caché sin recalificar resultados antiguos. La UI explica que la observación es periódica y que los intervalos entre escaneos no están vigilados.

Una búsqueda pública entrega un **diagnóstico puntual**, no implica que el titular avale el servicio. La monitorización horaria y un eventual sello para otros dominios exigen alta y prueba de control DNS TXT o /.well-known/ sin script. grumphya.com será el primer caso dado de alta. La titularidad y el veredicto son hechos distintos.

## 4. Perfil de observación v1

La muestra de grumphya.com se fija y publica: portada HTTPS y hasta dos rutas públicas relevantes. La búsqueda de un dominio ajeno se limita inicialmente a la portada. Solo se usan GET/HEAD, DNS, TLS y un navegador limpio y efímero sin consentimiento. No hay credenciales, formularios, fuzzing ni exploración de áreas privadas. [controls-and-evidence.md](controls-and-evidence.md) detalla cada control y su evidencia.

| Bloque                | Observación v1                                                                                                     | Límite                                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Transporte            | DNS público, certificado TLS, HTTPS/redirección, ausencia de downgrade y mixed content en la muestra.              | No demuestra la seguridad de todos los clientes y rutas.                                                                       |
| Seguridad web         | HSTS, CSP, anti-embed, nosniff, política de referente y atributos de cookies cuando aparezcan.                     | No prueba autorización, inyección ni gestión interna de secretos.                                                              |
| Privacidad observable | Solicitudes a terceros, cookies y almacenamiento en un contexto limpio; intentos externos detectados y bloqueados. | No equivale a una revisión legal de tratamientos o políticas.                                                                  |
| Calidad básica        | Disponibilidad, recursos esenciales y comprobaciones automáticas de accesibilidad/enlaces de la muestra.           | La automatización no certifica WCAG; [W3C](https://www.w3.org/WAI/test-evaluate/tools/selecting/) exige evaluación más amplia. |

Los indicadores no decisorios (security.txt, CAA/DNSSEC, rendimiento de laboratorio y tendencias) se distinguen del sello. Un hallazgo dudoso se marca unknown, se revisa y se explica; no se baja la regla para fabricar un pass. La [guía de cookies de AEPD](https://www.aepd.es/documento/guia-cookies.pdf) orienta la revisión, pero la afirmación jurídica necesita estudio propio.

## 5. Mecánica horaria y experiencia

1. El scheduler solicita cada 60 minutos un nuevo trabajo para grumphya.com inscrito/verificado, según completed_at del último resultado completo. No programa dominios buscados una sola vez.
2. Al hacer clic en el sello o enviar una búsqueda, la API devuelve el informe completo del perfil vigente si tiene menos de 60 minutos. En otro caso, admite un trabajo único por dominio+perfil y responde 202 mientras se ejecuta.
3. La web muestra el estado en curso y consulta el trabajo. Si falla o caduca, conserva el último informe solo como histórico y muestra no evaluable/caducado. Nunca prolonga un aprobado.
4. El cálculo se hace en servidor con reloj UTC. Cambiar perfil invalida frescura anterior. El resultado declara exactamente las URLs evaluadas.
5. El sello en Grumphya es enlace e imagen local neutral, sin JS, iframe, recurso tercero ni cookie. Cargar Grumphya no inicia una consulta al escáner; el clic sí. El informe y la búsqueda están bajo el mismo origen y tienen su información de privacidad operativa.

Un escaneo externo de bajo impacto envía peticiones HTTP normales y puede quedar en logs del sitio objetivo. No es un análisis puramente pasivo. Para grumphya.com, la sonda se ejecuta desde el mismo VPS; incluso si llega al IP público, no ofrece independencia de red.

## 6. Arquitectura y protección

```text
Sello local / buscador DS ──> Caddy + Nginx / DS web
                                      │
                                  DS API
                                      │
                     base lógica DS en PostgreSQL compartido
                                      │
                             cola + scheduler + worker
                                      │
                              probe efímero sin secretos
                                      │
                        conector de salida + egress filtrado
                                      │
                              dominios públicos 80/443
```

Aceptar solo hostnames normalizados, validar DNS A/AAAA y el destino de cada conexión/redirección, fijar IP manteniendo Host/SNI, y bloquear rangos internos, metadata, puertos no autorizados y rebinding. El conector y el firewall deben funcionar como capas independientes. Limitar tiempo, bytes, páginas, redirecciones, tasa y concurrencia; respetar robots para rutas; identificar el agente. [scanner-safety.md](scanner-safety.md) fija el modelo de amenazas y pruebas. La infraestructura compartida requiere prueba real de capacidad antes de publicar búsquedas arbitrarias. Un fallo de esta puerta impide la apertura pública del escáner.

## 7. Entregas y fase independiente posterior

| Fase                           | Entrega                                                                                                                                                                                                                                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0. Contrato y seguridad        | Perfil versionado, estados, amenazas, fixtures, límites y presupuesto de capacidad.                                                                                                                                                                                                                           |
| 1. Núcleo operativo compartido | Componentes DS, base lógica/roles propios, sonda segura, API, web, sello, caché/cola/scheduler horario para grumphya.com, tests y observabilidad.                                                                                                                                                             |
| 2. Activación gradual          | Escaneos reales y varios ciclos horarios, revisión de falsos positivos, carga del VPS, smoke, backup/restore y publicación bajo workflow manual vigente.                                                                                                                                                      |
| 3. Proyecto independiente      | Cuando exista dominio y decisión de inversión: repo, despliegue, contenedor(es), persistencia/backup propios, nuevo hostname en Caddy y migración de informes si conviene. Obtener una sonda en otro emplazamiento si se quiere afirmar independencia de red; otro dominio en el mismo VPS no la proporciona. |
| 4. Garantía ampliada opcional  | Evidencias internas voluntarias, revisión humana ASVS/WCAG/privacidad, apelaciones y renovación.                                                                                                                                                                                                              |

No hay presupuesto cerrado hasta medir capacidad, coste del dominio e infraestructura futura. El plan de pruebas de la fase 1 está en [test-plan.md](test-plan.md). El despliegue productivo sigue siendo manual y requiere la aprobación del workflow actual; este plan documental no lo ejecuta.
