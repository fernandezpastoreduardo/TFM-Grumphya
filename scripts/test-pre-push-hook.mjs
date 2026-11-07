import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const HOOK_PATH = resolve(".husky/pre-push");
const TEMP_DIRECTORY = await mkdtemp(join(tmpdir(), "grumphya-pre-push-"));
const BIN_DIRECTORY = join(TEMP_DIRECTORY, "bin");
const COMMAND_LOG_PATH = join(TEMP_DIRECTORY, "commands.log");
const FAKE_PNPM_PATH = join(BIN_DIRECTORY, "pnpm");
const FAKE_GIT_PATH = join(BIN_DIRECTORY, "git");
const HEAD_SHA = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();

await mkdir(BIN_DIRECTORY);
await writeFile(
  FAKE_PNPM_PATH,
  [
    "#!/usr/bin/env sh",
    'printf "%s\\n" "$*" >> "$PRE_PUSH_COMMAND_LOG"',
    'if [ "$*" = "sonar:verify" ] && [ "${FAIL_SONAR:-false}" = "true" ]; then exit 19; fi',
    'if [ "$*" = "test:e2e" ] && [ "${FAIL_E2E:-false}" = "true" ]; then exit 17; fi',
    "",
  ].join("\n"),
  { mode: 0o755 },
);
await writeFile(
  FAKE_GIT_PATH,
  [
    "#!/usr/bin/env sh",
    'if [ "$1" = "rev-parse" ]; then printf "%s\\n" "$PRE_PUSH_HEAD_SHA"; exit 0; fi',
    'if [ "$1" = "status" ]; then [ "${FAKE_GIT_DIRTY:-false}" = "true" ] && printf " M tracked-file\\n"; exit 0; fi',
    "exit 2",
    "",
  ].join("\n"),
  { mode: 0o755 },
);

async function runHook(
  pushRefs,
  { failSonar = false, failE2e = false, dirty = false } = {},
) {
  await rm(COMMAND_LOG_PATH, { force: true });
  const result = spawnSync("sh", [HOOK_PATH], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${BIN_DIRECTORY}${delimiter}${process.env.PATH ?? ""}`,
      PRE_PUSH_COMMAND_LOG: COMMAND_LOG_PATH,
      PRE_PUSH_HEAD_SHA: HEAD_SHA,
      FAIL_SONAR: String(failSonar),
      FAIL_E2E: String(failE2e),
      FAKE_GIT_DIRTY: String(dirty),
    },
    input: pushRefs,
  });
  const commands = await readFile(COMMAND_LOG_PATH, "utf8").then((contents) =>
    contents.trim().split("\n").filter(Boolean),
  );
  return { ...result, commands };
}

try {
  const featurePush = await runHook(
    "refs/heads/feature/example 1111111111111111111111111111111111111111 refs/heads/feature/example 0000000000000000000000000000000000000000\n",
  );
  assert.equal(featurePush.status, 0);
  assert.deepEqual(featurePush.commands, ["migrations:check"]);

  const mainPush = await runHook(
    `refs/heads/new-features ${HEAD_SHA} refs/heads/main 0000000000000000000000000000000000000000\n`,
  );
  assert.equal(mainPush.status, 0);
  assert.deepEqual(mainPush.commands, [
    "migrations:check",
    "sonar:verify",
    "test:e2e",
  ]);

  const mainDeletion = await runHook(
    "(delete) 0000000000000000000000000000000000000000 refs/heads/main 1111111111111111111111111111111111111111\n",
  );
  assert.equal(mainDeletion.status, 0);
  assert.deepEqual(mainDeletion.commands, ["migrations:check"]);

  const mixedPush = await runHook(
    [
      "refs/heads/feature/example 1111111111111111111111111111111111111111 refs/heads/feature/example 0000000000000000000000000000000000000000",
      `refs/heads/new-features ${HEAD_SHA} refs/heads/main 0000000000000000000000000000000000000000`,
    ].join("\n") + "\n",
  );
  assert.equal(mixedPush.status, 0);
  assert.deepEqual(mixedPush.commands, [
    "migrations:check",
    "sonar:verify",
    "test:e2e",
  ]);

  const failedSonar = await runHook(
    `refs/heads/new-features ${HEAD_SHA} refs/heads/main 0000000000000000000000000000000000000000\n`,
    { failSonar: true },
  );
  assert.equal(
    failedSonar.status,
    19,
    "a failed Quality Gate must reject the push",
  );
  assert.deepEqual(failedSonar.commands, ["migrations:check", "sonar:verify"]);

  const dirtyMainPush = await runHook(
    `refs/heads/new-features ${HEAD_SHA} refs/heads/main 0000000000000000000000000000000000000000\n`,
    { dirty: true },
  );
  assert.notEqual(dirtyMainPush.status, 0);
  assert.deepEqual(dirtyMainPush.commands, ["migrations:check"]);

  const failedE2e = await runHook(
    `refs/heads/new-features ${HEAD_SHA} refs/heads/main 0000000000000000000000000000000000000000\n`,
    { failE2e: true },
  );
  assert.equal(
    failedE2e.status,
    17,
    "a failing E2E command must reject the push",
  );
  assert.deepEqual(failedE2e.commands, [
    "migrations:check",
    "sonar:verify",
    "test:e2e",
  ]);

  const differentCommit = await runHook(
    "refs/heads/new-features 1111111111111111111111111111111111111111 refs/heads/main 0000000000000000000000000000000000000000\n",
  );
  assert.notEqual(
    differentCommit.status,
    0,
    "a main push must analyze the exact commit being pushed",
  );
  assert.deepEqual(differentCommit.commands, ["migrations:check"]);

  console.log("pre-push hook policy checks passed");
} finally {
  await rm(TEMP_DIRECTORY, { recursive: true, force: true });
}
