# Línea base de calidad y cobertura

Medición con Vitest 4.1.12 y el proveedor V8. La API se actualizó el 27 de
octubre de 2026 tras ampliar pruebas de persistencia, servicios de cuotas y
correo; API y web reflejan la última corrida completa. Son porcentajes del
código bajo `src/`; no son un umbral exigido ni una garantía de calidad por sí
solos.

| Paquete | Pruebas aprobadas | Omitidas | Statements | Branches | Functions |   Lines |
| ------- | ----------------: | -------: | ---------: | -------: | --------: | ------: |
| API     |               747 |       21 |    89,55 % |  83,62 % |   94,47 % | 91,05 % |
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
comprueba que los fallos SMTP no se conviertan en previsualizaciones locales ni
que detalles de persistencia se filtren en respuestas 503. Los incrementos
cubren además persistencia de registro, uso anónimo, mensajería de contacto,
SMTP y cuotas.

Vitest aplica ahora umbrales globales iniciales para frenar regresiones sin
exigir que cada archivo alcance esos niveles: API, 80 % de sentencias, 75 % de
ramas, 85 % de funciones y 85 % de líneas; web, 82 %, 78 %, 80 % y 85 %,
respectivamente. Los umbrales quedan por debajo de la medición actual y deberán
revisarse y elevarse por fases. El siguiente foco recomendado es
`UserDeleteController`, con 75 % de líneas; protege una operación de cuenta
sensible. Se dejan fuera del objetivo el arranque y las herramientas CLI, que
no se benefician de pruebas unitarias artificiales.

Las 21 pruebas omitidas en API incluyen pruebas condicionadas a bases de datos
aisladas. La cobertura de estas pruebas no representa una comprobación del
despliegue, datos ni tráfico de producción. La medición API de la tabla se
obtuvo en una corrida con permiso para enlazar `127.0.0.1`; sin ese permiso, las
pruebas HTTP fallan al enlazar y no se reproduce la cifra completa.
