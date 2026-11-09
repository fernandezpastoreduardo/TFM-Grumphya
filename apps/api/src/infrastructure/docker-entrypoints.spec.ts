import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
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
const POSTGRES_RUNTIME_ROLE_INIT_PATH = resolve(
  process.cwd(),
  "../../docker/initdb/000-provision-runtime-role.sh",
);
const POSTGRES_BACKUP_PATH = resolve(
  process.cwd(),
  "../../docker/postgres-backup.sh",
);
const API_SETTINGS_FILE = "grumphya_env";
const OPENAI_SETTINGS_FILE = "openai_settings";
const OPENAI_KEY_FILE = "openai_key";
const API_PROBE = `
  const output = {
    accessTokenSecret: process.env.ACCESS_TOKEN_SECRET,
    anonymousIpSecret: process.env.ANONYMOUS_IP_HMAC_SECRET,
    qualityMetricsToken: process.env.QUALITY_METRICS_INGEST_TOKEN,
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    provider: process.env.EVALUATION_PROVIDER,
    openAiKey: process.env.OPENAI_API_KEY,
    adminPasswordLoaded: process.env.ADMIN_PASSWORD !== undefined,
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
        "QUALITY_METRICS_INGEST_TOKEN=quality-metrics-token",
      ].join("\n"),
    );
    writeSecret(
      secretsDirectory,
      "database_settings",
      [
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
      "OPENAI_API_KEY=api-secret\nPGUSER=must-not-replace-database-user\n",
    );
    writeSecret(
      secretsDirectory,
      "mail_settings",
      "MAIL_SMTP_HOST=smtp.test\nMAIL_SMTP_PORT=465\nMAIL_USERNAME=test\nMAIL_PASSWORD=secret\nMAIL_FROM_ADDRESS=mail@test\n",
    );
    writeSecret(secretsDirectory, "internal_tls_ca.crt", "test-ca");
    writeSecret(secretsDirectory, "api_tls.crt", "test-api-certificate");
    writeSecret(secretsDirectory, "api_tls.key", "test-api-private-key");

    const output = execFileSync(
      "sh",
      [API_ENTRYPOINT_PATH, "node", "-e", API_PROBE, "app-argument"],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          GRUMPHYA_SECRETS_DIR: secretsDirectory,
          REQUIRE_PRODUCTION_SECRETS: "true",
        },
      },
    );
    const result = readJsonOutput<{
      accessTokenSecret: string;
      anonymousIpSecret: string;
      qualityMetricsToken: string;
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
      qualityMetricsToken: "quality-metrics-token",
      database: "grumphya_test",
      user: "app_test",
      password: "database-secret",
      provider: "openai",
      openAiKey: "api-secret",
      adminPasswordLoaded: false,
      host: "db",
      apiHost: "0.0.0.0",
      forwardedArguments: ["app-argument"],
    });
    expect(result.leakedDatabasePassword).toBeUndefined();
    expect(result.unapprovedSetting).toBeUndefined();
  });

  it("loads outbound mail settings from the dedicated secret and leaves IMAP unused", () => {
    const directory = createTemporaryDirectory();
    const secretsDirectory = resolve(directory, "secrets");
    mkdirSync(secretsDirectory);
    writeSecret(
      secretsDirectory,
      API_SETTINGS_FILE,
      [
        "ACCESS_TOKEN_SECRET=access-secret",
        "ANONYMOUS_IP_HMAC_SECRET=anonymous-secret",
      ].join("\n"),
    );
    writeSecret(
      secretsDirectory,
      "database_settings",
      [
        "PGDATABASE=grumphya_test",
        "PGUSER=app_test",
        "GRUMPHYA_DB_PASSWORD=database-secret",
      ].join("\n"),
    );
    writeSecret(
      secretsDirectory,
      OPENAI_SETTINGS_FILE,
      "EVALUATION_PROVIDER=local\n",
    );
    writeSecret(
      secretsDirectory,
      OPENAI_KEY_FILE,
      "OPENAI_API_KEY=api-secret\n",
    );
    writeSecret(
      secretsDirectory,
      "mail_settings",
      [
        "MAIL_SMTP_HOST=smtp.example.test",
        "MAIL_SMTP_PORT=465",
        "MAIL_USERNAME=smtp-user",
        "MAIL_PASSWORD=smtp-secret",
        "MAIL_IMAP_HOST=imap.example.test",
        "MAIL_FROM_ADDRESS=mail@example.test",
      ].join("\n"),
    );

    const environment: NodeJS.ProcessEnv = {
      ...process.env,
      GRUMPHYA_SECRETS_DIR: secretsDirectory,
    };
    delete environment.MAIL_SMTP_HOST;
    delete environment.MAIL_SMTP_PORT;
    delete environment.MAIL_FROM_ADDRESS;
    delete environment.MAIL_IMAP_HOST;
    delete environment.MAIL_USERNAME;
    const output = execFileSync(
      "sh",
      [
        API_ENTRYPOINT_PATH,
        "node",
        "-e",
        "process.stdout.write(JSON.stringify({host:process.env.MAIL_SMTP_HOST,port:process.env.MAIL_SMTP_PORT,from:process.env.MAIL_FROM_ADDRESS,imap:process.env.MAIL_IMAP_HOST,username:process.env.MAIL_USERNAME}))",
      ],
      { encoding: "utf8", env: environment },
    );

    expect(readJsonOutput<Record<string, unknown>>(output)).toEqual({
      host: "smtp.example.test",
      port: "465",
      from: "mail@example.test",
      username: "smtp-user",
    });
  });

  it("installs PostgreSQL TLS outside the data volume and uses separate credentials", () => {
    const directory = createTemporaryDirectory();
    const secretsDirectory = resolve(directory, "secrets");
    const binaryDirectory = resolve(directory, "bin");
    mkdirSync(secretsDirectory);
    mkdirSync(binaryDirectory);
    writeSecret(
      secretsDirectory,
      "database_settings",
      "PGDATABASE=grumphya_test\nPGUSER=app_test\nGRUMPHYA_DB_PASSWORD=runtime-secret\n",
    );
    writeSecret(
      secretsDirectory,
      "postgres_admin_settings",
      "POSTGRES_ADMIN_PASSWORD=bootstrap-secret\n",
    );
    writeSecret(
      secretsDirectory,
      "postgres_tls.crt",
      "test-postgres-certificate",
    );
    writeSecret(
      secretsDirectory,
      "postgres_tls.key",
      "test-postgres-private-key",
    );
    const postgresDataDirectory = resolve(directory, "postgres-data");
    const postgresTlsDirectory = resolve(directory, "postgres-tls");
    mkdirSync(postgresDataDirectory);
    const probePath = resolve(binaryDirectory, "docker-entrypoint.sh");
    writeFileSync(
      probePath,
      [
        "#!/bin/sh",
        "printf '%s\\n' \"$POSTGRES_DB|$POSTGRES_USER|$POSTGRES_PASSWORD|$APP_PGUSER|$APP_PGDATABASE|$*\"",
      ].join("\n"),
      { mode: 0o700 },
    );

    const output = execFileSync("sh", [POSTGRES_ENTRYPOINT_PATH, "postgres"], {
      encoding: "utf8",
      env: {
        ...process.env,
        GRUMPHYA_SECRETS_DIR: secretsDirectory,
        GRUMPHYA_POSTGRES_TLS_DIRECTORY: postgresTlsDirectory,
        PGDATA: postgresDataDirectory,
        PATH: `${binaryDirectory}:${process.env.PATH ?? ""}`,
      },
    });

    expect(output.trim()).toBe(
      "grumphya_test|postgres|bootstrap-secret|app_test|grumphya_test|postgres",
    );
    expect(readdirSync(postgresDataDirectory)).toEqual([]);
    const installedCertificate = resolve(postgresTlsDirectory, "server.crt");
    const installedPrivateKey = resolve(postgresTlsDirectory, "server.key");
    expect(readFileSync(installedCertificate, "utf8")).toBe(
      "test-postgres-certificate",
    );
    expect(readFileSync(installedPrivateKey, "utf8")).toBe(
      "test-postgres-private-key",
    );
    expect(statSync(installedCertificate).mode & 0o777).toBe(0o644);
    expect(statSync(installedPrivateKey).mode & 0o777).toBe(0o600);
  });

  it("creates a least-privilege app role and escapes identifiers and password literals", () => {
    const directory = createTemporaryDirectory();
    const secretsDirectory = resolve(directory, "secrets");
    const binaryDirectory = resolve(directory, "bin");
    const capturePath = resolve(directory, "sql-capture");
    const callsPath = resolve(directory, "psql-calls");
    mkdirSync(secretsDirectory);
    mkdirSync(binaryDirectory);
    const appPassword = "safe' OR '1'='1";
    writeSecret(
      secretsDirectory,
      "database_settings",
      `PGDATABASE=idea"store\nPGUSER=grumphya"runtime\nGRUMPHYA_DB_PASSWORD=${appPassword}\n`,
    );
    const psqlPath = resolve(binaryDirectory, "psql");
    writeFileSync(
      psqlPath,
      [
        "#!/bin/sh",
        `printf '%s\\n' "$*" >> '${callsPath}'`,
        `cat >> '${capturePath}'`,
        "printf '\\n---CALL---\\n' >> '" + capturePath + "'",
      ].join("\n"),
      { mode: 0o700 },
    );

    const result = spawnSync("sh", [POSTGRES_RUNTIME_ROLE_INIT_PATH], {
      encoding: "utf8",
      env: {
        ...process.env,
        GRUMPHYA_SECRETS_DIR: secretsDirectory,
        PATH: `${binaryDirectory}:${process.env.PATH ?? ""}`,
        POSTGRES_USER: "postgres",
        POSTGRES_DB: "grumphya_test",
      },
    });

    expect(result.status).toBe(0);
    const sql = readFileSync(capturePath, "utf8");
    const calls = readFileSync(callsPath, "utf8");
    expect(sql).toContain(
      `CREATE ROLE "grumphya""runtime" LOGIN PASSWORD 'safe'' OR ''1''=''1'`,
    );
    expect(sql).toContain(
      "NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS",
    );
    expect(sql).toContain(
      'ALTER DATABASE "idea""store" OWNER TO "grumphya""runtime";',
    );
    expect(calls).toContain("--username postgres --dbname grumphya_test");
    expect(calls).toContain('--username postgres --dbname idea"store');
    expect(result.stdout).not.toContain(appPassword);
    expect(result.stderr).not.toContain(appPassword);
  });

  it("dumps the configured database as bootstrap without passing or logging credentials", () => {
    const directory = createTemporaryDirectory();
    const secretsDirectory = resolve(directory, "secrets");
    const binaryDirectory = resolve(directory, "bin");
    const callsPath = resolve(directory, "calls");
    const databasePassword = "database-secret-for-test";
    const adminPassword = "bootstrap-secret-for-test";
    mkdirSync(secretsDirectory);
    mkdirSync(binaryDirectory);
    writeSecret(
      secretsDirectory,
      "database_settings",
      `PGDATABASE=grumphya_test\nPGUSER=app_test\nGRUMPHYA_DB_PASSWORD=${databasePassword}\n`,
    );
    writeSecret(
      secretsDirectory,
      "postgres_admin_settings",
      `POSTGRES_ADMIN_PASSWORD=${adminPassword}\n`,
    );
    const pgDumpPath = resolve(binaryDirectory, "pg_dump");
    writeFileSync(
      pgDumpPath,
      [
        "#!/bin/sh",
        `printf '%s\\n' "$*" >> '${callsPath}'`,
        "printf 'fake postgres dump\\n'",
      ].join("\n"),
      { mode: 0o700 },
    );

    const result = spawnSync("sh", [POSTGRES_BACKUP_PATH, "dump"], {
      encoding: "utf8",
      env: {
        ...process.env,
        GRUMPHYA_SECRETS_DIR: secretsDirectory,
        PATH: `${binaryDirectory}:${process.env.PATH ?? ""}`,
        PGPASSWORD: "",
      },
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("fake postgres dump\n");
    expect(readFileSync(callsPath, "utf8")).toBe(
      "--username postgres --dbname grumphya_test\n",
    );
    expect(result.stderr).not.toContain(databasePassword);
    expect(result.stderr).not.toContain(adminPassword);
  });

  it("recreates the configured database with runtime ownership and restores stdin", () => {
    const directory = createTemporaryDirectory();
    const secretsDirectory = resolve(directory, "secrets");
    const binaryDirectory = resolve(directory, "bin");
    const callsPath = resolve(directory, "calls");
    const restorePath = resolve(directory, "restore-input");
    const databasePassword = "database-secret-for-test";
    const adminPassword = "bootstrap-secret-for-test";
    const restoreData = "BEGIN; -- restored backup payload\nCOMMIT;\n";
    mkdirSync(secretsDirectory);
    mkdirSync(binaryDirectory);
    writeSecret(
      secretsDirectory,
      "database_settings",
      `PGDATABASE=grumphya_test\nPGUSER=app_test\nGRUMPHYA_DB_PASSWORD=${databasePassword}\n`,
    );
    writeSecret(
      secretsDirectory,
      "postgres_admin_settings",
      `POSTGRES_ADMIN_PASSWORD=${adminPassword}\n`,
    );
    for (const toolName of ["dropdb", "createdb", "psql"]) {
      const toolPath = resolve(binaryDirectory, toolName);
      writeFileSync(
        toolPath,
        [
          "#!/bin/sh",
          `printf '%s %s\\n' '${toolName}' "$*" >> '${callsPath}'`,
          ...(toolName === "psql" ? [`cat > '${restorePath}'`] : []),
        ].join("\n"),
        { mode: 0o700 },
      );
    }

    const result = spawnSync("sh", [POSTGRES_BACKUP_PATH, "restore"], {
      encoding: "utf8",
      input: restoreData,
      env: {
        ...process.env,
        GRUMPHYA_SECRETS_DIR: secretsDirectory,
        PATH: `${binaryDirectory}:${process.env.PATH ?? ""}`,
        PGPASSWORD: "",
      },
    });

    expect(result.status).toBe(0);
    expect(readFileSync(callsPath, "utf8")).toBe(
      [
        "dropdb --if-exists --username postgres grumphya_test",
        "createdb --username postgres --owner app_test grumphya_test",
        "psql --set ON_ERROR_STOP=1 --username postgres --dbname grumphya_test",
        "",
      ].join("\n"),
    );
    expect(readFileSync(restorePath, "utf8")).toBe(restoreData);
    expect(result.stdout).not.toContain(databasePassword);
    expect(result.stdout).not.toContain(adminPassword);
    expect(result.stderr).not.toContain(databasePassword);
    expect(result.stderr).not.toContain(adminPassword);
  });

  it("fails with a clear message when a required production secret file is missing", () => {
    const directory = createTemporaryDirectory();
    const secretsDirectory = resolve(directory, "secrets");
    mkdirSync(secretsDirectory);
    const result = spawnSync(
      "sh",
      [API_ENTRYPOINT_PATH, "node", "-e", "process.exit(0)"],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          GRUMPHYA_SECRETS_DIR: secretsDirectory,
          REQUIRE_PRODUCTION_SECRETS: "true",
        },
      },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "Required secret 'grumphya_env' is missing",
    );
  });

  it("keeps entrypoint scripts as shell source files", () => {
    const apiSource = readFileSync(API_ENTRYPOINT_PATH, "utf8");
    const postgresSource = readFileSync(POSTGRES_ENTRYPOINT_PATH, "utf8");
    const databaseSource = readFileSync(
      resolve(process.cwd(), "../../docker/database-entrypoint.sh"),
      "utf8",
    );

    expect(apiSource.startsWith("#!/bin/sh\n")).toBe(true);
    expect(postgresSource.startsWith("#!/bin/sh\n")).toBe(true);
    expect(databaseSource.startsWith("#!/bin/sh\n")).toBe(true);
    expect(() => execFileSync("sh", ["-n", API_ENTRYPOINT_PATH])).not.toThrow();
    expect(() =>
      execFileSync("sh", ["-n", POSTGRES_ENTRYPOINT_PATH]),
    ).not.toThrow();
    expect(() =>
      execFileSync("sh", [
        "-n",
        resolve(process.cwd(), "../../docker/database-entrypoint.sh"),
      ]),
    ).not.toThrow();
  });
});
