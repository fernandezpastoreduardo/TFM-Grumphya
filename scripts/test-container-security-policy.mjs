import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const DEPENDABOT_PATH = ".github/dependabot.yml";
const CADDY_DOCKERFILE_PATH = "docker/Caddy.Dockerfile";
const COMPOSE_PATH = "compose.production.yaml";
const WORKFLOW_PATH = ".github/workflows/ci.yml";
const TYPESCRIPT_7_IGNORE = 'versions: [">=7.0.0"]';
const CADDY_SOURCE_COMMIT = "72dd0fb067f6d7826c7f79907670ba4a713bfe37";
const CADDY_X_NET_VERSION = "golang.org/x/net@v0.60.0";

const [dependabot, caddyDockerfile, compose, workflow] = await Promise.all([
  readFile(DEPENDABOT_PATH, "utf8"),
  readFile(CADDY_DOCKERFILE_PATH, "utf8"),
  readFile(COMPOSE_PATH, "utf8"),
  readFile(WORKFLOW_PATH, "utf8"),
]);

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

process.stdout.write("Container security policy guards passed.\n");
