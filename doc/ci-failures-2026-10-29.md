# Fallos recientes de CI (29 de octubre de 2026)

Este seguimiento agrupa tres runs de CI en dos causas: el fallo de la ruta raíz
de la web (runs 408922 y 408963) y el marcador ausente en una migración (run
40866752525). También resume las comprobaciones preventivas incorporadas.

## Dos runs detectaron el fallo de la portada

El run [408922](https://github.com/fernandezpastoreduardo/TFM-Grumphya/actions/runs/408922)
falló al quedar `web` unhealthy mientras el smoke probaba `/`. El run
[408963](https://github.com/fernandezpastoreduardo/TFM-Grumphya/actions/runs/408963)
aportó el diagnóstico: Nginx devolvió 500 en `GET /`. El bloque `location = /`
usaba un `alias` para servir `index.html`; la combinación de URI y alias acabó
formando la ruta inexistente
`/usr/share/nginx/html/index.htmlindex.html`. Ambos runs corresponden al mismo
fallo de la ruta raíz.

La configuración ahora mantiene el `root` del servidor y resuelve `/` con
`try_files /index.html =404;`. El preflight de fuentes de CI comprueba esta
directiva y prohíbe volver a usar `alias` en ese bloque. El healthcheck de `web`
consulta `/` directamente a Nginx, y el smoke integrado comprueba también esa
ruta a través de Caddy. Son comprobaciones distintas: una valida el proceso web
y la otra el recorrido público del proxy.

## El preflight remoto rechazó la migración 035

En el run [40866752525](https://github.com/fernandezpastoreduardo/TFM-Grumphya/actions/runs/40866752525),
el bundle se transfirió al VPS, pero el preflight de despliegue rechazó la
migración `035_admin_ai_cached_input_tokens.sql` porque faltaba la declaración
`-- deployment-rollback-compatible: true`. El rechazo ocurrió antes de
activar la nueva release; el control del VPS evitó desplegar una migración sin
la revisión requerida.

Desde `029_`, las migraciones numeradas deben comenzar con esa declaración. CI
ahora comprueba la convención inmediatamente después de `actions/checkout` y
antes de instalar dependencias, además de conservar el preflight del helper en
el VPS. El cambio permite detectar la omisión antes de construir y transferir
el bundle, sin sustituir la validación de migraciones del despliegue.

## Diagnóstico del smoke

En los runs del 29 de octubre, el smoke de Compose registró `docker compose ps`,
el estado de salud de `web` y sus últimos 100 registros. La salida de diagnóstico
vigente incluye también el estado de salud de base de datos y API y los últimos
100 registros de API, migración y proxy; véase [CI/CD](ci-cd.md). El smoke usa
secretos ficticios y no vuelca variables de entorno.
