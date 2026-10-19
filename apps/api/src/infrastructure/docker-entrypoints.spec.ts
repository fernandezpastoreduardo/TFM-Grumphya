import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const API_ENTRYPOINT_PATH = resolve(
  process.cwd(),
  "../../docker/api-entrypoint.sh",
);
const POSTGRES_ENTRYPOINT_PATH = resolve(
  process.cwd(),
  "../../docker/postgres-entrypoint.sh",
);
const API_SETTINGS_FILE = "grumphya_env";
const OPENAI_SETTINGS_FILE = "openai_settings";
const OPENAI_KEY_FILE = "openai_key";
const API_PROBE = `
  const output = {
    accessTokenSecret: process.env.ACCESS_TOKEN_SECRET,
    anonymousIpSecret: process.env.ANONYMOUS_IP_HMAC_SECRET,
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    provider: process.env.EVALUATION_PROVIDER,
    openAiKey: process.env.OPENAI_API_KEY,
    adminPasswordLoaded: process.env.ADMIN_PASSWORD === "admin-secret",
    host: process.env.PGHOST,
    apiHost: process.env.API_HOST,
    forwardedArguments: process.argv.slice(1),
    leakedDatabasePassword: process.env.GRUMPHYA_DB_PASSWORD,
    unapprovedSetting: process.env.UNAPPROVED_SETTING,
  };
  process.stdout.write(JSON.stringify(output));
`;

let temporaryDirectory = "";

function createTemporaryDirectory(): string {
  temporaryDirectory = mkdtempSync(resolve(tmpdir(), "grumphya-entrypoint-"));
  return temporaryDirectory;
}

function writeSecret(directory: string, filename: string, contents: string) {
  writeFileSync(resolve(directory, filename), contents, { mode: 0o600 });
}

function readJsonOutput<T>(output: string): T {
  return JSON.parse(output) as T;
}

afterEach(() => {
  if (temporaryDirectory) {
    rmSync(temporaryDirectory, { recursive: true, force: true });
    temporaryDirectory = "";
  }
});

describe("Docker service entrypoints", () => {
  it("loads only approved API settings, gives the database password precedence, and forwards the command", () => {
    const directory = createTemporaryDirectory();
    const secretsDirectory = resolve(directory, "secrets");
    mkdirSync(secretsDirectory);
    writeSecret(
      secretsDirectory,
      API_SETTINGS_FILE,
      [
        "ACCESS_TOKEN_SECRET=access-secret",
        "ANONYMOUS_IP_HMAC_SECRET=anonymous-secret",
        "PGDATABASE=grumphya_test",
        "PGUSER=app_test",
        "GRUMPHYA_DB_PASSWORD=database-secret",
        "PGPASSWORD=stale-password",
        "UNAPPROVED_SETTING=must-not-load",
        "# ignored comment",
        "invalid-line",
        "",
      ].join("\n"),
    );
    writeSecret(
      secretsDirectory,
      OPENAI_SETTINGS_FILE,
      [
        "EVALUATION_PROVIDER=openai",
        "ACCESS_TOKEN_SECRET=must-not-replace-access-secret",
        "PGUSER=must-not-replace-database-user",
        "",
      ].join("\n"),
    );
    writeSecret(
      secretsDirectory,
      OPENAI_KEY_FILE,
      "OPENAI_API_KEY=api-secret\nADMIN_PASSWORD=admin-secret\nPGUSER=must-not-replace-database-user\n",
    );

    const output = execFileSync(
      "sh",
      [API_ENTRYPOINT_PATH, "node", "-e", API_PROBE, "app-argument"],
      {
        encoding: "utf8",
        env: { ...process.env, GRUMPHYA_SECRETS_DIR: secretsDirectory },
      },
    );
    const result = readJsonOutput<{
      accessTokenSecret: string;
      anonymousIpSecret: string;
      database: string;
      user: string;
      password: string;
      provider: string;
      openAiKey: string;
      adminPasswordLoaded: boolean;
      host: string;
      apiHost: string;
      forwardedArguments: string[];
      leakedDatabasePassword: string | undefined;
      unapprovedSetting: string | undefined;
    }>(output);

    expect(result).toMatchObject({
      accessTokenSecret: "access-secret",
      anonymousIpSecret: "anonymous-secret",
      database: "grumphya_test",
      user: "app_test",
      password: "database-secret",
      provider: "openai",
      openAiKey: "api-secret",
      adminPasswordLoaded: true,
      host: "db",
      apiHost: "0.0.0.0",
      forwardedArguments: ["app-argument"],
    });
    expect(result.leakedDatabasePassword).toBeUndefined();
    expect(result.unapprovedSetting).toBeUndefined();
  });

  it("exports the database container settings from its secret file before starting PostgreSQL", () => {
    const directory = createTemporaryDirectory();
    const secretsDirectory = resolve(directory, "secrets");
    const binaryDirectory = resolve(directory, "bin");
    mkdirSync(secretsDirectory);
    mkdirSync(binaryDirectory);
    writeSecret(
      secretsDirectory,
      API_SETTINGS_FILE,
      "PGDATABASE=grumphya_test\nPGUSER=app_test\nGRUMPHYA_DB_PASSWORD=database-secret\n",
    );
    const probePath = resolve(binaryDirectory, "docker-entrypoint.sh");
    writeFileSync(
      probePath,
      [
        "#!/bin/sh",
        "printf '%s\\n' \"$POSTGRES_DB|$POSTGRES_USER|$POSTGRES_PASSWORD|$*\"",
      ].join("\n"),
      { mode: 0o700 },
    );

    const output = execFileSync("sh", [POSTGRES_ENTRYPOINT_PATH], {
      encoding: "utf8",
      env: {
        ...process.env,
        GRUMPHYA_SECRETS_DIR: secretsDirectory,
        PATH: `${binaryDirectory}:${process.env.PATH ?? ""}`,
      },
    });

    expect(output.trim()).toBe(
      "grumphya_test|app_test|database-secret|postgres",
    );
  });

  it("keeps entrypoint scripts as shell source files", () => {
    const apiSource = readFileSync(API_ENTRYPOINT_PATH, "utf8");
    const postgresSource = readFileSync(POSTGRES_ENTRYPOINT_PATH, "utf8");

    expect(apiSource.startsWith("#!/bin/sh\n")).toBe(true);
    expect(postgresSource.startsWith("#!/bin/sh\n")).toBe(true);
    expect(() => execFileSync("sh", ["-n", API_ENTRYPOINT_PATH])).not.toThrow();
    expect(() =>
      execFileSync("sh", ["-n", POSTGRES_ENTRYPOINT_PATH]),
    ).not.toThrow();
  });
});
