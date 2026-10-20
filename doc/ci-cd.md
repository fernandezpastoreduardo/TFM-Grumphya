# CI/CD y seguridad de la imagen

El workflow `.github/workflows/ci.yml` se ejecuta en pull requests y al publicar en `main`; un push a otra rama no lo inicia por sí solo. Ambos jobs usan `ubuntu-24.04` para evitar cambios imprevistos de imagen y avisos por migraciones de `ubuntu-latest`. Fija Node mediante `.node-version` (`24.21.0`), pnpm (`12.5.1`) e instala desde `pnpm-lock.yaml` con `--frozen-lockfile`. El job `quality-and-e2e` prepara PostgreSQL/pgvector y ejecuta, en este orden, `format:check`, lint, typecheck, tests, build y Playwright Chromium. `format:check` es una puerta obligatoria; CI no modifica ni formatea archivos automáticamente.

Los tests PostgreSQL reciben un servicio temporal `pgvector/pgvector:0.8.7-pg17`. Antes de la suite, `prepare-test-database.ts` habilita `vector` en `public` y comprueba que está disponible. Cada spec que necesita persistencia crea un esquema aleatorio, ejecuta migraciones en él y lo elimina al terminar. Playwright arranca API y web en puertos de test dedicados, con repositorios en memoria y el adaptador de evaluación simulado; no usa credenciales ni datos de desarrollo/producción. La suite E2E corre con un worker porque comparte ese servidor de prueba y sus contadores de rate limit. No configura un proveedor LLM en CI.

Para replicar localmente los tests SQL, usa una base PostgreSQL/pgvector desechable dedicada exclusivamente a pruebas. Define `TEST_DATABASE_URL` y las variables `*_TEST_DATABASE_URL` que consuman los specs para que apunten a esa base antes de ejecutar `prepare-test-database.ts` y `pnpm test`. No reutilices la base de desarrollo: los tests preparan la extensión y crean/eliminan esquemas temporales. CI usa un servicio efímero separado.

El Dockerfile separa las etapas `development` y `production`. Docker Compose selecciona `development`, que instala las dependencias completas para Vite, tests y desarrollo local. CI construye y comprueba `production`: compila la API en una etapa de build, instala solo sus dependencias de producción y omite los gestores de paquetes del contenedor final. Antes de escanearla con Trivy, CI ejecuta `scripts/test-production-image.mjs` dentro de la imagen y verifica que `NODE_ENV` sea `production`, que el proceso no use UID 0, que estén disponibles las dependencias de runtime de NestJS, bcryptjs, PostgreSQL y sharp, que la imagen incluya migraciones SQL y que no queden ejecutables npm, npx, Corepack, pnpm ni Yarn. Así el escaneo cubre la imagen ejecutable y no herramientas de desarrollo que no se despliegan. La base usa Node `24.21.0-trixie-slim`; el build de CI usa `--pull` para recibir la última reconstrucción publicada de esa versión. La etiqueta es mutable: `--pull` ayuda a recibir actualizaciones de seguridad, pero dos ejecuciones pueden usar distintos digests y no garantizan una reconstrucción idéntica. Para repetir exactamente un build debe registrarse y fijarse el digest de la imagen base. `pnpm audit --prod --audit-level high` falla ante vulnerabilidades altas o críticas de dependencias de producción; Trivy analiza la imagen con severidad alta/crítica y `ignore-unfixed`, por lo que bloquea los hallazgos para los que hay una corrección disponible. Dependabot propone actualizaciones semanales de dependencias y acciones.

La imagen se escanea pero no se publica ni despliega automáticamente. El despliegue de producción deberá usar una imagen por digest, secretos del entorno destino, migraciones controladas y pruebas de smoke posteriores. Todas las GitHub Actions están fijadas a SHA inmutables y conservan una etiqueta de versión legible en el workflow; Dependabot propone semanalmente sus actualizaciones en pull requests revisables. El escaneo usa Trivy `v0.76.0` mediante `aquasecurity/trivy-action` `v0.36.0`, también fijada por SHA.

## Ejecución local equivalente

```sh
pnpm install --frozen-lockfile
pnpm --filter @grumphya/api exec tsx scripts/prepare-test-database.ts
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @grumphya/web exec playwright install chromium
pnpm test:e2e
pnpm audit --prod --audit-level high
docker build --pull --target production --tag grumphya-ci:local .
node scripts/test-production-image.mjs grumphya-ci:local
```

La prueba de contrato necesita Docker y una imagen de producción ya construida. Ejecuta un proceso Node dentro del contenedor, no arranca el servicio ni se conecta a PostgreSQL; comprueba únicamente que el artefacto contiene sus dependencias de runtime y migraciones, usa un usuario no-root y excluye los gestores de paquetes.

El comando de preparación de PostgreSQL requiere las variables de test descritas arriba; si no están configuradas, los tests que dependen de PostgreSQL pueden omitirse. En GitHub Actions, el workflow define todas las URLs de test contra su servicio efímero.

El escaneo Trivy se ejecuta en GitHub Actions. Para revisar la misma imagen local, constrúyela con `--target production` y ejecuta `trivy image --scanners vuln --severity HIGH,CRITICAL --ignore-unfixed grumphya-ci:local`.
