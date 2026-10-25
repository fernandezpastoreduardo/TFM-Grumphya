import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const DEPENDABOT_PATH = ".github/dependabot.yml";
const CADDY_DOCKERFILE_PATH = "docker/Caddy.Dockerfile";
const DOCKERFILE_PATH = "Dockerfile";
const COMPOSE_PATH = "compose.production.yaml";
const NGINX_SPA_PATH = "docker/nginx-spa.conf";
const WORKFLOW_PATH = ".github/workflows/ci.yml";
const PRODUCTION_COMPOSE_SMOKE_PATH = "scripts/test-production-compose.sh";
const TYPESCRIPT_7_IGNORE = 'versions: [">=7.0.0"]';
const POLICY_TEST_COMMAND = "node scripts/test-container-security-policy.mjs";
const CADDY_SOURCE_COMMIT = "72dd0fb067f6d7826c7f79907670ba4a713bfe37";
const CADDY_X_NET_VERSION = "golang.org/x/net@v0.60.0";

const [
  dependabot,
  caddyDockerfile,
  dockerfile,
  compose,
  workflow,
  nginxSpa,
  productionComposeSmoke,
] = await Promise.all([
  readFile(DEPENDABOT_PATH, "utf8"),
  readFile(CADDY_DOCKERFILE_PATH, "utf8"),
  readFile(DOCKERFILE_PATH, "utf8"),
  readFile(COMPOSE_PATH, "utf8"),
  readFile(WORKFLOW_PATH, "utf8"),
  readFile(NGINX_SPA_PATH, "utf8"),
  readFile(PRODUCTION_COMPOSE_SMOKE_PATH, "utf8"),
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

assert.match(caddyDockerfile, /^FROM golang:1\.27\.3-alpine AS caddy-build$/m);
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
  workflow,
  /docker build --pull --file docker\/Caddy\.Dockerfile --tag grumphya-proxy:\$\{\{ github\.sha \}\}/,
  "CI must build and scan the hardened Caddy image",
);
assert.ok(
  workflow.includes(POLICY_TEST_COMMAND),
  "CI must execute the container security policy guard",
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

const smokeStepStart = workflow.indexOf(
  "- name: Smoke test the scanned production images with isolated Compose resources",
);
const packageStepStart = workflow.indexOf(
  "- name: Package the already-scanned release images",
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
const webImageStageStart = dockerfile.indexOf(
  "FROM nginx:1.30-alpine AS web-production",
);
const webImageStageEnd = dockerfile.indexOf(
  "FROM pnpm-base AS production-dependencies",
);
assert.ok(webImageStageStart >= 0 && webImageStageEnd > webImageStageStart);
assert.match(
  dockerfile.slice(webImageStageStart, webImageStageEnd),
  /RUN nginx -t/,
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
  /assert_proxy_ports[\s\S]*?"80\/tcp"[\s\S]*?"443\/tcp"[\s\S]*?"443\/udp"/,
  "the proxy must be the only published service and expose only HTTP/HTTPS",
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

const htmlEntryLocation = readLocationBlock(nginxSpa, "location = /index.html");
assert.match(
  htmlEntryLocation,
  /add_header Cache-Control "no-cache" always;/,
  "the HTML entry point must revalidate so deployments can update clients",
);
assert.match(htmlEntryLocation, /try_files \$uri =404;/);

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

process.stdout.write("Container security policy guards passed.\n");
