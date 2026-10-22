# CI/CD y seguridad de la imagen

El workflow `.github/workflows/ci.yml` se ejecuta en pull requests y al publicar en `main`; un push a otra rama no lo inicia por sí solo. Los jobs usan `ubuntu-24.04` para evitar cambios imprevistos de imagen y avisos por migraciones de `ubuntu-latest`. Fija Node mediante `.node-version` (`24.21.0`), pnpm (`12.5.1`) e instala desde `pnpm-lock.yaml` con `--frozen-lockfile`. El job `quality-and-e2e` prepara PostgreSQL/pgvector y ejecuta `pnpm quality:check`, que corre formato, lint, typecheck, tests, build en ese orden. También prueba la política del despliegue y el helper del VPS con comandos Docker simulados, incluidos checksum, compatibilidad de migraciones y rollback. El mismo comando está en el hook Husky `pre-commit`, así un cambio que falle una puerta local se rechaza antes de crear el commit. Tras instalar Chromium, CI ejecuta Playwright; el hook Husky `pre-push` corre también `pnpm test:e2e` antes de publicar. Para preparar el navegador local, instala Chromium con `pnpm --filter @grumphya/web exec playwright install chromium`. CI no modifica ni formatea archivos automáticamente.

Los tests PostgreSQL reciben un servicio temporal `pgvector/pgvector:0.8.7-pg17`. Antes de la suite, `prepare-test-database.ts` habilita `vector` en `public` y comprueba que está disponible. Cada spec que necesita persistencia crea un esquema aleatorio, ejecuta migraciones en él y lo elimina al terminar. Playwright arranca API y web en puertos de test dedicados, con repositorios en memoria y el adaptador de evaluación simulado; no usa credenciales ni datos de desarrollo/producción. La suite E2E corre con un worker porque comparte ese servidor de prueba y sus contadores de rate limit. No configura un proveedor LLM en CI.

Para replicar localmente los tests SQL, usa una base PostgreSQL/pgvector desechable dedicada exclusivamente a pruebas. Define `TEST_DATABASE_URL` y las variables `*_TEST_DATABASE_URL` que consuman los specs para que apunten a esa base antes de ejecutar `prepare-test-database.ts` y `pnpm test`. No reutilices la base de desarrollo: los tests preparan la extensión y crean/eliminan esquemas temporales. CI usa un servicio efímero separado.

El Dockerfile separa las etapas `development` y `production`. Docker Compose selecciona `development`, que instala las dependencias completas para Vite, tests y desarrollo local. CI construye y comprueba `production`: compila la API en una etapa de build, instala solo sus dependencias de producción y omite los gestores de paquetes del contenedor final. Antes de escanearla con Trivy, CI ejecuta `scripts/test-production-image.mjs` dentro de la imagen y verifica que `NODE_ENV` sea `production`, que el proceso no use UID 0, que estén disponibles las dependencias de runtime de NestJS, bcryptjs, PostgreSQL y sharp, que la imagen incluya migraciones SQL y que no queden ejecutables npm, npx, Corepack, pnpm ni Yarn. Así el escaneo cubre la imagen ejecutable y no herramientas de desarrollo que no se despliegan. La base usa Node `24.21.0-trixie-slim`; el build de CI usa `--pull` para recibir la última reconstrucción publicada de esa versión. La etiqueta es mutable: `--pull` ayuda a recibir actualizaciones de seguridad, pero dos ejecuciones pueden usar distintos digests y no garantizan una reconstrucción idéntica. Para repetir exactamente un build debe registrarse y fijarse el digest de la imagen base.

El job `supply-chain` ejecuta dos auditorías del lockfile: `pnpm audit --audit-level moderate` revisa dependencias de producción y desarrollo en todo el workspace, y bloquea vulnerabilidades moderadas o superiores; `pnpm audit --prod --audit-level high` revisa las dependencias de producción y bloquea hallazgos altos o críticos. Esto incluye las herramientas de pruebas, aunque no formen parte de la imagen final. Para resolver los hallazgos actuales se actualizaron Vitest a `4.1.12` en API y web y se fijó `shell-quote` en `1.12.0` mediante un override del workspace. Trivy analiza las cuatro imágenes finales (API, web, PostgreSQL y Caddy) con severidad alta/crítica y `ignore-unfixed`, por lo que bloquea los hallazgos para los que hay una corrección disponible. La imagen de PostgreSQL conserva Debian Bookworm para no cambiar la plataforma del volumen existente, actualiza sus paquetes y recompila `gosu` 1.19 con Go 1.27.3. El proxy usa Caddy 2.11.7 recompilado con Go 1.27.3 y `golang.org/x/net` 0.60.0. Ambas fuentes se comprueban contra su commit exacto; no se excluyen archivos ni tipos de vulnerabilidad del escaneo. Las etapas de compilación no entran en las imágenes finales. Dependabot propone actualizaciones semanales de dependencias y acciones.

El despliegue automático opcional desde GitHub Actions está implementado para pushes a `main`, pero permanece apagado hasta que `PRODUCTION_DEPLOY_ENABLED` se habilite y se configuren los secretos SSH del VPS. El job construye y escanea API, web, PostgreSQL y Caddy; empaqueta esas mismas imágenes por SHA y las envía al VPS sin reconstruir ni descargar tags mutables. Un helper root-owned valida el paquete y las migraciones, mantiene la release anterior, espera healthchecks y permite rollback. No hay publicación a un registry. Consulta [production.md](production.md) para prerrequisitos, permisos SSH/sudoers, verificación de host, activación explícita y límites operativos. Los tests de CI incluyen `scripts/test-deploy-policy.mjs` y `scripts/test-vps-deploy.sh`, que comprueban guards del workflow y rollback con Docker simulado. Todas las GitHub Actions están fijadas a SHA inmutables y conservan una etiqueta de versión legible en el workflow; Dependabot propone semanalmente sus actualizaciones en pull requests revisables. El escaneo usa Trivy `v0.76.0` mediante `aquasecurity/trivy-action` `v0.36.0`, también fijada por SHA.

## Ejecución local equivalente

```sh
pnpm install --frozen-lockfile
pnpm --filter @grumphya/api exec tsx scripts/prepare-test-database.ts
pnpm quality:check
pnpm --filter @grumphya/web exec playwright install chromium
pnpm test:e2e
node scripts/test-deploy-policy.mjs
bash -n docker/vps-deploy.sh scripts/test-vps-deploy.sh
bash scripts/test-vps-deploy.sh
pnpm audit --audit-level moderate
pnpm audit --prod --audit-level high
docker build --pull --target production --tag grumphya-ci:local .
node scripts/test-production-image.mjs grumphya-ci:local
```

La prueba de contrato necesita Docker y una imagen de producción ya construida. Ejecuta un proceso Node dentro del contenedor, no arranca el servicio ni se conecta a PostgreSQL; comprueba únicamente que el artefacto contiene sus dependencias de runtime y migraciones, usa un usuario no-root y excluye los gestores de paquetes.

El comando de preparación de PostgreSQL requiere las variables de test descritas arriba; si no están configuradas, los tests que dependen de PostgreSQL pueden omitirse. En GitHub Actions, el workflow define todas las URLs de test contra su servicio efímero.

El escaneo Trivy se ejecuta en GitHub Actions. Para revisar la misma imagen local, constrúyela con `--target production` y ejecuta `trivy image --scanners vuln --severity HIGH,CRITICAL --ignore-unfixed grumphya-ci:local`.
