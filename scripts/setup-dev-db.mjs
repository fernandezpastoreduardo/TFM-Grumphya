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
  const ipHmacSecret = variables.get("ANONYMOUS_IP_HMAC_SECRET");
  const accessTokenSecret = variables.get("ACCESS_TOKEN_SECRET");
  if (password && !variables.has("PGPASSWORD")) {
    appendFileSync(envFile, `PGPASSWORD=${password}\n`, { mode: 0o600 });
  }
  if (!ipHmacSecret) {
    appendFileSync(
      envFile,
      `ANONYMOUS_IP_HMAC_SECRET=${randomBytes(32).toString("base64url")}\n`,
      { mode: 0o600 },
    );
  }
  if (!accessTokenSecret) {
    appendFileSync(
      envFile,
      `ACCESS_TOKEN_SECRET=${randomBytes(48).toString("base64url")}\n`,
      { mode: 0o600 },
    );
  }
  chmodSync(envFile, 0o600);
  console.log(
    "Reusing ignored .env.docker; required variables and restrictive permissions are ensured.",
  );
  process.exit(0);
}

const password = randomBytes(32).toString("base64url");
const ipHmacSecret = randomBytes(32).toString("base64url");
const accessTokenSecret = randomBytes(48).toString("base64url");
const contents = [
  `GRUMPHYA_DB_PASSWORD=${password}`,
  `PGPASSWORD=${password}`,
  `ANONYMOUS_IP_HMAC_SECRET=${ipHmacSecret}`,
  `ACCESS_TOKEN_SECRET=${accessTokenSecret}`,
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
  "Created .env.docker with random local secrets (mode 0600); it is ignored by Git.",
);
