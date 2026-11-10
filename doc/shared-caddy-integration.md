# Sitios adicionales en el Caddy compartido

Grumphya conserva sus dos bloques de Caddy y sus redes `edge` y `backend`. El
`import /etc/caddy/sites-enabled/*.caddy` permite añadir sitios sin editar el
Caddyfile de una release. Un patrón sin archivos no altera la configuración.
Los archivos de integración viven en `/opt/grumphya/integrations`, fuera de
`releases`, y no se incluyen en los bundles ni en la limpieza de releases.

El helper añade `/opt/grumphya/integrations/compose.yaml` a **todas** sus
invocaciones de Compose, incluidas validación, despliegue, recuperación y
rollback, únicamente si existen ese archivo y el directorio `sites`, y la red
Docker `development-security-ingress` existe con `Internal=true`. Si falta
alguno, usa solo el Compose de Grumphya. La configuración opcional monta
`sites` en el proxy en modo lectura y añade únicamente esa red externa al
proxy; no conecta `development-security-edge` ni cambia las redes de API,
web o PostgreSQL de Grumphya.

## Instalación inicial en el VPS

Esta preparación requiere root y debe realizarse **antes de la primera release
que use el nuevo helper**. El helper activo de la versión anterior no puede
aplicar la integración durante el proceso que instala su sucesor. El workflow
de producción exige la versión 3 y falla antes de transferir el bundle si aún
está instalada la versión 2. Estos comandos son una guía operativa; no se
ejecutan al modificar este repositorio.

1. Verifica que `development-security-ingress` existe, es `bridge` con
   `Internal=true`, y contiene `development-security-web` en el puerto 8080.
   No conectes el proxy a `development-security-edge`.
2. Instala bajo control de root los archivos revisados:

   ```bash
   install -d -o root -g root -m 0700 /opt/grumphya/integrations /opt/grumphya/integrations/sites
   install -o root -g root -m 0644 docker/additional-sites/desarrolloseguro.caddy.example /opt/grumphya/integrations/sites/desarrolloseguro.caddy
   install -o root -g root -m 0600 docker/additional-sites.compose.yaml.example /opt/grumphya/integrations/compose.yaml
   install -o root -g root -m 0755 docker/vps-deploy.sh /usr/local/sbin/grumphya-deploy
   /usr/local/sbin/grumphya-deploy helper-version
   ```

   El último comando debe devolver `3`. No copies estos archivos a una ruta
   de release ni cambies `.env.production`, secretos o volúmenes. El fragmento
   Caddy solo define `desarrolloseguro.org` y `www.desarrolloseguro.org`: el
   primero envía tráfico HTTP a `development-security-web:8080` y el segundo
   redirige al dominio raíz. Caddy gestiona TLS en el mismo proxy y conserva
   sus datos de certificados en `grumphya-caddy-data`. El fragmento conserva
   la compresión, TLS 1.2/1.3 y las cabeceras de seguridad del bloque instalado
   manualmente en la release activa. No se habilita un log de acceso.

## Validación y actualización

Antes de una release, comprueba la red y la configuración efectiva:

```bash
docker network inspect --format '{{.Driver}} {{.Internal}}' development-security-ingress
docker network inspect --format '{{json .Containers}}' development-security-ingress
GRUMPHYA_ADDITIONAL_SITES_DIR=/opt/grumphya/integrations/sites \
GRUMPHYA_SECRETS_DIR=/opt/grumphya/.secrets \
docker compose --project-name grumphya \
  --env-file /opt/grumphya/.env.production \
  --env-file /opt/grumphya/releases/ACTUAL/release.env \
  --file /opt/grumphya/releases/ACTUAL/compose.production.yaml \
  --file /opt/grumphya/integrations/compose.yaml config --quiet
```

Sustituye `ACTUAL` por el SHA que devuelve `grumphya-deploy status`. Tras la
release, comprueba con `docker inspect` que el proxy pertenece a
`development-security-ingress` y no a `development-security-edge`; valida el
Caddyfile cargado con `docker exec grumphya-proxy-1 caddy validate --config
/etc/caddy/Caddyfile --adapter caddyfile`. Comprueba HTTPS y el certificado de
ambos dominios, la redirección de `www` y `/api/health` y `/build.json` de
Grumphya. Usa una petición de lectura sintética; no registres cookies,
autorizaciones ni cuerpos de solicitud.

Para actualizar un sitio, prepara un fragmento candidato, valídalo con Caddy
antes de reemplazar el archivo estable y recarga el proxy. Para actualizar la
red o el Compose opcional, valida primero `docker compose config`; recrea solo
el proxy con el Compose efectivo y comprueba ambos sitios. Las releases
posteriores usan la misma ruta estable y vuelven a conectar la red al recrear
el contenedor.

## Ausencia y reversión

Si falta el archivo opcional, el directorio o la red interna, el helper ignora
la extensión y despliega Grumphya con su Compose habitual. Si la red existe
pero `development-security-web` está detenido, el sitio adicional puede
responder `502`; Grumphya no depende de ese upstream. Para desactivar la
integración, retira `compose.yaml` de la ruta estable y recrea el proxy con el
Compose de la release activa. El Caddyfile base mantiene un `import` vacío y
los servicios y datos de Grumphya siguen intactos. Al hacer rollback a una
release anterior a esta integración, el Caddyfile antiguo puede no importar
los fragmentos; comprueba los dos dominios después del rollback.
