# Línea base de calidad y cobertura

Medición con Vitest 4.1.12 y el proveedor V8. La API se actualizó el 27 de
octubre de 2026 tras ampliar pruebas de persistencia, cuotas, correo,
recuperación de contraseña, contacto, avatares, registro, administración,
autenticación, retención de datos y adaptadores de IA; web refleja su última
corrida completa. Son porcentajes del código bajo `src/`; no son un umbral
exigido ni una garantía de calidad por sí solos.

| Paquete | Pruebas aprobadas | Omitidas | Statements | Branches | Functions |   Lines |
| ------- | ----------------: | -------: | ---------: | -------: | --------: | ------: |
| API     |               854 |       21 |    92,63 % |  86,76 % |   96,36 % | 94,07 % |
| Web     |               321 |        0 |    86,98 % |  84,01 % |   87,42 % | 89,66 % |

Repite la medición con:

```sh
pnpm --filter @grumphya/api test:coverage
pnpm --filter @grumphya/web test:coverage
```

La API ya supera el objetivo de 80 % de líneas. Las pruebas ampliadas llevan
`PostgresAdminDashboardRepository` a 100 % de sentencias, líneas y funciones,
y 87,23 % de ramas. `PostgresUserAvatarRepository` también alcanza 100 % de
líneas, funciones y ramas. `access-token-session.lookup.ts` tiene 100 % de
líneas, funciones y ramas. `AnonymousUsageService` llega a 100 % de líneas y
funciones y 96,88 % de ramas. `PlanUsageService` alcanza 100 % de líneas y
funciones, y 94,74 % de ramas. `MailService` llega a 96,77 % de líneas,
96,43 % de ramas y 100 % de funciones. La cobertura de estos servicios también
comprueba que los fallos SMTP no generen previsualizaciones locales y que los
detalles internos de persistencia no aparezcan en respuestas 503. Los
incrementos cubren además persistencia de registro, uso anónimo, mensajería de
contacto, SMTP y cuotas. `UserDeleteController` alcanza 100 % de líneas, ramas y
funciones, con pruebas para una petición sin usuario autenticado, una cuenta
que el repositorio no encuentra y un fallo inesperado de persistencia, además
del borrado correcto.
`PasswordResetController` también alcanza 100 % de sentencias, líneas,
funciones y ramas; las pruebas verifican que ambos endpoints delegan el cuerpo
recibido y devuelven el resultado del servicio.
`SubmitContactMessageController` alcanza 100 % de sentencias, líneas,
funciones y ramas; las pruebas cubren los resultados públicos de envío y reintento,
la conversión de errores de dominio y la propagación de errores inesperados.
`UserAvatarController` alcanza 100 % de sentencias, líneas, ramas y funciones.
Las pruebas verifican la lista permitida de formatos, el manejo seguro de errores
del servicio y los encabezados de las imágenes servidas.
`RegistrationController` alcanza 100 % de sentencias, líneas y funciones, y
87,09 % de ramas. Sus 26 pruebas unitarias cubren todas las rutas, incluidos
errores de sesión, validación de payloads y respuestas delegadas al servicio.
`AdminDashboardController`, `HealthController` y
`LocalMailPreviewController` alcanzan 100 % de sentencias, líneas, ramas y
funciones. Las pruebas del panel cubren la traducción segura de errores de
dominio y la propagación de fallos inesperados; health cubre disponibilidad de
PostgreSQL/pgvector y revisión desplegada; el endpoint local cubre la ocultación
en producción, ausencia de previsualización y respuesta disponible en desarrollo.
`AnonymousUsageController` alcanza 100 % de sentencias, líneas y funciones, y
98,27 % de ramas tras cubrir los límites de perfil, validación, cuotas,
idempotencia y liberación de reservas. Las dos pruebas incluidas en la medición
más reciente verifican que se validen el mensaje y la clave antes de reservar
uso (incluidos arrays, valores vacíos y UUID inválidos, sin rechazar saltos de
línea válidos), y que un roast con idempotency key pueda reintentarse si falla
la escritura del ranking después de consumir el uso. El utilitario compartido
`read-cookie.ts` alcanza 100 % en las cuatro métricas con pruebas de nombres
exactos, decodificación, valores con `=` y codificación inválida.
`InMemoryVerificationDelivery` y `DevelopmentVerificationDelivery` alcanzan
100 % en las cuatro métricas. `RegistrationService` queda en 87,27 % de
sentencias, 81,69 % de ramas, 97,14 % de funciones y 89,8 % de líneas tras
añadir casos de validación, errores de persistencia, origen inválido y tokens
inválidos.
`IdeaSubmissionService` queda en 89,52 % de sentencias, 76,51 % de ramas,
95,65 % de funciones y 90,59 % de líneas; las pruebas cubren fallos de
idempotencia, ausencia o caída del buscador semántico, persistencia del contador
y carga de la coincidencia previa durante una continuación.
`PasswordResetService` alcanza 92,2 % de sentencias, 83,33 % de ramas, 93,75 %
de funciones y 95,65 % de líneas, con cobertura de payloads inválidos, cambio
exitoso de contraseña y anulación del token cuando el origen web no es seguro.
`PostgresPasswordResetRepository` alcanza 100 % de sentencias, líneas, ramas y
funciones. Las pruebas cubren la ausencia de cuenta elegible, invalidación del
token ligado al usuario y rollback/liberación de la conexión si falla el cambio
de contraseña. `OpenAiIdeaEquivalencePort` rechaza lotes sin candidatas o con
más de 20 antes de llamar al proveedor; las pruebas confirman que acepta el
límite máximo de 20. `OpenAiEvaluationPort` alcanza 97,8 % de sentencias, 100 %
de líneas y funciones, y 95 % de ramas; los casos cubren clasificación de
fallos HTTP, errores de transporte y cancelación, respuestas incompletas o
malformadas y preservación literal del texto citado.
Vitest aplica ahora umbrales globales iniciales para frenar regresiones sin
exigir que cada archivo alcance esos niveles: API, 80 % de sentencias, 75 % de
ramas, 85 % de funciones y 85 % de líneas; web, 82 %, 78 %, 80 % y 85 %,
respectivamente. Los umbrales quedan por debajo de la medición actual y deberán
revisarse y elevarse por fases. El siguiente foco recomendado es `app.module.ts`
(86,36 % de líneas), revisando el cableado de proveedores con una prueba de
integración y sin fabricar pruebas unitarias de detalles internos. Se dejan
fuera del objetivo el arranque y las herramientas CLI, que no se benefician de
pruebas unitarias artificiales.

Las 21 pruebas omitidas en API incluyen pruebas condicionadas a bases de datos
aisladas. La cobertura de estas pruebas no representa una comprobación del
despliegue, datos ni tráfico de producción. La medición API de la tabla se
obtuvo en una corrida con permiso para enlazar `127.0.0.1`; sin ese permiso, las
pruebas HTTP fallan al enlazar y no se reproduce la cifra completa.
