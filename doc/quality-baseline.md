# Línea base de calidad y cobertura

Medición con Vitest 4.1.12 y el proveedor V8. La API se actualizó el 27 de
octubre de 2026 tras ampliar las pruebas de persistencia y correo; la cifra web
conserva su medición original. Son porcentajes del código bajo `src/`; no son
un umbral exigido ni una garantía de calidad por sí solos.

| Paquete | Pruebas aprobadas | Omitidas | Statements | Branches | Functions |   Lines |
| ------- | ----------------: | -------: | ---------: | -------: | --------: | ------: |
| API     |               688 |       21 |    88,01 % |  81,41 % |   93,12 % | 89,55 % |
| Web     |               316 |        0 |    85,84 % |  83,23 % |   86,24 % | 88,64 % |

Repite la medición con:

```sh
pnpm --filter @grumphya/api test:coverage
pnpm --filter @grumphya/web test:coverage
```

La API ya supera el objetivo de 80 % de líneas, pero todavía no se fijan
umbrales: ambas aplicaciones están por debajo del 100 % de funciones que
propone la guía del proyecto. El último incremento cubrió persistencia de
registro, uso anónimo, mensajería de contacto, SMTP y cuotas de planes. El
siguiente debería revisar `PostgresAdminDashboardRepository`, que en esa
medición tiene 75,86 % de statements, 55,31 % de branches, 69,23 % de
functions y 79,24 % de lines. El paso siguiente es establecer umbrales
graduales, con excepciones justificadas para
arranque y adaptadores externos.

Las 21 pruebas omitidas en API incluyen pruebas condicionadas a bases de datos
aisladas. La cobertura de estas pruebas no representa una comprobación del
despliegue, datos ni tráfico de producción. La suite completa pasa con 688
pruebas; las pruebas HTTP que enlazan `127.0.0.1` requieren permiso de loopback
en este entorno de desarrollo. La medición API de la tabla se obtuvo en una
corrida con ese permiso; sin él, las pruebas HTTP fallan al enlazar y no se
reproduce la cifra completa.
