import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const DEPENDABOT_PATH = ".github/dependabot.yml";
const CADDY_DOCKERFILE_PATH = "docker/Caddy.Dockerfile";
const CADDYFILE_PATH = "docker/Caddyfile";
const ADDITIONAL_SITES_COMPOSE_PATH =
  "docker/additional-sites.compose.yaml.example";
const DEVELOPMENT_SECURITY_SITE_PATH =
  "docker/additional-sites/desarrolloseguro.caddy.example";
const DOCKERFILE_PATH = "Dockerfile";
const COMPOSE_PATH = "compose.production.yaml";
const NGINX_SPA_PATH = "docker/nginx-spa.conf";
const WORKFLOW_PATH = ".github/workflows/ci.yml";
const PREFLIGHT_PATH = "scripts/ci-preflight.sh";
const PRODUCTION_COMPOSE_SMOKE_PATH = "scripts/test-production-compose.sh";
const VPS_DEPLOY_HELPER_PATH = "docker/vps-deploy.sh";
const INTERNAL_TLS_SCRIPT_PATH = "scripts/generate-internal-tls.sh";
const POSTGRES_HBA_PATH = "docker/postgres-pg_hba.conf";
const MIGRATIONS_DIRECTORY = "apps/api/migrations";
const TYPESCRIPT_7_IGNORE = 'versions: [">=7.0.0"]';
const POLICY_TEST_COMMAND = "node scripts/test-container-security-policy.mjs";
const CADDY_SOURCE_COMMIT = "72dd0fb067f6d7826c7f79907670ba4a713bfe37";
const CADDY_X_NET_VERSION = "golang.org/x/net@v0.62.0";
const CADDY_GO_JOSE_VERSION = "github.com/go-jose/go-jose/v4@v4.1.6";
const PATCHED_GO_VERSION = "1.27.4";

const [
  dependabot,
  caddyDockerfile,
  caddyfile,
  additionalSitesCompose,
  developmentSecuritySite,
  dockerfile,
  compose,
  workflow,
  preflight,
  nginxSpa,
  productionComposeSmoke,
  migrationFiles,
  internalTlsScript,
  postgresHba,
  vpsDeployHelper,
] = await Promise.all([
  readFile(DEPENDABOT_PATH, "utf8"),
  readFile(CADDY_DOCKERFILE_PATH, "utf8"),
  readFile(CADDYFILE_PATH, "utf8"),
  readFile(ADDITIONAL_SITES_COMPOSE_PATH, "utf8"),
  readFile(DEVELOPMENT_SECURITY_SITE_PATH, "utf8"),
  readFile(DOCKERFILE_PATH, "utf8"),
  readFile(COMPOSE_PATH, "utf8"),
  readFile(WORKFLOW_PATH, "utf8"),
  readFile(PREFLIGHT_PATH, "utf8"),
  readFile(NGINX_SPA_PATH, "utf8"),
  readFile(PRODUCTION_COMPOSE_SMOKE_PATH, "utf8"),
  readdir(MIGRATIONS_DIRECTORY),
  readFile(INTERNAL_TLS_SCRIPT_PATH, "utf8"),
  readFile(POSTGRES_HBA_PATH, "utf8"),
  readFile(VPS_DEPLOY_HELPER_PATH, "utf8"),
]);

function readLocationBlock(configuration, location) {
  const locationStart = configuration.indexOf(location);
  assert.ok(locationStart >= 0, `Nginx location must exist: ${location}`);
  const locationLineEnd = configuration.indexOf("\n", locationStart);
  const locationLine = configuration.slice(locationStart, locationLineEnd);
  const blockStart = locationStart + locationLine.lastIndexOf("{");
  assert.ok(blockStart >= 0, `Nginx location must open: ${location}`);
  let depth = 0;
  for (let index = blockStart; index < configuration.length; index += 1) {
    if (configuration[index] === "{") depth += 1;
    if (configuration[index] === "}") depth -= 1;
    if (depth === 0) return configuration.slice(blockStart + 1, index);
  }
  assert.fail(`Nginx location must close: ${location}`);
}

const npmUpdatesStart = dependabot.indexOf("- package-ecosystem: npm");
const actionsUpdatesStart = dependabot.indexOf(
  "- package-ecosystem: github-actions",
  npmUpdatesStart,
);
assert.ok(npmUpdatesStart >= 0, "Dependabot npm update rule must exist");
const npmUpdates = dependabot.slice(npmUpdatesStart, actionsUpdatesStart);
const typescriptIgnore = npmUpdates.match(
  /- dependency-name: typescript[\s\S]*?versions:\s*\[[^\]]+\]/,
);
assert.ok(typescriptIgnore, "TypeScript compatibility ignore must be present");
assert.ok(
  typescriptIgnore[0].includes(TYPESCRIPT_7_IGNORE),
  "Dependabot must not update TypeScript into major 7 while the parser is incompatible",
);
assert.ok(
  typescriptIgnore[0].includes("dependency-name: typescript"),
  "the TypeScript ignore must be scoped to that package only",
);

assert.match(
  caddyDockerfile,
  new RegExp(
    `^FROM golang:${PATCHED_GO_VERSION.replaceAll(".", "\\.")}-alpine AS caddy-build$`,
    "m",
  ),
);
assert.match(
  dockerfile,
  new RegExp(
    `^FROM golang:${PATCHED_GO_VERSION.replaceAll(".", "\\.")}-alpine AS gosu-build$`,
    "m",
  ),
);
const nodeBaseStage = dockerfile.split("FROM node-base AS pnpm-base")[0];
assert.match(nodeBaseStage, /^FROM node:26\.13\.0-trixie-slim AS node-base$/m);
assert.match(nodeBaseStage, /apt-get update[\s\S]*?apt-get upgrade -y/);
assert.match(nodeBaseStage, /rm -rf \/var\/lib\/apt\/lists\/\*/);
assert.ok(
  caddyDockerfile.includes(
    `test "$(git -C /src rev-parse HEAD)" = ${CADDY_SOURCE_COMMIT}`,
  ),
  "Caddy source must remain pinned to the reviewed commit",
);
assert.ok(
  caddyDockerfile.includes(`go get ${CADDY_X_NET_VERSION}`),
  "the Caddy source build must retain the patched x/net version",
);
assert.ok(
  caddyDockerfile.includes(CADDY_GO_JOSE_VERSION),
  "the Caddy source build must use the patched go-jose version",
);
const runtimeStageStart = caddyDockerfile.lastIndexOf("FROM caddy:");
assert.ok(runtimeStageStart >= 0, "a Caddy runtime stage must exist");
const runtimeStage = caddyDockerfile.slice(runtimeStageStart);
assert.match(runtimeStage, /^FROM caddy:2\.11\.7-alpine$/m);
const apkUpgradeIndex = runtimeStage.indexOf("RUN apk upgrade --no-cache");
const caddyCopyIndex = runtimeStage.indexOf(
  "COPY --from=caddy-build /caddy /usr/bin/caddy",
);
assert.ok(
  apkUpgradeIndex >= 0,
  "Caddy runtime packages must receive Alpine security updates",
);
assert.ok(
  caddyCopyIndex > apkUpgradeIndex,
  "the patched Caddy binary must be copied after the runtime image package upgrade",
);
assert.match(
  caddyfile,
  /tls\s*\{\s*protocols tls1\.2 tls1\.3\s*\}/,
  "public TLS must allow TLS 1.2 and 1.3 only",
);
assert.match(
  caddyfile,
  /reverse_proxy https:\/\/api:3000[\s\S]*?tls_trust_pool file \/run\/secrets\/internal_tls_ca\.crt/,
  "Caddy must verify the API upstream certificate against the internal CA",
);
assert.match(
  caddyfile,
  /reverse_proxy https:\/\/web:8443[\s\S]*?tls_trust_pool file \/run\/secrets\/internal_tls_ca\.crt/,
  "Caddy must verify the web upstream certificate against the internal CA",
);
assert.match(caddyfile, /^import \/etc\/caddy\/sites-enabled\/\*\.caddy$/m);
assert.match(developmentSecuritySite, /^desarrolloseguro\.org \{$/m);
assert.match(developmentSecuritySite, /^www\.desarrolloseguro\.org \{$/m);
assert.match(
  developmentSecuritySite,
  /^\s*reverse_proxy development-security-web:8080$/m,
);
assert.match(
  developmentSecuritySite,
  /^\s*redir https:\/\/desarrolloseguro\.org\{uri\} permanent$/m,
);
assert.match(developmentSecuritySite, /^\s*encode zstd gzip$/m);
assert.match(developmentSecuritySite, /^\s*protocols tls1\.2 tls1\.3$/m);
assert.match(
  developmentSecuritySite,
  /Strict-Transport-Security "max-age=31536000; includeSubDomains"/,
);
assert.doesNotMatch(
  developmentSecuritySite,
  /development-security-edge|development-security-api|postgres|\blog\s*\{/,
);
assert.match(additionalSitesCompose, /target: \/etc\/caddy\/sites-enabled/);
assert.match(additionalSitesCompose, /read_only: true/);
assert.match(additionalSitesCompose, /create_host_path: false/);
assert.match(
  additionalSitesCompose,
  /development-security-ingress:[\s\S]*external: true/,
);
assert.doesNotMatch(
  additionalSitesCompose,
  /development-security-edge|^  (api|db|web):/m,
);
assert.match(vpsDeployHelper, /readonly HELPER_VERSION=4/);
assert.match(
  vpsDeployHelper,
  /docker network inspect --format '\{\{\.Internal\}\}'/,
);
assert.match(workflow, /if \[\[ "\$helper_version" != 4 \]\]/);
assert.match(
  caddyfile,
  /Strict-Transport-Security "max-age=31536000; includeSubDomains"/,
  "the HTTPS site must send HSTS",
);

assert.match(
  workflow,
  /BUILDX_BUILDER: \$\{\{ steps\.buildx\.outputs\.name \}\}[\s\S]*?docker compose --parallel 4[\s\S]*?--file compose\.production\.yaml[\s\S]*?build --pull api web db proxy/,
  "CI must build all production images concurrently through Compose",
);
assert.match(
  workflow,
  /PROXY_IMAGE: grumphya-proxy:\$\{\{ github\.sha \}\}/,
  "the hardened Caddy image must use the current commit tag",
);
assert.ok(
  preflight.includes(POLICY_TEST_COMMAND),
  "CI must execute the container security policy guard",
);
assert.ok(
  preflight.includes("node scripts/test-ci-local.mjs"),
  "CI preflight must test the local CI wrapper before dependency installation",
);
assert.match(
  compose,
  /proxy:[\s\S]*?image:\s*\$\{PROXY_IMAGE:-grumphya-proxy:production\}/,
  "the production proxy fallback must select the hardened Caddy image",
);
assert.match(
  compose,
  /proxy:[\s\S]*?build:[\s\S]*?dockerfile:\s*docker\/Caddy\.Dockerfile/,
  "manual Compose builds must also use the hardened Caddy Dockerfile",
);

const webServiceStart = compose.indexOf("\n  web:");
const proxyServiceStart = compose.indexOf("\n  proxy:", webServiceStart);
assert.ok(webServiceStart >= 0 && proxyServiceStart > webServiceStart);
const webService = compose.slice(webServiceStart, proxyServiceStart);
const webHealthcheck = webService.match(
  /healthcheck:([\s\S]*?)\n    networks:/,
)?.[1];
assert.ok(webHealthcheck, "production web healthcheck must exist");
assert.match(
  webHealthcheck,
  /start_period:\s*30s/,
  "the web healthcheck must allow a cold-start grace period",
);
assert.match(
  webHealthcheck,
  /retries:\s*6/,
  "the web healthcheck must keep retrying after its warm-up period",
);
assert.match(
  webHealthcheck,
  /openssl s_client -quiet -verify_return_error -verify_hostname web -CAfile \/run\/secrets\/internal_tls_ca\.crt[\s\S]*-connect 127\.0\.0\.1:8443 -servername web/,
  "the static web healthcheck must verify the internal CA and hostname before probing the root route",
);
assert.match(compose, /PGSSL_MODE:\s*verify-full/);
assert.doesNotMatch(compose, /PGSSL_MODE:\s*disable-internal/);
assert.match(
  compose,
  /hba_file=\/etc\/postgresql\/pg_hba\.conf/,
  "PostgreSQL must load the strict TLS host authentication rules",
);
assert.match(postgresHba, /^hostnossl all all all reject$/m);
assert.match(postgresHba, /^hostssl all all all scram-sha-256$/m);
assert.match(
  compose,
  /ssl_min_protocol_version=TLSv1\.2/,
  "PostgreSQL must enforce a modern minimum TLS protocol",
);
assert.match(
  compose,
  /ssl_cert_file=\/run\/postgresql\/grumphya-tls\/server\.crt/,
  "PostgreSQL TLS material must stay outside the persistent data volume",
);
assert.match(
  compose,
  /ssl_key_file=\/run\/postgresql\/grumphya-tls\/server\.key/,
  "PostgreSQL private key must stay outside the persistent data volume",
);
assert.match(
  postgresHba,
  /^local all all trust$/m,
  "PostgreSQL initialization must retain local socket access",
);
assert.match(
  internalTlsScript,
  /Refusing to overwrite existing internal TLS material/,
  "internal certificate generation must avoid silently replacing existing trust roots",
);
assert.match(internalTlsScript, /DNS:api,IP:127\.0\.0\.1/);
assert.match(internalTlsScript, /DNS:web,IP:127\.0\.0\.1/);
assert.match(internalTlsScript, /DNS:db/);
const apiMainPath = "apps/api/src/main.ts";
const postgresPoolPath =
  "apps/api/src/infrastructure/database/postgres-pool.ts";
const postgresEntrypointPath = "docker/postgres-entrypoint.sh";
const [apiMain, postgresPool, postgresEntrypoint] = await Promise.all([
  readFile(apiMainPath, "utf8"),
  readFile(postgresPoolPath, "utf8"),
  readFile(postgresEntrypointPath, "utf8"),
]);
assert.match(
  apiMain,
  /httpsOptions[\s\S]*readRequiredTlsFile\("API_TLS_CERT_FILE"\)/,
);
assert.match(
  postgresPool,
  /rejectUnauthorized:\s*true[\s\S]*ca:\s*readFileSync\(caFile\)/,
);
assert.match(postgresEntrypoint, /install -o postgres -g postgres -m 0600/);
assert.match(
  vpsDeployHelper,
  /stat -c '%u' "\$SECRETS_DIR"\) == 0/,
  "the VPS secrets directory must be owned by root outside test mode",
);
assert.match(
  vpsDeployHelper,
  /stat -c '%u' "\$secret_path"\) == 0/,
  "each VPS secret and production environment file must be owned by root outside test mode",
);

const smokeStepStart = workflow.indexOf(
  "- name: Smoke test the scanned production images with isolated Compose resources",
);
const packageStepStart = workflow.indexOf(
  "- name: Save scanned release images",
);
assert.ok(
  smokeStepStart > 0 && packageStepStart > smokeStepStart,
  "CI must smoke test production images after scanning and before packaging",
);
assert.ok(
  workflow
    .slice(smokeStepStart, packageStepStart)
    .includes('bash scripts/test-production-compose.sh "${{ github.sha }}"'),
  "the production Compose smoke must use the exact scanned revision",
);
const qualityJobStart = workflow.indexOf("  quality-and-e2e:");
const e2eJobStart = workflow.indexOf("\n  e2e:", qualityJobStart);
const qualityJob = workflow.slice(qualityJobStart, e2eJobStart);
const earlyGuardStep = qualityJob.indexOf(
  "- name: Run production source preflight guards",
);
const installStep = qualityJob.indexOf("- run: pnpm install --frozen-lockfile");
assert.ok(
  earlyGuardStep >= 0 && earlyGuardStep < installStep,
  "production source guards must run before dependency installation",
);
assert.ok(
  qualityJob
    .slice(earlyGuardStep, installStep)
    .includes("bash scripts/ci-preflight.sh"),
  "early production source guards must execute the container security policy checks",
);
const webImageStageStart = dockerfile.indexOf(
  "FROM nginx:1.30-alpine AS web-production",
);
const webImageStageEnd = dockerfile.indexOf(
  "FROM pnpm-base AS production-dependencies",
);
assert.ok(webImageStageStart >= 0 && webImageStageEnd > webImageStageStart);
assert.match(
  dockerfile.slice(webImageStageStart, webImageStageEnd),
  /&& nginx -t/,
  "the static web image must validate its Nginx configuration during build",
);
assert.match(
  productionComposeSmoke,
  /up --detach --pull never --no-build --wait --wait-timeout 180/,
  "the Compose smoke must wait for the already-scanned production images without rebuilding or pulling",
);
assert.match(
  productionComposeSmoke,
  /force-recreate --wait --wait-timeout 180[\s\\]*db migrate api web proxy/,
  "the Compose smoke must recreate PostgreSQL and app services before checking persistence",
);
assert.match(
  productionComposeSmoke,
  /com\.grumphya\.ci\.stack/,
  "the smoke must label its private volumes before cleanup",
);
assert.match(
  productionComposeSmoke,
  /EDGE_SUBNET="10\.240\./,
  "the smoke must use a private test subnet instead of production's fixed subnet",
);
assert.match(
  productionComposeSmoke,
  /BACKEND_SUBNET="10\.241\./,
  "the smoke must use a private backend subnet instead of production's fixed subnet",
);
assert.match(
  productionComposeSmoke,
  /HTTP_PORT=\$\(\(18000 \+ NETWORK_SLOT\)\)/,
  "the smoke must bind HTTP on a test-only host port",
);
assert.match(
  productionComposeSmoke,
  /HTTPS_PORT=\$\(\(40000 \+ NETWORK_SLOT\)\)/,
  "the smoke must bind HTTPS on a test-only host port",
);
assert.match(
  productionComposeSmoke,
  /127\.0\.0\.1:\$HTTP_PORT:80/,
  "the smoke must expose its HTTP test port only on the loopback interface",
);
assert.match(
  productionComposeSmoke,
  /127\.0\.0\.1:\$HTTPS_PORT:443/,
  "the smoke must expose its HTTPS test ports only on the loopback interface",
);
assert.match(
  productionComposeSmoke,
  /docker inspect --format '\{\{json \.NetworkSettings\.Ports\}\}'/,
  "the smoke must verify internal services do not publish host ports",
);
assert.match(
  productionComposeSmoke,
  /assert_not_published web/,
  "the static web service must not publish a host port",
);
assert.match(
  productionComposeSmoke,
  /on_error\(\)[\s\S]*?docker inspect --format '\{\{json \.State\.Health\}\}' "\$web_container"[\s\S]*?logs --no-color --tail=100 web/,
  "the smoke failure handler must report web health details and recent logs",
);
assert.match(
  productionComposeSmoke,
  /Database container health details:[\s\S]*?docker inspect --format '\{\{json \.State\.Health\}\}' "\$db_container"[\s\S]*?API container health details:[\s\S]*?docker inspect --format '\{\{json \.State\.Health\}\}' "\$api_container"/,
  "the smoke failure handler must retain database and API health signals",
);
assert.doesNotMatch(
  productionComposeSmoke,
  /logs --no-color --tail=100 (?:db|api)/,
  "the smoke failure handler must not expose raw database or API logs",
);
assert.match(
  productionComposeSmoke,
  /assert_proxy_ports[\s\S]*?const expected = \{[\s\S]*?"80\/tcp"[\s\S]*?"443\/tcp"[\s\S]*?"443\/udp"[\s\S]*?assert\.deepEqual\(publishedPorts, Object\.keys\(expected\)\.sort\(\)\)/,
  "the proxy must be the only published service and expose only HTTP/HTTPS",
);
assert.match(
  productionComposeSmoke,
  /const publishedPorts = Object\.entries\(ports\)[\s\S]*?\.filter\(\(\[, bindings\]\) => Array\.isArray\(bindings\) && bindings\.length > 0\)[\s\S]*?\.map\(\(\[containerPort\]\) => containerPort\)/,
  "the proxy port check must ignore image-exposed ports without host bindings",
);
const publishedPortsLogic = productionComposeSmoke.match(
  /const publishedPorts = Object\.entries\(ports\)[\s\S]*?\.sort\(\);/,
);
assert.ok(
  publishedPortsLogic,
  "the smoke must identify ports bound to the host",
);
const getPublishedPorts = (ports) =>
  Array.from(
    runInNewContext(`${publishedPortsLogic[0]} publishedPorts`, { ports }),
  );
const expectedPublishedPorts = ["443/tcp", "443/udp", "80/tcp"];
assert.deepEqual(
  Array.from(
    getPublishedPorts({
      "80/tcp": [{ HostIp: "127.0.0.1", HostPort: "18001" }],
      "443/tcp": [{ HostIp: "127.0.0.1", HostPort: "40001" }],
      "443/udp": [{ HostIp: "127.0.0.1", HostPort: "40001" }],
      "2019/tcp": null,
    }),
  ),
  expectedPublishedPorts,
  "Caddy's exposed but unpublished admin port must not count as a host binding",
);
assert.deepEqual(
  Array.from(
    getPublishedPorts({
      "80/tcp": [{ HostIp: "127.0.0.1", HostPort: "18001" }],
      "443/tcp": [{ HostIp: "127.0.0.1", HostPort: "40001" }],
      "443/udp": [{ HostIp: "127.0.0.1", HostPort: "40001" }],
      "2019/tcp": [{ HostIp: "0.0.0.0", HostPort: "2019" }],
    }),
  ),
  [...expectedPublishedPorts, "2019/tcp"].sort(),
  "the smoke must detect Caddy's admin port if it is published to the host",
);
assert.match(
  productionComposeSmoke,
  /HostIp,\s*"127\.0\.0\.1"/,
  "the smoke must verify that every test-only proxy binding is loopback-only",
);
assert.match(
  productionComposeSmoke,
  /permissionsPolicy[\s\S]*?microphone=\\\(self\\\)[\s\S]*?on-device-speech-recognition=\\\(self\\\)/,
  "the HTTPS smoke must preserve the voice dictation permissions policy",
);
assert.doesNotMatch(
  productionComposeSmoke,
  /\bdown\s+-v\b|volume\s+prune/,
  "the smoke must not use broad volume deletion commands",
);
assert.match(
  productionComposeSmoke,
  /if \[\[ \$label == "\$STACK_ID" \]\]; then[\s\S]*?docker volume rm "\$volume"/,
  "cleanup must delete a volume only after confirming it belongs to this smoke run",
);
assert.match(
  productionComposeSmoke,
  /for volume in[\s\S]*?"\$STACK_ID-postgres"[\s\S]*?"\$STACK_ID-avatars"[\s\S]*?"\$STACK_ID-caddy-data"[\s\S]*?"\$STACK_ID-caddy-config"/,
  "cleanup must restrict volume deletion to the four explicitly named smoke volumes",
);
assert.match(
  productionComposeSmoke,
  /if \[\[ \$MODE == --validate-only \]\]; then[\s\S]*?config --quiet[\s\S]*?exit 0/,
  "validate-only mode must validate the generated Compose config without starting containers",
);
const validateOnlyBlock = productionComposeSmoke.match(
  /if \[\[ \$MODE == --validate-only \]\]; then([\s\S]*?)\nfi/,
)?.[1];
assert.ok(
  validateOnlyBlock,
  "validate-only mode must have a bounded control-flow block",
);
assert.doesNotMatch(
  validateOnlyBlock,
  /"\$\{compose\[@\]\}"\s+(up|down|start|stop|rm)\b/,
  "validate-only mode must not start or stop Compose services",
);

const htmlEntryLocation = readLocationBlock(nginxSpa, "location = /index.html");
assert.match(
  nginxSpa,
  /\bserver_tokens off;/,
  "Nginx must not disclose its version",
);
const wwwSiteStart = caddyfile.indexOf("www.{$DOMAIN} {");
const additionalSitesStart = caddyfile.indexOf(
  "import /etc/caddy/sites-enabled/*.caddy",
  wwwSiteStart,
);
assert.ok(wwwSiteStart > 0 && additionalSitesStart > wwwSiteStart);
for (const site of [
  caddyfile.slice(0, wwwSiteStart),
  caddyfile.slice(wwwSiteStart, additionalSitesStart),
]) {
  assert.match(
    site,
    /^\s*(?:header\s+)?-Server\s*$/m,
    "both Caddy hosts must remove the Server header",
  );
}
assert.match(
  htmlEntryLocation,
  /add_header Cache-Control "no-cache" always;/,
  "the HTML entry point must revalidate so deployments can update clients",
);
assert.match(htmlEntryLocation, /try_files \$uri =404;/);

const homeLocation = readLocationBlock(nginxSpa, "location = / {");
assert.match(
  homeLocation,
  /add_header Link "<\/assets\/grumphya\/home-grumpy-judge\.webp>; rel=preload; as=image; fetchpriority=high; media=\\"\(min-width: 768px\)\\"" always;/,
  "the Home hero must be preloaded only for desktop from its initial response",
);
assert.match(
  homeLocation,
  /default_type text\/html;/,
  "the root route must retain the HTML content type when serving the extensionless URI",
);
assert.match(
  homeLocation,
  /try_files \/index\.html =404;/,
  "the root route must resolve the HTML entry through the configured document root",
);
assert.doesNotMatch(
  homeLocation,
  /\balias\b/,
  "the root route must not use alias, which can append index.html twice",
);

const spaFallbackLocation = readLocationBlock(nginxSpa, "location / {");
assert.match(
  spaFallbackLocation,
  /try_files \$uri \$uri\.html \/app\.html;/,
  "SPA routes must resolve files or the app shell without directory redirects",
);
assert.doesNotMatch(
  spaFallbackLocation,
  /\$uri\//,
  "SPA routes must not redirect to internal Nginx directory URLs",
);

const newConventionMigrations = migrationFiles
  .filter((file) => /^\d{3}_.+\.sql$/.test(file))
  .filter((file) => Number.parseInt(file.slice(0, 3), 10) >= 29);
const newConventionMigrationSources = await Promise.all(
  newConventionMigrations.map((file) =>
    readFile(`${MIGRATIONS_DIRECTORY}/${file}`, "utf8"),
  ),
);
for (const [
  index,
  migrationSource,
] of newConventionMigrationSources.entries()) {
  assert.match(
    migrationSource,
    /^-- deployment-rollback-compatible: true(?:\r?\n|$)/,
    `migration ${newConventionMigrations[index]} must declare rollback compatibility`,
  );
}
const hashedAssetsLocation = readLocationBlock(
  nginxSpa,
  'location ~* "^/assets/.+[.-][A-Za-z0-9_-]{8,}\\.(?:js|css)$"',
);
assert.match(
  nginxSpa,
  /location ~\* "[^"\n]*\{8,[^"\n]*" \{/,
  "Nginx regex locations with quantifier braces must be quoted",
);
assert.match(
  hashedAssetsLocation,
  /add_header Cache-Control "public, max-age=31536000, immutable";/,
  "fingerprinted JavaScript and CSS assets must receive immutable long-lived caching",
);
assert.match(hashedAssetsLocation, /try_files \$uri =404;/);

const staticAssetsLocation = readLocationBlock(nginxSpa, "location /assets/");
assert.match(
  staticAssetsLocation,
  /add_header Cache-Control "public, max-age=2592000";/,
  "unfingerprinted public assets must receive bounded caching",
);
assert.match(staticAssetsLocation, /try_files \$uri =404;/);

const legacyPrototypeLocation = readLocationBlock(
  nginxSpa,
  "location ^~ /desarrollo-seguro/",
);
const legacyPrototypeRootLocation = readLocationBlock(
  nginxSpa,
  "location = /desarrollo-seguro",
);
const externalRedirect = /return 308 https:\/\/desarrolloseguro\.org\/;/;
for (const location of [legacyPrototypeRootLocation, legacyPrototypeLocation]) {
  assert.match(location, /add_header Allow "GET, HEAD" always;/);
  assert.match(
    location,
    /if \(\$request_method !~ \^\(GET\|HEAD\)\$\) \{ return 405; \}[\s\S]*?return 308 https:\/\/desarrolloseguro\.org\/;/,
    "legacy redirects must reject methods with bodies before returning 308",
  );
  assert.match(location, externalRedirect);
}
assert.doesNotMatch(dockerfile, /COPY --from=web-build \/workspace\/prototype/);

process.stdout.write("Container security policy guards passed.\n");
