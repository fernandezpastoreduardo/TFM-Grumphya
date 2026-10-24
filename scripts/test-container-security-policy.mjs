import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const DEPENDABOT_PATH = ".github/dependabot.yml";
const CADDY_DOCKERFILE_PATH = "docker/Caddy.Dockerfile";
const COMPOSE_PATH = "compose.production.yaml";
const NGINX_SPA_PATH = "docker/nginx-spa.conf";
const WORKFLOW_PATH = ".github/workflows/ci.yml";
const TYPESCRIPT_7_IGNORE = 'versions: [">=7.0.0"]';
const POLICY_TEST_COMMAND = "node scripts/test-container-security-policy.mjs";
const CADDY_SOURCE_COMMIT = "72dd0fb067f6d7826c7f79907670ba4a713bfe37";
const CADDY_X_NET_VERSION = "golang.org/x/net@v0.60.0";

const [dependabot, caddyDockerfile, compose, workflow, nginxSpa] =
  await Promise.all([
    readFile(DEPENDABOT_PATH, "utf8"),
    readFile(CADDY_DOCKERFILE_PATH, "utf8"),
    readFile(COMPOSE_PATH, "utf8"),
    readFile(WORKFLOW_PATH, "utf8"),
    readFile(NGINX_SPA_PATH, "utf8"),
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

const htmlEntryLocation = readLocationBlock(nginxSpa, "location = /index.html");
assert.match(
  htmlEntryLocation,
  /add_header Cache-Control "no-cache" always;/,
  "the HTML entry point must revalidate so deployments can update clients",
);
assert.match(htmlEntryLocation, /try_files \$uri =404;/);

const hashedAssetsLocation = readLocationBlock(
  nginxSpa,
  "location ~* ^/assets/.+[.-][A-Za-z0-9_-]{8,}\\.(?:js|css)$",
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
