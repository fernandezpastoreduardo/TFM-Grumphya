# Línea base de calidad y cobertura

Medición de referencia del 27 de octubre de 2026, con Vitest 4.1.12 y el
proveedor V8. Son porcentajes del código bajo `src/`; no son un umbral exigido
ni una garantía de calidad por sí solos.

| Paquete | Pruebas aprobadas | Omitidas | Statements | Branches | Functions |   Lines |
| ------- | ----------------: | -------: | ---------: | -------: | --------: | ------: |
| API     |               603 |       21 |    77,22 % |  75,14 % |   81,19 % | 78,76 % |
| Web     |               316 |        0 |    85,84 % |  83,23 % |   86,24 % | 88,64 % |

Repite la medición con:

```sh
pnpm --filter @grumphya/api test:coverage
pnpm --filter @grumphya/web test:coverage
```

No se fijan umbrales todavía: la cobertura API está por debajo del objetivo de
80 % de líneas y ambas aplicaciones están lejos del 100 % de funciones que
propone la guía del proyecto. Fijar mínimos bajo esos objetivos convertiría la
línea base actual en deuda permanente. El siguiente incremento debería cubrir
los módulos API más débiles, priorizando persistencia de registro, uso anónimo,
mensajería y transporte SMTP, y después establecer umbrales graduales con una
revisión de excepciones para arranque y adaptadores externos.

Las 21 pruebas omitidas en API incluyen pruebas condicionadas a bases de datos
aisladas. La cobertura de estas pruebas no representa una comprobación del
despliegue, datos ni tráfico de producción.
