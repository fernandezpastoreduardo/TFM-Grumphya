import { readFile } from "node:fs/promises";

const WEB_PACKAGE_PATH = new URL("../apps/web/package.json", import.meta.url);
const EXACT_VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const REACT_PACKAGE_NAMES = ["react", "react-dom"];

const packageManifest = JSON.parse(await readFile(WEB_PACKAGE_PATH, "utf8"));
const runtimeVersions = REACT_PACKAGE_NAMES.map((packageName) => ({
  name: packageName,
  version: packageManifest.dependencies?.[packageName],
}));

const hasExactVersions = runtimeVersions.every(({ version }) =>
  EXACT_VERSION_PATTERN.test(version ?? ""),
);
const versionsMatch = runtimeVersions.every(
  ({ version }) => version === runtimeVersions[0].version,
);

if (!hasExactVersions || !versionsMatch) {
  const formattedVersions = runtimeVersions
    .map(({ name, version }) => `${name}=${String(version)}`)
    .join(", ");

  console.error(
    `React runtime versions must be pinned to the same exact version; found ${formattedVersions}.`,
  );
  process.exitCode = 1;
} else {
  console.log(
    `React runtime pair is aligned at ${runtimeVersions[0].version}.`,
  );
}
