import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readBenchmarkPromptFile } from "./benchmark-prompt-file";

const temporaryDirectories: string[] = [];
const INVALID_PROMPT_ERROR =
  "Prompt files must be regular files inside agentic-guidelines/prompts and no larger than 64 KiB.";

async function makeRepository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "grumphya-benchmark-"));
  temporaryDirectories.push(root);
  await mkdir(join(root, "agentic-guidelines", "prompts"), {
    recursive: true,
  });
  return root;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("readBenchmarkPromptFile", () => {
  it("reads a prompt from the documented prompt directory", async () => {
    const root = await makeRepository();
    const promptsDirectory = join(root, "agentic-guidelines", "prompts");
    await writeFile(join(promptsDirectory, "candidate.txt"), "  prompt body  ");

    await expect(
      readBenchmarkPromptFile(root, "agentic-guidelines/prompts/candidate.txt"),
    ).resolves.toBe("prompt body");
  });

  it("rejects traversal to files outside the prompt directory", async () => {
    const root = await makeRepository();
    await writeFile(join(root, ".env"), "SENSITIVE_VALUE");

    await expect(readBenchmarkPromptFile(root, ".env")).rejects.toThrow(
      INVALID_PROMPT_ERROR,
    );
  });

  it("rejects a symlink that escapes the prompt directory", async () => {
    const root = await makeRepository();
    const externalFile = join(root, "private.txt");
    const promptLink = join(
      root,
      "agentic-guidelines",
      "prompts",
      "linked.txt",
    );
    await writeFile(externalFile, "private content");
    await symlink(externalFile, promptLink);

    await expect(
      readBenchmarkPromptFile(root, "agentic-guidelines/prompts/linked.txt"),
    ).rejects.toThrow(INVALID_PROMPT_ERROR);
  });

  it("rejects oversized prompts before reading them", async () => {
    const root = await makeRepository();
    const promptsDirectory = join(root, "agentic-guidelines", "prompts");
    await writeFile(join(promptsDirectory, "large.txt"), "x".repeat(65 * 1024));

    await expect(
      readBenchmarkPromptFile(root, "agentic-guidelines/prompts/large.txt"),
    ).rejects.toThrow(INVALID_PROMPT_ERROR);
  });
});
