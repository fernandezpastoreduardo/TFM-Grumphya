import { realpath, readFile, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

const PROMPT_DIRECTORY = "agentic-guidelines/prompts";
const MAX_PROMPT_BYTES = 64 * 1024;
const INVALID_PROMPT_FILE =
  "Prompt files must be regular files inside agentic-guidelines/prompts and no larger than 64 KiB.";

export async function readBenchmarkPromptFile(
  repositoryRoot: string,
  configuredPath: string,
): Promise<string> {
  const allowedDirectory = await realpath(
    resolve(repositoryRoot, PROMPT_DIRECTORY),
  );
  const promptPath = await realpath(resolve(repositoryRoot, configuredPath));
  const relativePath = relative(allowedDirectory, promptPath);
  if (
    relativePath === "" ||
    relativePath === ".." ||
    relativePath.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ||
    isAbsolute(relativePath)
  ) {
    throw new Error(INVALID_PROMPT_FILE);
  }

  const fileStats = await stat(promptPath);
  if (!fileStats.isFile() || fileStats.size > MAX_PROMPT_BYTES) {
    throw new Error(INVALID_PROMPT_FILE);
  }

  const content = (await readFile(promptPath, "utf8")).trim();
  if (!content) throw new Error(INVALID_PROMPT_FILE);
  return content;
}
