import assert from "node:assert/strict";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const [reportDirectoryArgument, outputPathArgument] = process.argv.slice(2);
const REPORT_DIRECTORY = resolve(reportDirectoryArgument ?? "");
const OUTPUT_PATH = resolve(outputPathArgument ?? "");
const REPORT_SUFFIXES = [".vuln.json", ".secret.json"];
const HIGH_SEVERITY = "HIGH";
const CRITICAL_SEVERITY = "CRITICAL";

assert.ok(
  reportDirectoryArgument && outputPathArgument,
  "Faltan rutas de entrada o salida.",
);

const filenames = (await readdir(REPORT_DIRECTORY)).filter((filename) =>
  REPORT_SUFFIXES.some((suffix) => filename.endsWith(suffix)),
);
assert.ok(
  filenames.length >= 8,
  "Faltan informes de seguridad de las imágenes.",
);

const vulnerabilityIds = new Set();
const secretIds = new Set();
let highRiskCount = 0;
let criticalRiskCount = 0;

for (const filename of filenames) {
  const report = JSON.parse(
    await readFile(resolve(REPORT_DIRECTORY, filename), "utf8"),
  );
  assert.ok(
    report && typeof report === "object" && Array.isArray(report.Results),
  );
  for (const result of report.Results) {
    if (!result || typeof result !== "object") continue;
    if (filename.endsWith(".vuln.json")) {
      for (const vulnerability of result.Vulnerabilities ?? []) {
        if (!vulnerability || typeof vulnerability !== "object") continue;
        const id = `${filename}:${vulnerability.VulnerabilityID}:${vulnerability.PkgName}`;
        if (vulnerability.Severity === HIGH_SEVERITY) {
          vulnerabilityIds.add(id);
          highRiskCount += 1;
        }
        if (vulnerability.Severity === CRITICAL_SEVERITY) {
          vulnerabilityIds.add(id);
          criticalRiskCount += 1;
        }
      }
    }
    if (filename.endsWith(".secret.json")) {
      for (const secret of result.Secrets ?? []) {
        if (!secret || typeof secret !== "object") continue;
        const id = `${filename}:${secret.RuleID}:${secret.Category}:${secret.StartLine}`;
        secretIds.add(id);
      }
    }
  }
}

const results = {
  trivy: {
    status:
      highRiskCount === 0 && criticalRiskCount === 0 && secretIds.size === 0
        ? "passed"
        : "failed",
    severity: [HIGH_SEVERITY, CRITICAL_SEVERITY],
    ignoreUnfixed: true,
  },
  highRiskCount,
  criticalRiskCount,
  secretCount: secretIds.size,
  uniqueVulnerabilityCount: vulnerabilityIds.size,
};
await writeFile(OUTPUT_PATH, `${JSON.stringify(results)}\n`, { mode: 0o600 });
process.stdout.write(
  `Image security summary: high=${highRiskCount}, critical=${criticalRiskCount}, secrets=${secretIds.size}.\n`,
);
if (results.trivy.status !== "passed") process.exitCode = 1;
