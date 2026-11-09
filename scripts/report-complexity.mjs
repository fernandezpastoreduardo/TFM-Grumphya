import { spawnSync } from "node:child_process";
import { relative } from "node:path";

const scopes = [
  { name: "API src", package: "@grumphya/api", paths: ["src"] },
  {
    name: "API scripts",
    package: "@grumphya/api",
    paths: ["scripts"],
  },
  { name: "Web src", package: "@grumphya/web", paths: ["src"] },
];
const COMPLEXITY_PATTERN = /complexity of (\d+)\. Maximum allowed is 0\./;
const TEST_FILE_PATTERN = /\.(?:spec|test)\.[cm]?[jt]sx?$/;

function measure(scope) {
  const result = spawnSync(
    "pnpm",
    [
      "--filter",
      scope.package,
      "exec",
      "eslint",
      ...scope.paths,
      "--rule",
      'complexity: ["warn", 0]',
      "--format",
      "json",
    ],
    { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
  );
  if (result.error || result.status !== 0) {
    throw new Error(
      `No se pudo medir ${scope.name}: ${result.error?.message ?? result.stderr}`,
    );
  }
  return JSON.parse(result.stdout).flatMap((file) => {
    if (TEST_FILE_PATTERN.test(file.filePath)) return [];
    return file.messages.flatMap((message) => {
      if (message.ruleId !== "complexity") return [];
      const complexity = Number(COMPLEXITY_PATTERN.exec(message.message)?.[1]);
      if (!Number.isFinite(complexity)) {
        throw new Error(
          `Formato de complejidad desconocido: ${message.message}`,
        );
      }
      return [
        {
          path: relative(process.cwd(), file.filePath),
          line: message.line,
          complexity,
        },
      ];
    });
  });
}

try {
  const all = scopes.map((scope) => ({ ...scope, functions: measure(scope) }));
  for (const scope of all) {
    const values = scope.functions.map((item) => item.complexity);
    const above = (limit) => values.filter((value) => value > limit).length;
    console.log(
      `${scope.name}: ${values.length} funciones; >10: ${above(10)}; >15: ${above(15)}; >20: ${above(20)}; máximo: ${Math.max(0, ...values)}`,
    );
  }
  const hotspots = all
    .flatMap((scope) => scope.functions)
    .sort((first, second) => second.complexity - first.complexity)
    .slice(0, 10);
  console.log("Funciones más complejas:");
  for (const item of hotspots) {
    console.log(`  ${item.complexity} ${item.path}:${item.line}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
