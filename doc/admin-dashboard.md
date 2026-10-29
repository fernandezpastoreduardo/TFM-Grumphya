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
  estado HTTP, fecha, caso de uso y diagnóstico; eventos históricos sin
  contexto indican que no se guardó información de entrada.
- Los errores 5xx de `POST /api/evaluation-process` pueden guardar en
  `context_json` hasta 2.000 caracteres del texto enviado, para diagnosticar
  fallos como errores del proveedor, timeouts o respuestas no válidas. El detalle solo está disponible
  tras autenticación y comprobación del rol admin. El texto no se incluye en
  logs ni se comparte con la vista agregada; se elimina con el evento a los 30
  días. Otros errores no guardan payloads, rutas, credenciales ni mensajes
  de excepción, y nunca se persiste la respuesta cruda del proveedor. La
  migración `029` añade la categoría opcional y `031` el contexto acotado. Los
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

- **Benchmark de evaluaciones y prompts** describe el corpus versionado de seis
  casos sintéticos y cómo comparar acuerdo con las etiquetas y consistencia de
  estado/motivo entre prompts y modelos. El panel ofrece el comando de ayuda;
  las ejecuciones se lanzan desde un entorno de desarrollo con credenciales y
  no se guardan ni se muestran como una ejecución reciente.
- **Telemetría de operaciones de IA** muestra coste agregado y eventos sin
  tarifa. Los eventos estructurados de stdout incluyen operación, modelo,
  resultado, latencia, identificador aleatorio por llamada, tokens disponibles
  y coste estimado; no incluyen ideas, mensajes, cuenta, IP ni identificadores
  de sesión. La tabla administrativa de consumo sí conserva tokens y coste por
  operación/modelo y puede asociar una cuenta para calcular promedios. La UI
  presenta cifras agregadas y no expone ese identificador.
- **Pruebas de seguridad** resume las pruebas de inyección de instrucciones,
  cuotas, permisos y aislamiento entre cuentas. Las pruebas de integración que
  requieren PostgreSQL crean esquemas aleatorios en la base temporal de CI; las
  pruebas E2E usan una instancia aislada de API/web con repositorios en memoria,
  no esa base PostgreSQL. CI también ejecuta auditoría de dependencias y análisis
  de vulnerabilidades de la imagen. El detalle está en [`ci-cd.md`](ci-cd.md) y
  [`ai-evaluation-and-observability.md`](ai-evaluation-and-observability.md).

Las pestañas son información de operación y documentación. No lanzan
benchmarks, escaneos ni pruebas desde el navegador.

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
