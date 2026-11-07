import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifySonarQubeGate } from "./verify-sonarqube-gate.mjs";

const HOST_URL = "http://127.0.0.1:9000";
const PROJECT_KEY = "grumphya";
const TASK_ID = "test-task-123";
const ANALYSIS_ID = "test-analysis-456";
const TEST_TOKEN = "synthetic-test-token";
const temporaryDirectory = await mkdtemp(
  join(tmpdir(), "grumphya-sonar-gate-"),
);
const reportTaskPath = join(
  temporaryDirectory,
  ".scannerwork",
  "report-task.txt",
);

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function ceTask(status, extra = {}) {
  return jsonResponse({
    task: { id: TASK_ID, componentKey: PROJECT_KEY, status, ...extra },
  });
}

function reportTask(overrides = {}) {
  const values = {
    projectKey: PROJECT_KEY,
    serverUrl: HOST_URL,
    ceTaskId: TASK_ID,
    ceTaskUrl: `${HOST_URL}/api/ce/task?id=${TASK_ID}`,
    ...overrides,
  };
  return Object.entries(values)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

async function runGate(responses, options = {}) {
  const requests = [];
  let responseIndex = 0;
  const fetchImpl = async (url, init) => {
    requests.push({ url: String(url), init });
    const response = responses[responseIndex];
    responseIndex += 1;
    if (response instanceof Error) throw response;
    assert.ok(response, "the verifier made an unexpected extra request");
    return response;
  };
  const result = verifySonarQubeGate({
    reportTaskPath,
    token: TEST_TOKEN,
    hostUrl: HOST_URL,
    fetchImpl,
    sleep: async () => {},
    maxAttempts: 2,
    pollIntervalMs: 0,
    ...options,
  });
  return { result, requests };
}

async function rejectsGate(name, responses, options = {}) {
  const { result } = await runGate(responses, options);
  await assert.rejects(result, undefined, name);
}

try {
  await mkdir(join(temporaryDirectory, ".scannerwork"));
  await writeFile(reportTaskPath, reportTask());

  const accepted = await runGate([
    ceTask("SUCCESS", { analysisId: ANALYSIS_ID }),
    jsonResponse({ projectStatus: { status: "OK" } }),
  ]);
  await accepted.result;
  assert.equal(accepted.requests.length, 2);
  assert.equal(
    new URL(accepted.requests[0].url).searchParams.get("id"),
    TASK_ID,
  );
  assert.equal(
    new URL(accepted.requests[1].url).searchParams.get("analysisId"),
    ANALYSIS_ID,
    "the gate must inspect the completed analysis, not a stale project status",
  );
  assert.equal(
    accepted.requests[0].init.headers.Authorization,
    `Bearer ${TEST_TOKEN}`,
  );

  const eventuallyAccepted = await runGate([
    ceTask("PENDING"),
    ceTask("SUCCESS", { analysisId: ANALYSIS_ID }),
    jsonResponse({ projectStatus: { status: "OK" } }),
  ]);
  await eventuallyAccepted.result;
  assert.equal(eventuallyAccepted.requests.length, 3);

  await rejectsGate("failed CE task", [ceTask("FAILED")]);
  await rejectsGate("canceled CE task", [ceTask("CANCELED")]);
  await rejectsGate("missing analysis ID", [ceTask("SUCCESS")]);
  await rejectsGate("invalid analysis ID", [
    ceTask("SUCCESS", { analysisId: "../../other" }),
  ]);
  await rejectsGate("wrong compute task ID", [
    ceTask("SUCCESS", { id: "different-task", analysisId: ANALYSIS_ID }),
  ]);
  await rejectsGate("wrong compute task project", [
    ceTask("SUCCESS", {
      componentKey: "other-project",
      analysisId: ANALYSIS_ID,
    }),
  ]);
  await rejectsGate("quality gate error", [
    ceTask("SUCCESS", { analysisId: ANALYSIS_ID }),
    jsonResponse({ projectStatus: { status: "ERROR" } }),
  ]);
  await rejectsGate("quality gate warning", [
    ceTask("SUCCESS", { analysisId: ANALYSIS_ID }),
    jsonResponse({ projectStatus: { status: "WARN" } }),
  ]);
  await rejectsGate("missing quality gate status", [
    ceTask("SUCCESS", { analysisId: ANALYSIS_ID }),
    jsonResponse({ projectStatus: {} }),
  ]);
  await rejectsGate("CE task timeout", [
    ceTask("PENDING"),
    ceTask("IN_PROGRESS"),
  ]);
  await rejectsGate("SonarQube unavailable", [
    new Error("network unavailable"),
  ]);
  await rejectsGate("SonarQube authentication failed", [
    jsonResponse({ errors: [{ msg: "Unauthorized" }] }, 401),
  ]);
  await rejectsGate("SonarQube server failed", [
    jsonResponse({ errors: [{ msg: "Unavailable" }] }, 503),
  ]);
  await rejectsGate("invalid SonarQube JSON", [
    new Response("{", { status: 200 }),
  ]);
  await rejectsGate("quality gate endpoint unavailable", [
    ceTask("SUCCESS", { analysisId: ANALYSIS_ID }),
    new Error("network unavailable"),
  ]);
  await rejectsGate("incomplete CE response", [jsonResponse({})]);
  await rejectsGate("missing SonarQube token", [], { token: "" });
  await rejectsGate("remote SonarQube URL", [], {
    hostUrl: "https://sonar.example.invalid",
  });
  await rejectsGate("invalid polling configuration", [], { maxAttempts: 0 });

  await writeFile(reportTaskPath, reportTask({ projectKey: "other-project" }));
  await rejectsGate("unexpected project key", []);
  await writeFile(
    reportTaskPath,
    reportTask({ serverUrl: "http://127.0.0.1:9001" }),
  );
  await rejectsGate("unexpected report server", []);
  await writeFile(reportTaskPath, reportTask({ ceTaskId: "" }));
  await rejectsGate("missing CE task ID", []);
  await rm(reportTaskPath);
  await rejectsGate("missing scanner report", []);
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}

process.stdout.write("SonarQube quality-gate verifier tests passed.\n");
