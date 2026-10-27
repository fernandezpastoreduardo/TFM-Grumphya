# Línea base de calidad y cobertura

Medición con Vitest 4.1.12 y el proveedor V8. La API se actualizó el 27 de
octubre de 2026 tras ampliar pruebas de persistencia y administración; API y web
reflejan la última corrida completa. Son porcentajes del código bajo `src/`; no son
un umbral exigido ni una garantía de calidad por sí solos.

| Paquete | Pruebas aprobadas | Omitidas | Statements | Branches | Functions |   Lines |
| ------- | ----------------: | -------: | ---------: | -------: | --------: | ------: |
| API     |               720 |       21 |    88,94 % |  82,82 % |   94,33 % | 90,45 % |
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
funciones y 96,88 % de ramas. Los incrementos cubren además persistencia de
registro, uso anónimo, mensajería de contacto, SMTP y cuotas de planes.

Vitest aplica ahora umbrales globales iniciales para frenar regresiones sin
exigir que cada archivo alcance esos niveles: API, 80 % de sentencias, 75 % de
ramas, 85 % de funciones y 85 % de líneas; web, 82 %, 78 %, 80 % y 85 %,
respectivamente. Los umbrales quedan por debajo de la medición actual y deberán
revisarse y elevarse por fases. El siguiente foco recomendado es
`PlanUsageService`, que queda en 72 % de líneas; es lógica de negocio de cuotas.
Se dejan fuera del objetivo el arranque y las herramientas CLI, que no se
benefician de pruebas unitarias artificiales.

Las 21 pruebas omitidas en API incluyen pruebas condicionadas a bases de datos
aisladas. La cobertura de estas pruebas no representa una comprobación del
despliegue, datos ni tráfico de producción. La medición API de la tabla se
obtuvo en una corrida con permiso para enlazar `127.0.0.1`; sin ese permiso, las
pruebas HTTP fallan al enlazar y no se reproduce la cifra completa.
