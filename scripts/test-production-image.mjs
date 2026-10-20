import { execFileSync } from "node:child_process";

const imageReference = process.argv[2];

if (!imageReference) {
  process.stderr.write(
    "Usage: node scripts/test-production-image.mjs <image>\n",
  );
  process.exit(2);
}

const IMAGE_PROBE = String.raw`
const { createRequire } = require("node:module");
const { existsSync, readdirSync } = require("node:fs");
const requireFromApp = createRequire("/workspace/apps/api/package.json");
const runtimeDependencies = ["@nestjs/core", "bcryptjs", "pg", "sharp"];
const packageManagers = [
  "/usr/local/bin/npm",
  "/usr/local/bin/npx",
  "/usr/local/bin/corepack",
  "/usr/local/bin/pnpm",
  "/usr/local/bin/pnpx",
  "/usr/local/bin/yarn",
  "/usr/local/bin/yarnpkg",
];
const migrationsDirectory = "/workspace/apps/api/migrations";
const migrationFiles = readdirSync(migrationsDirectory).filter((file) => file.endsWith(".sql"));
const result = {
  nodeEnv: process.env.NODE_ENV,
  uid: process.getuid?.(),
  dependencies: runtimeDependencies.map((dependency) => [dependency, requireFromApp.resolve(dependency)]),
  migrationCount: migrationFiles.length,
  packageManagersPresent: packageManagers.filter(existsSync),
};
process.stdout.write(JSON.stringify(result));
`;

let output;
try {
  output = execFileSync(
    "docker",
    ["run", "--rm", "--entrypoint", "node", imageReference, "-e", IMAGE_PROBE],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
} catch (error) {
  process.stderr.write(
    "The production image could not complete its runtime probe.\n",
  );
  if (error.stderr) process.stderr.write(error.stderr);
  process.exit(1);
}

let imageContract;
try {
  imageContract = JSON.parse(output);
} catch {
  process.stderr.write(
    "The production image returned an invalid runtime probe result.\n",
  );
  process.exit(1);
}

const hasImageContractShape =
  imageContract !== null &&
  typeof imageContract === "object" &&
  typeof imageContract.nodeEnv === "string" &&
  typeof imageContract.uid === "number" &&
  Array.isArray(imageContract.dependencies) &&
  imageContract.dependencies.every(
    (dependency) =>
      Array.isArray(dependency) &&
      dependency.length === 2 &&
      dependency.every((value) => typeof value === "string"),
  ) &&
  Number.isInteger(imageContract.migrationCount) &&
  Array.isArray(imageContract.packageManagersPresent) &&
  imageContract.packageManagersPresent.every(
    (path) => typeof path === "string",
  );

if (!hasImageContractShape) {
  process.stderr.write(
    "The production image returned an invalid runtime probe result.\n",
  );
  process.exit(1);
}

const failures = [];
if (imageContract.nodeEnv !== "production")
  failures.push("NODE_ENV is not production");
if (!Number.isInteger(imageContract.uid) || imageContract.uid === 0) {
  failures.push("the application process is not running as a non-root user");
}
if (imageContract.dependencies.length !== 4) {
  failures.push("a required runtime dependency is unavailable");
}
if (imageContract.migrationCount === 0) {
  failures.push("production database migrations are missing");
}
if (imageContract.packageManagersPresent.length > 0) {
  failures.push("package-manager executables remain in the runtime image");
}

if (failures.length > 0) {
  process.stderr.write(
    `Production image contract failed: ${failures.join("; ")}.\n`,
  );
  process.exit(1);
}

process.stdout.write(
  `Production image contract passed: ${imageContract.dependencies.length} runtime dependencies, ${imageContract.migrationCount} migrations, non-root user.\n`,
);
