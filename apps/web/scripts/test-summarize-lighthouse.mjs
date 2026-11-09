import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT_PATH = "apps/web/scripts/summarize-lighthouse.mjs";
const COMMIT_SHA = "a".repeat(40);
const PAGES = ["/", "/precios", "/lo-peor-de-lo-peor"];
const DEVICES = ["mobile", "desktop"];
const REPORT_NAME = "home-0.report.json";
const tempRoot = await mkdtemp(join(tmpdir(), "grumphya-lighthouse-summary-"));
const reportsRoot = join(tempRoot, "reports");
const outputPath = join(tempRoot, "summary.json");

function createReport(pathname, device, sample) {
  return {
    finalDisplayedUrl: `http://127.0.0.1:4173${pathname}`,
    configSettings: { formFactor: device },
    categories: {
      performance: { score: [0.7, 0.8, 0.9][sample] },
      accessibility: { score: 0.9 },
      "best-practices": { score: 1 },
      seo: { score: 0.8 },
    },
    audits: {
      "network-requests": {
        details: {
          items: [{ url: `http://127.0.0.1:4173${pathname}`, statusCode: 200 }],
        },
      },
      "largest-contentful-paint": { numericValue: 1000 + sample * 100 },
      "cumulative-layout-shift": { numericValue: sample / 100 },
      "total-blocking-time": { numericValue: 50 + sample * 10 },
      "speed-index": { numericValue: 1300 + sample * 100 },
    },
  };
}

function runSummary() {
  return spawnSync(process.execPath, [SCRIPT_PATH, reportsRoot, outputPath], {
    encoding: "utf8",
    env: { ...process.env, GITHUB_SHA: COMMIT_SHA },
  });
}

const firstReportPath = join(reportsRoot, DEVICES[0], REPORT_NAME);

try {
  for (const device of DEVICES) {
    const directory = join(reportsRoot, device);
    await mkdir(directory, { recursive: true });
    for (const [pageIndex, pathname] of PAGES.entries()) {
      for (let sample = 0; sample < 3; sample += 1) {
        await writeFile(
          join(
            directory,
            `${pageIndex === 0 ? "home" : pageIndex}-${sample}.report.json`,
          ),
          JSON.stringify(createReport(pathname, device, sample)),
        );
      }
    }
  }

  const success = runSummary();
  assert.equal(success.status, 0, success.stderr);
  const summary = JSON.parse(await readFile(outputPath, "utf8"));
  assert.equal(summary.runs.length, 6);
  const homeMobile = summary.runs.find(
    (run) => run.page === "home" && run.device === "mobile",
  );
  assert.equal(homeMobile?.sampleCount, 3);
  assert.equal(homeMobile?.performance, 0.8);
  assert.equal(homeMobile?.lcpMs, 1100);
  assert.equal(homeMobile?.commitSha, COMMIT_SHA);

  const originalReport = JSON.parse(await readFile(firstReportPath, "utf8"));
  const invalidCases = [
    {
      name: "failed page request",
      change: (report) => {
        report.audits["network-requests"].details.items[0].statusCode = 404;
      },
      error: /peticiones fallidas/,
    },
    {
      name: "successful external request",
      change: (report) => {
        report.audits["network-requests"].details.items[0].url =
          "https://example.test/asset.js";
      },
      error: /peticiones fallidas o externas/,
    },
    {
      name: "missing performance metric",
      change: (report) => {
        delete report.audits["largest-contentful-paint"].numericValue;
      },
      error: /Faltan métricas Lighthouse/,
    },
    {
      name: "unexpected report origin",
      change: (report) => {
        report.finalDisplayedUrl = "https://example.test/";
      },
      error: /Informe Lighthouse inesperado/,
    },
  ];
  for (const { name, change, error } of invalidCases) {
    const report = structuredClone(originalReport);
    change(report);
    await writeFile(firstReportPath, JSON.stringify(report));
    await rm(outputPath, { force: true });
    const result = runSummary();
    assert.notEqual(result.status, 0, name);
    assert.match(result.stderr, error, name);
    await assert.rejects(readFile(outputPath), undefined, name);
  }
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

console.log("Lighthouse summary scenarios passed.");
