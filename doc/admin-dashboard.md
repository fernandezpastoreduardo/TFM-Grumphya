# Panel de administración

El hero de `/panel-control` usa el SVG transparente optimizado
`admin-dashboard-audit.svg` (900 × 900 px, 73.585 B):
Grumphya examina gráficas con una lupa para representar la revisión de métricas
y datos operativos.

## Acceso y rutas

`/panel-control` presenta el panel de Jappy. El enlace aparece en Home y en la
navegación de las páginas de sección solo cuando el perfil consultado por la
sesión tiene rol `admin`. Tras iniciar sesión como Jappy se abre esta ruta; las
rutas `/login` y `/crear-cuenta` también lo redirigen aquí. Un visitante que
abre directamente `/panel-control` va a `/login`, y una cuenta normal va a
`/perfil`. El enlace «Mi cuenta» conserva `/perfil` y muestra los datos
personales también para Jappy.

La API protege `GET /api/admin/dashboard`,
`GET /api/admin/application-errors/:eventId` y
`GET /api/admin/contact-messages` con access token y una comprobación del rol
vigente en PostgreSQL en cada solicitud. Sin sesión responden 401 y una cuenta
sin rol admin recibe 403. Ocultar la ruta o el enlace en el frontend no sustituye
esta autorización.

## Cuenta local Jappy

El alias `jappy` se reserva para la cuenta administradora; el registro público
lo rechaza sin distinguir mayúsculas y minúsculas. Crea la cuenta mediante el
comando explícito `provision-admin`; repetirlo no cambia una contraseña ya
guardada. Para una contraseña nueva, ejecuta el comando explícito
`change-admin-password`, que sustituye el hash y revoca las sesiones activas.
La contraseña debe tener entre 12 y 128 caracteres, con mayúscula, minúscula,
número y carácter especial. Se guarda como hash bcrypt cost 12 con prehash
SHA-256, igual que las contraseñas nuevas de las cuentas; nunca se guarda
cifrada ni en texto claro.

En desarrollo, los comandos se ejecutan con los valores de `.env.docker` y
`.env`; en producción, se usa el contenedor temporal `admin-provision` y el
archivo separado `admin_settings`. El arranque normal de la API no lee
`ADMIN_PASSWORD`, no modifica el hash y no revoca sesiones. Consulta
[`development.md`](development.md) y [`production.md`](production.md) para los
comandos de cada entorno.

## Datos del panel

- Ingresos simulados: total y semana actual en EUR, derivados de compras
  confirmadas. La migración `034_illuminado_price_retroactive.sql` reexpresa
  todos los importes históricos de Iluminado a 3 € para reflejar el precio
  vigente también en los KPI anteriores; no cambia la vigencia de ninguna
  suscripción. No representan cobros ni contabilidad real.
- Coste de IA: estimación calculada en USD a partir de los tokens reportados
  por llamadas completadas a proveedores instrumentados; el panel la convierte
  y presenta en EUR con el tipo BCE fijo descrito abajo. Para `gpt-5.4-mini`,
  los tokens de entrada cacheados usan la tarifa reducida oficial (0,075 USD por
  millón frente a 0,75 USD por millón sin caché); la migración `035` empieza a
  conservar ese contador. Eventos anteriores a `035` no guardan la separación y
  mantienen su estimación antigua, sin posibilidad de recalcularlos fielmente.
  Esta cifra no es la factura de OpenAI; el gasto confirmado en su consola es la
  referencia para conciliarla. La semana empieza el lunes en
  `Europe/Madrid`. El histórico comienza con la migración `023`; no hay
  reconstrucción de llamadas anteriores. El gráfico muestra las últimas ocho
  semanas. El total y el gráfico incluyen a usuarios registrados, Jappy y
  visitantes sin cuenta, con desglose por origen.
  El promedio por cuenta incluye el gasto histórico atribuido a cuentas user y
  admin y lo divide entre las cuentas de ambos roles que están activas ahora.
  Por ello, el gasto previo de una cuenta eliminada permanece en el numerador,
  pero esa cuenta ya no forma parte del denominador actual.
  Los visitantes sin cuenta se incluyen en el gasto y se desglosan aparte, pero
  no en el promedio por cuenta porque no hay una cuenta que permita definir un
  denominador individual. La migración `024` guarda el tipo de actor en cada
  evento para conservar la atribución tras borrar una cuenta. Los eventos
  antiguos cuyo `user_id` ya era nulo se clasifican como anónimos porque no hay
  datos para atribuirlos retrospectivamente. Los modelos sin tarifa registrada
  aparecen como usos sin precio y no suman al importe estimado. La telemetría
  de IA se purga a los 12 meses mediante `DataRetentionService`.
- **Coste máximo iluminado** y **Coste máximo faltón**: son proyecciones por
  **una cuenta**, no un techo contractual ni el gasto total de todas las
  cuentas. Para cada plan se obtiene la media de `estimated_cost_usd` de las
  llamadas con precio de usuarios registrados: `idea_evaluation` para
  Iluminado y `roast` para Faltón. Cada importe del evento ya incluye los tokens
  de entrada y salida de esa llamada; no se suman otra vez. La fórmula es
  `media por intento × 11 intentos/día × 30 días/mes`. No se incluyen llamadas
  de Jappy, visitantes ni operaciones auxiliares como embeddings o búsqueda de
  similitud. Tampoco se presupone que todos los usuarios agoten su cupo. Si no
  hay llamadas con precio para un plan, el panel muestra «Sin usos con precio
  registrado» en vez de cero. La media refleja solo los eventos disponibles
  en el histórico retenido, actualmente hasta 12 meses.
- **Usuarios activos por plan**: el gráfico de las últimas ocho semanas cuenta
  usuarios distintos por plan cuya suscripción Iluminado o Faltón se solapó con
  algún momento de cada semana natural de `Europe/Madrid`. Considera filas
  `active` y `expired`; excluye `cancelled`, pues no se guarda la fecha de
  cancelación para reconstruir su vigencia histórica. Una persona con ambos
  planes puede figurar en ambas series. «Activo» describe la vigencia del plan
  durante la semana, aunque no haya usado la aplicación; no son usuarios
  activos diarios ni sesiones. La semana en curso se observa solo hasta ahora.
  En escritorio aparece a la izquierda de «¿Quién genera el gasto?» y en móvil
  se apilan. La tabla desplegable ofrece las cifras exactas por semana.
- **Ingresos y gastos del año**: la gráfica mensual empieza en enero del año
  actual y termina en el mes en curso, según `Europe/Madrid`. Los ingresos son
  la suma de `simulated_purchases.amount_eur` con estado `confirmed`; no son
  cobros reales. Los gastos suman todos los eventos de IA con coste estimado
  disponible, sin filtrar por actor ni operación, más 12 € de hosting por cada
  mes desde octubre de 2026. El mes actual también incluye los 12 € completos:
  no hay prorrateo. Los costes de IA se convierten de USD a EUR con una
  referencia **fija** del [BCE del 27 de octubre de 2026](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html):
  `1 EUR = 1,1150 USD`, por lo que `USD × (1 / 1,1150) = EUR`. No es el tipo
  aplicado por el proveedor y habrá que actualizarlo manualmente si se quiere
  una estimación con otra fecha. El resultado acumulado hasta hoy es
  `Σ ingresos mensuales − Σ gastos mensuales` y se muestra con signo en EUR.
  La tabla desplegable contiene los importes de cada mes. Los eventos sin
  tarifa quedan fuera; además, faltan gastos como dominio, IVA, correo y copias.
  Por tanto, la curva y el balance son una simulación parcial, no contabilidad
  ni facturación efectiva. Antes de la migración `023` no hay telemetría de IA,
  y los eventos con más de 12 meses se purgan; eso limita los años históricos.
- Errores: solo errores de servidor HTTP 5xx, agrupados por código y diagnóstico
  seguro. Las respuestas 4xx esperables —por ejemplo 401, 403, 404 y 429— no se
  cuentan. La tabla muestra conteo semanal y total, fecha de la última
  ocurrencia y el diagnóstico específico. Cada denominación enlaza al evento
  más reciente del grupo y abre el detalle en otra pestaña. El detalle muestra
  solo estado HTTP, fecha y diagnóstico; no expone texto de ideas ni contexto
  de entrada, incluidos los registros históricos.
- Los errores 5xx ya no guardan contexto de solicitud: el registro de nuevos
  eventos conserva el código y el diagnóstico seguro, pero no payloads, rutas,
  credenciales, mensajes de excepción ni texto de ideas. La columna histórica
  `context_json` permanece en el esquema, pero la migración
  `036_redact_application_error_context.sql` pone a `NULL` todos sus valores
  existentes. La migración no modifica copias de seguridad históricas. Los
  eventos se purgan a los 30 días y las métricas de IA a los 12 meses mediante
  `DataRetentionService`; verificar la ejecución efectiva en producción.

En pantallas estrechas, el panel reduce el relleno de las tarjetas y apila los
desgloses de coste. Las tablas conservan un ancho mínimo y se desplazan dentro
de su propio contenedor para evitar ensanchar la página.

En modo oscuro, `AdminErrorDetail` mantiene tinta oscura sobre su tarjeta clara
y enlaces teal legibles para conservar el contraste.

## Pestañas de análisis

El panel `/panel-control` organiza el resumen y los mensajes de contacto en la
pestaña **Resumen**, y añade tres vistas informativas de operación:

- **Benchmark de evaluaciones y prompts** explica el corpus sintético y la
  estructura de un informe posible: política y fecha, número de casos y
  variantes, acuerdo con las etiquetas y consistencia de estado/motivo. Esta
  pestaña no ofrece un comando para ejecutarlo ni está conectada a resultados o
  historial de ejecuciones; el informe es una explicación de formato, no un
  resultado del sistema.
- **Telemetría de operaciones de IA** muestra coste agregado y eventos sin
  tarifa. La tabla de actividad reciente cubre las últimas 24 horas y agrupa
  por hora, operación (`idea_evaluation` o `roast`) y modelo; muestra número de
  usos y los volúmenes de tokens de entrada/cacheados/salida en rangos, no en
  recuentos exactos: menos de 1.000; de 1.000 a menos de 5.000; de 5.000 a
  menos de 20.000; y 20.000 o más. También muestra el coste estimado, hasta
  100 grupos. Oculta los grupos con menos de tres usos.
  No incluye ideas, IDs de evento, actor, cuenta, IP ni sesión. Los eventos
  estructurados de stdout incluyen operación, modelo, resultado, latencia,
  tokens disponibles y coste estimado; las etiquetas se limitan a valores
  seguros y no se emite identificador por llamada. Las líneas no incluyen
  ideas, mensajes, cuenta, IP, token de sesión ni clave API. La tabla
  privada de consumo persiste tokens y coste por operación/modelo y puede asociar una
  cuenta para calcular promedios; la vista reciente no expone esos datos de
  actor ni identificadores individuales.
- **Seguridad y acceso** presenta métricas agregadas de login y challenge en
  una ventana móvil de 15 minutos: solicitudes de login admitidas por el límite,
  challenges emitidos/aceptados/
  rechazados, inicios fallidos durante la defensa, solicitudes denegadas por el
  bloqueo temporal, direcciones de red bloqueadas activas y estado del modo de
  ataque. El detector cuenta las solicitudes admitidas por el límite de login;
  las denegadas por rate limit no activan el challenge. Los fallos se cuentan
  solo cuando la autenticación devuelve `401 LOGIN_UNAVAILABLE` durante el
  modo challenge, e incluyen los fallos recientes usados al activarlo. Los
  contadores son volátiles, viven en memoria por proceso y se reinician al
  reiniciarlo; no contienen ni muestran
  IP, usuario, cuenta o sesión, y no forman un historial individual. La misma
  dirección de red pública puede ser compartida por varias personas: un
  bloqueo temporal puede afectar a todas ellas, por ejemplo detrás de una NAT.
  La misma pestaña resume las pruebas de inyección de instrucciones, cuotas,
  permisos y aislamiento entre cuentas. Las pruebas de integración que requieren
  PostgreSQL crean esquemas aleatorios en la base temporal de CI; las pruebas
  E2E usan una instancia aislada de API/web con repositorios en memoria, no esa
  base PostgreSQL. CI también ejecuta auditoría de dependencias y análisis de
  vulnerabilidades de la imagen. El detalle está en [`ci-cd.md`](ci-cd.md) y
  [`ai-evaluation-and-observability.md`](ai-evaluation-and-observability.md).
- **Analítica anónima** muestra vistas agregadas de páginas públicas, tamaño
  aproximado de ventana, clics para elegir plan y activaciones simuladas por mes.
  La web solo envía códigos cerrados de página/acción y categoría de ancho con
  `credentials: omit`; el cuerpo no incluye URL, referer, agente, IP, cuenta,
  cookie, identificador o texto, y la API no consulta ni persiste esas señales
  para estas métricas. El servidor incrementa directamente contadores diarios
  en PostgreSQL: no existe una tabla de eventos individuales. Las recargas
  cuentan de nuevo, así que son vistas y clics, no visitantes o sesiones únicos.
  Los gráficos usan periodos cerrados: 30 días y seis meses completos, sin
  mostrar el día o mes en curso. Las páginas con menos de diez vistas se
  combinan en «Otras secciones»; esa categoría también se omite si suma menos
  de diez. El reparto móvil/escritorio se muestra como porcentajes redondeados
  a múltiplos de cinco y solo si ambas categorías alcanzan diez vistas. Los
  datos se eliminan a los trece meses. Las activaciones
  proceden de compras simuladas existentes, agrupadas por mes y plan. No se
  enlazan vistas, clics y activaciones; la comparación no es una conversión por
  persona. No se deriva ni muestra ubicación geográfica a partir de IP. La
  pestaña está protegida por la autorización admin de las demás
  métricas. El endpoint es público y valida `Origin` como defensa CSRF, no como
  identidad del cliente; un cliente no navegador puede falsificar eventos. Los
  límites existentes por IP y proceso reducen abuso, pero no lo eliminan ni se
  comparten entre réplicas.

Las pestañas son información de operación y documentación. No lanzan
benchmarks, escaneos ni pruebas desde el navegador.

### Métricas Lighthouse del laboratorio

La pestaña **Calidad web** presenta a Jappy los resultados sintéticos de
Lighthouse. La lectura usa `GET /api/admin/web-quality`, protegido por access
token y `AdminRoleGuard`. Muestra hasta seis resúmenes: la medición más reciente
para cada combinación de tres páginas (Inicio, Precios y Peores ideas) y dos
dispositivos (móvil y escritorio). Cada resultado corresponde a tres
ejecuciones y contiene commit, fecha, puntuaciones de categoría y métricas LCP,
CLS, TBT y Speed Index. La vista aclara que no son Core Web Vitals de campo.

Tras desplegar, CI publica el resumen allowlisted mediante
`POST /api/internal/lighthouse-quality/ingest`, autenticado con Bearer token.
El laboratorio pasa solo ese resumen como salida temporal del job, sin
artefactos. La publicación solo se habilita en el `workflow_dispatch` aprobado
desde `main`, cuando `github.actor` y `github.triggering_actor` son
`fernandezpastoreduardo`. Para activarla, configura los secretos de Actions
`LIGHTHOUSE_INGEST_URL` (exactamente
`https://<PRODUCTION_DOMAIN>/api/internal/lighthouse-quality/ingest`) y
`LIGHTHOUSE_INGEST_TOKEN`, y configura el mismo token Base64URL, de al menos
32 caracteres (se recomiendan 32 bytes aleatorios codificados en Base64URL),
como `QUALITY_METRICS_INGEST_TOKEN` en el secreto runtime de la API
(`grumphya_env`). Despliega también la migración y la versión de API/web que
incluyen la función. Si faltan los secretos de Actions, el job omite la
publicación; si su formato no es válido o el endpoint falla, emite un aviso sin
invalidar el despliegue.

La base conserva resultados por commit/página/dispositivo y la purga horaria
elimina los que superan 90 días. El reporte es enteramente sintético: no añade
cookies ni instrumentación de visitantes, y no recoge IPs, sesiones o
visitantes únicos. Los informes Lighthouse completos solo existen durante el
job de laboratorio; no se suben como artefactos de GitHub Actions, según
[`ci-cd.md`](ci-cd.md).

- Contacto: hasta 100 mensajes recientes, con alias, correo, asunto, contenido,
  fecha y estado de confirmación/respuesta. El contenido no se escribe en logs.
  Jappy puede enviar una respuesta al correo asociado a la cuenta; el texto de
  respuesta no se persiste. El remitente y Reply-To usan la dirección SMTP
  configurada. Los logs omiten el contenido de la respuesta y el destinatario.
  Un envío con estado incierto requiere revisar el webmail de la cuenta SMTP
  configurada antes de un único reintento. No hay lectura IMAP en la aplicación. Los mensajes se purgan a los 12 meses
  mediante `DataRetentionService`; la baja física también los elimina por
  cascada. Verificar la ejecución de la tarea y la rotación de backups en
  producción.

## Sesiones y separación de cuentas

La cookie HttpOnly de refresh es compartida por las pestañas del mismo perfil
de navegador. Al iniciar sesión con otra cuenta, la sesión disponible en ese
perfil cambia; la aplicación notifica a las otras pestañas, limpia su access
token en memoria y las recarga. No se mantienen sesiones activas de cuentas
distintas en pestañas del mismo perfil de navegador. Perfiles de navegador
separados mantienen cookies independientes.

Los datos de cuenta, compras, contactos, ideas aprobadas, cuotas de plan y
contadores persistentes de roast se atribuyen al `userId` extraído del access
token validado en servidor. El cupo gratuito de ideas y roast, en cambio,
pertenece al perfil de navegador y se comparte entre las cuentas usadas en él.
Ese cupo no concede permisos de cuenta, rol admin ni acceso a datos ajenos. Los
permisos de plan se comprueban contra el estado vigente en PostgreSQL.

Para los detalles de tablas y relaciones, consulta
[`persistence.md`](../agentic-guidelines/persistence.md); la descripción de
componentes y rutas de producto está en
[`features.md`](../agentic-guidelines/features.md).
