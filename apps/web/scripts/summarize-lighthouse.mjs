import { readdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

const REPORT_DIRECTORY = resolve(process.argv[2] ?? ".lighthouseci");
const OUTPUT_PATH = resolve(process.argv[3] ?? "/tmp/lighthouse-quality.json");
const PREVIEW_ORIGIN = "http://127.0.0.1:4173";
const PAGE_BY_PATH = new Map([
  ["/", "home"],
  ["/precios", "precios"],
  ["/lo-peor-de-lo-peor", "lo-peor-de-lo-peor"],
]);
const SCORE_KEYS = ["performance", "accessibility", "best-practices", "seo"];
const AUDIT_KEYS = {
  lcpMs: "largest-contentful-paint",
  cls: "cumulative-layout-shift",
  tbtMs: "total-blocking-time",
  speedIndexMs: "speed-index",
};
const EXPECTED_COMBINATIONS = 6;
const EXPECTED_SAMPLES = 3;

async function findReports(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => findReports(resolve(directory, entry.name))),
  );
  const reports = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".report.json"))
    .map((entry) => resolve(directory, entry.name));
  return [...reports, ...nested.flat()];
}

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0
    ? (ordered[middle - 1] + ordered[middle]) / 2
    : ordered[middle];
}

function readMetric(report, auditId) {
  const value = report.audits?.[auditId]?.numericValue;
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

const commitSha = process.env.GITHUB_SHA ?? "";
if (!/^[a-f0-9]{40}$/u.test(commitSha)) {
  throw new Error("GITHUB_SHA no es válido para resumir Lighthouse.");
}
const files = (
  await Promise.all(
    ["mobile", "desktop"].map((device) =>
      findReports(resolve(REPORT_DIRECTORY, device)),
    ),
  )
).flat();
const grouped = new Map();

for (const file of files) {
  const report = JSON.parse(await readFile(file, "utf8"));
  const finalUrl = new URL(report.finalDisplayedUrl);
  const page = PAGE_BY_PATH.get(finalUrl.pathname);
  const device = report.configSettings?.formFactor;
  if (
    report.runtimeError ||
    finalUrl.origin !== PREVIEW_ORIGIN ||
    !page ||
    (device !== "mobile" && device !== "desktop")
  ) {
    throw new Error(`Informe Lighthouse inesperado en ${basename(file)}.`);
  }
  const requests = report.audits?.["network-requests"]?.details?.items;
  if (
    !Array.isArray(requests) ||
    requests.some(
      (request) =>
        typeof request.url !== "string" ||
        !URL.canParse(request.url) ||
        new URL(request.url).origin !== PREVIEW_ORIGIN ||
        (typeof request.statusCode === "number" && request.statusCode >= 400),
    )
  ) {
    throw new Error(
      `La página tiene peticiones fallidas o externas en ${basename(file)}.`,
    );
  }
  const scores = Object.fromEntries(
    SCORE_KEYS.map((key) => [key, report.categories?.[key]?.score]),
  );
  if (
    Object.values(scores).some(
      (score) => typeof score !== "number" || score < 0 || score > 1,
    )
  ) {
    throw new Error(
      `Faltan puntuaciones Lighthouse válidas en ${basename(file)}.`,
    );
  }
  const key = `${page}:${device}`;
  const samples = grouped.get(key) ?? [];
  const metrics = Object.fromEntries(
    Object.entries(AUDIT_KEYS).map(([name, auditId]) => [
      name,
      readMetric(report, auditId),
    ]),
  );
  if (Object.values(metrics).some((metric) => metric === null)) {
    throw new Error(`Faltan métricas Lighthouse en ${basename(file)}.`);
  }
  samples.push({ scores, metrics });
  grouped.set(key, samples);
}

if (grouped.size !== EXPECTED_COMBINATIONS) {
  throw new Error(
    `Se esperaban ${EXPECTED_COMBINATIONS} grupos de Lighthouse y llegaron ${grouped.size}.`,
  );
}
const measuredAt = new Date().toISOString();
const runs = [];
for (const [key, samples] of grouped) {
  if (samples.length !== EXPECTED_SAMPLES) {
    throw new Error(
      `El grupo ${key} tiene ${samples.length} mediciones; se requieren ${EXPECTED_SAMPLES}.`,
    );
  }
  const [page, device] = key.split(":");
  const scoreMedian = (name) =>
    median(samples.map((sample) => sample.scores[name]));
  const metricMedian = (name) =>
    median(samples.map((sample) => sample.metrics[name]));
  runs.push({
    commitSha,
    measuredAt,
    page,
    device,
    sampleCount: EXPECTED_SAMPLES,
    performance: scoreMedian("performance"),
    accessibility: scoreMedian("accessibility"),
    bestPractices: scoreMedian("best-practices"),
    seo: scoreMedian("seo"),
    lcpMs: metricMedian("lcpMs"),
    cls: metricMedian("cls"),
    tbtMs: metricMedian("tbtMs"),
    speedIndexMs: metricMedian("speedIndexMs"),
  });
}

await writeFile(OUTPUT_PATH, `${JSON.stringify({ runs })}\n`, { mode: 0o600 });
process.stdout.write(
  `Resumen sintético Lighthouse generado: ${runs.length} resultados.\n`,
);
