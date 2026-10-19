# CI/CD y seguridad de la imagen

El workflow `.github/workflows/ci.yml` se ejecuta en pull requests y al publicar en `main`. Fija Node mediante `.node-version` (`24.20.0`), pnpm (`12.5.1`) e instala desde `pnpm-lock.yaml` con `--frozen-lockfile`. Después ejecuta lint, typecheck, tests, build y Playwright Chromium.

Los tests PostgreSQL reciben un servicio temporal `pgvector/pgvector:0.8.7-pg17`. Antes de la suite, `prepare-test-database.ts` habilita `vector` en `public` y comprueba que está disponible. Cada spec que necesita persistencia crea un esquema aleatorio, ejecuta migraciones en él y lo elimina al terminar. Playwright arranca API y web en puertos de test dedicados, con repositorios en memoria y el adaptador de evaluación simulado; no usa credenciales ni datos de desarrollo/producción. La suite E2E corre con un worker porque comparte ese servidor de prueba y sus contadores de rate limit. No configura un proveedor LLM en CI.

El job `supply-chain` bloquea dependencias con vulnerabilidades altas/críticas reportadas por `pnpm audit --prod`. Construye la imagen de la aplicación desde el Dockerfile y escanea vulnerabilidades altas/críticas conocidas con Trivy, ignorando las que aún no tienen arreglo. Dependabot propone actualizaciones semanales de dependencias y acciones. El build usa `--pull` y el Dockerfile fija la versión completa de Node, mientras las dependencias JS quedan fijadas por el lockfile.

La imagen se escanea pero no se publica ni despliega automáticamente. El despliegue de producción deberá usar una imagen por digest, secretos del entorno destino, migraciones controladas y pruebas de smoke posteriores. Las acciones de GitHub están fijadas a versiones declaradas; Dependabot debe mantener sus actualizaciones revisables.

## Ejecución local equivalente

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @grumphya/web exec playwright install chromium
pnpm test:e2e
pnpm audit --prod --audit-level high
docker build --pull --tag grumphya-ci:local .
```

El escaneo Trivy se ejecuta en GitHub Actions. Para revisar la imagen local, instala Trivy y ejecuta `trivy image --scanners vuln --severity HIGH,CRITICAL --ignore-unfixed grumphya-ci:local`.
