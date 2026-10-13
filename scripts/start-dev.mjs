import { spawn } from "node:child_process";

const API_URL = "http://127.0.0.1:3000/api/health";
const WEB_URL = "http://127.0.0.1:5173/api/health";
const RETRY_DELAY_MS = 500;
const STARTUP_TIMEOUT_MS = 30_000;

const processes = [
  spawn("pnpm", ["--filter", "@grumphya/api", "start:dev"], {
    stdio: "inherit",
    env: process.env,
  }),
  spawn("pnpm", ["--filter", "@grumphya/web", "dev"], {
    stdio: "inherit",
    env: process.env,
  }),
];

let stopping = false;

function stopProcesses() {
  if (stopping) return;
  stopping = true;
  for (const child of processes) child.kill("SIGTERM");
}

async function waitForHealth(url) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
    } catch {
      // The service is still starting; retry until the bounded deadline.
    }
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
  }
  throw new Error(`Tiempo agotado esperando ${url}`);
}

async function verifyInfrastructure() {
  const directHealth = await waitForHealth(API_URL);
  if (directHealth.status !== "ok" || directHealth.database !== "ok") {
    throw new Error("La API no confirma PostgreSQL disponible");
  }
  console.log("[infra] PostgreSQL levantado OK");

  if (!/^\d+\.\d+\.\d+$/.test(directHealth.pgvector)) {
    throw new Error("La API no confirma una versión válida de pgvector");
  }
  console.log(`[infra] pgvector ${directHealth.pgvector} habilitado OK`);
  console.log("[infra] NestJS levantado OK");

  const proxiedHealth = await waitForHealth(WEB_URL);
  if (proxiedHealth.status !== "ok" || proxiedHealth.database !== "ok") {
    throw new Error("El proxy de Vite no devuelve el estado de la API");
  }
  console.log("[infra] Comunicación React/Vite → NestJS OK");
  console.log(
    "[infra] Health check completo: frontend, API y base de datos OK",
  );
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stopProcesses();
    process.exit(0);
  });
}

for (const child of processes) {
  child.on("exit", (code) => {
    if (!stopping && code !== 0) process.exitCode = code ?? 1;
  });
}

try {
  await verifyInfrastructure();
} catch (error) {
  console.error(
    `[infra] ARRANQUE FALLIDO: ${error instanceof Error ? error.message : "error desconocido"}`,
  );
  stopProcesses();
  process.exitCode = 1;
}
