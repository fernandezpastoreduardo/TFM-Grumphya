import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_KEY = "grumphya";
const DEFAULT_REPORT_PATH = ".scannerwork/report-task.txt";
const DEFAULT_MAX_ATTEMPTS = 30;
const DEFAULT_POLL_INTERVAL_MS = 2000;

function parseReportTask(contents) {
  const entries = Object.fromEntries(
    contents
      .split(/\r?\n/)
      .filter((line) => line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
  if (
    entries.projectKey !== PROJECT_KEY ||
    !/^[A-Za-z0-9_-]+$/.test(entries.ceTaskId ?? "")
  ) {
    throw new Error(
      "SonarQube task report is missing or belongs to another project",
    );
  }
  return entries;
}

function validateLocalUrl(hostUrl) {
  const url = new URL(hostUrl);
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("SonarQube URL must be a local HTTP tunnel");
  }
  return url;
}

async function requestJson(url, token, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new Error("SonarQube API is unavailable");
  }
  if (!response.ok) {
    throw new Error(`SonarQube API returned HTTP ${response.status}`);
  }
  try {
    return await response.json();
  } catch {
    throw new Error("SonarQube API returned invalid JSON");
  }
}

export async function verifySonarQubeGate({
  reportTaskPath = DEFAULT_REPORT_PATH,
  token,
  hostUrl,
  fetchImpl = fetch,
  sleep = (duration) => new Promise((done) => setTimeout(done, duration)),
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
}) {
  if (!token || !hostUrl || !Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new Error("SonarQube verification configuration is incomplete");
  }
  const baseUrl = validateLocalUrl(hostUrl);
  const report = parseReportTask(await readFile(reportTaskPath, "utf8"));
  if (new URL(report.serverUrl).origin !== baseUrl.origin) {
    throw new Error("SonarQube task report points to a different server");
  }

  let analysisId;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const taskUrl = new URL("/api/ce/task", baseUrl);
    taskUrl.searchParams.set("id", report.ceTaskId);
    const task = (await requestJson(taskUrl, token, fetchImpl)).task;
    if (task?.id !== report.ceTaskId || task?.componentKey !== PROJECT_KEY) {
      throw new Error("SonarQube returned an unexpected compute task");
    }
    if (task.status === "SUCCESS") {
      analysisId = task.analysisId;
      break;
    }
    if (!["PENDING", "IN_PROGRESS"].includes(task.status)) {
      throw new Error(
        `SonarQube analysis did not complete: ${task.status ?? "unknown"}`,
      );
    }
    if (attempt + 1 < maxAttempts) await sleep(pollIntervalMs);
  }
  if (!analysisId || !/^[A-Za-z0-9_-]+$/.test(analysisId)) {
    throw new Error("SonarQube analysis is incomplete or timed out");
  }

  const statusUrl = new URL("/api/qualitygates/project_status", baseUrl);
  statusUrl.searchParams.set("analysisId", analysisId);
  const projectStatus = (await requestJson(statusUrl, token, fetchImpl))
    .projectStatus;
  if (projectStatus?.status !== "OK") {
    throw new Error(
      `SonarQube Quality Gate failed: ${projectStatus?.status ?? "missing"}`,
    );
  }
  return { analysisId, status: projectStatus.status };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const result = await verifySonarQubeGate({
      token: process.env.SONAR_TOKEN,
      hostUrl: process.env.SONAR_HOST_URL,
    });
    process.stdout.write(
      `SonarQube analysis ${result.analysisId}: Quality Gate OK\n`,
    );
  } catch (error) {
    process.stderr.write(`SonarQube release gate blocked: ${error.message}\n`);
    process.exitCode = 1;
  }
}
