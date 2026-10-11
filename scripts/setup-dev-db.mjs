import { randomBytes } from "node:crypto";
import {
  appendFileSync,
  chmodSync,
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  writeFileSync,
} from "node:fs";

const envFile = new URL("../.env.docker", import.meta.url);

if (existsSync(envFile)) {
  const current = readFileSync(envFile, "utf8");
  const variables = new Map(
    current
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
  const password = variables.get("GRUMPHYA_DB_PASSWORD");
  if (password && !variables.has("PGPASSWORD")) {
    appendFileSync(envFile, `PGPASSWORD=${password}\n`, { mode: 0o600 });
  }
  chmodSync(envFile, 0o600);
  console.log(
    "Reusing ignored .env.docker; required variables and restrictive permissions are ensured.",
  );
  process.exit(0);
}

const password = randomBytes(32).toString("base64url");
const contents = [
  `GRUMPHYA_DB_PASSWORD=${password}`,
  `PGPASSWORD=${password}`,
  "PGHOST=127.0.0.1",
  "PGPORT=5433",
  "PGDATABASE=grumphya_dev",
  "PGUSER=grumphya_dev",
  "",
].join("\n");

const fd = openSync(envFile, "wx", 0o600);
try {
  writeFileSync(fd, contents, "utf8");
} finally {
  closeSync(fd);
}

console.log(
  "Created .env.docker with a random local database password (mode 0600); it is ignored by Git.",
);
