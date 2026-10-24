import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateModelDecision } from "../src/idea-evaluation/evaluation-decision";
import { readBenchmarkPromptFile } from "../src/idea-evaluation/benchmark-prompt-file";
import {
  EVALUATION_INSTRUCTIONS,
  OpenAiEvaluationPort,
} from "../src/idea-evaluation/openai-evaluation.port";

const API_KEY_ENV = "OPENAI_API_KEY";
const DEFAULT_MODEL = "gpt-5.4-mini";
const POLICY_VERSION = "grumphya-concept-v9";
const CASES_PATH = resolve(__dirname, "../evaluation/evaluator-cases.json");
const USAGE_MESSAGE =
  "Uso: pnpm --filter @grumphya/api benchmark:evaluator [--models modelo-a,modelo-b] [--prompts nombre=archivo,nombre=archivo]";

type BenchmarkCase = {
  id: string;
  ideaText: string;
  expectedStatuses: string[];
  expectedReasonCodes?: string[];
};

type PromptVariant = { name: string; instructions: string };
type CliOptions = { models: string[]; promptFiles: string[] };

function readOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}

function parseOptions(args: string[]): CliOptions {
  const modelValue = readOption(args, "--models");
  const promptValue = readOption(args, "--prompts");
  if (
    (args.includes("--models") && !modelValue) ||
    (args.includes("--prompts") && !promptValue)
  ) {
    throw new Error(USAGE_MESSAGE);
  }
  return {
    models: (modelValue ?? DEFAULT_MODEL)
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    promptFiles: (promptValue ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  };
}

function validateCases(value: unknown): BenchmarkCase[] {
  if (!Array.isArray(value))
    throw new Error("El corpus del benchmark no es válido.");
  return value.map((entry) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new Error("El corpus del benchmark no es válido.");
    }
    const item = entry as Record<string, unknown>;
    if (
      typeof item.id !== "string" ||
      typeof item.ideaText !== "string" ||
      !Array.isArray(item.expectedStatuses) ||
      !item.expectedStatuses.every((status) => typeof status === "string") ||
      (item.expectedReasonCodes !== undefined &&
        (!Array.isArray(item.expectedReasonCodes) ||
          !item.expectedReasonCodes.every((code) => typeof code === "string")))
    ) {
      throw new Error("El corpus del benchmark no es válido.");
    }
    return item as unknown as BenchmarkCase;
  });
}

async function loadPrompts(files: string[]): Promise<PromptVariant[]> {
  const custom = await Promise.all(
    files.map(async (entry) => {
      const separator = entry.indexOf("=");
      if (separator < 1 || separator === entry.length - 1) {
        throw new Error(USAGE_MESSAGE);
      }
      const name = entry.slice(0, separator).trim();
      const instructions = await readBenchmarkPromptFile(
        resolve(__dirname, "../../../"),
        entry.slice(separator + 1).trim(),
      );
      if (!name) throw new Error("La variante de prompt no es válida.");
      return { name, instructions };
    }),
  );
  return [
    { name: "current", instructions: EVALUATION_INSTRUCTIONS },
    ...custom,
  ];
}

async function readCases(): Promise<BenchmarkCase[]> {
  return validateCases(
    JSON.parse(await readFile(CASES_PATH, "utf8")) as unknown,
  );
}

async function main(): Promise<void> {
  if (process.argv.includes("--help")) {
    process.stdout.write(`${USAGE_MESSAGE}\n`);
    return;
  }
  const apiKey = process.env[API_KEY_ENV]?.trim();
  if (!apiKey) throw new Error("Configura OPENAI_API_KEY en el entorno local.");
  const options = parseOptions(process.argv.slice(2));
  const [cases, prompts] = await Promise.all([
    readCases(),
    loadPrompts(options.promptFiles),
  ]);
  const outcomes: Array<{
    caseId: string;
    variant: string;
    model: string;
    status: string;
    reasonCode: string | null;
    passed: boolean;
  }> = [];

  for (const model of options.models) {
    for (const prompt of prompts) {
      const evaluator = new OpenAiEvaluationPort({
        apiKey,
        model,
        instructions: prompt.instructions,
      });
      for (const testCase of cases) {
        const raw = await evaluator.evaluate({
          ideaText: testCase.ideaText,
          tone: "soft",
          policyVersion: POLICY_VERSION,
          signal: new AbortController().signal,
        });
        const decision = validateModelDecision(raw, testCase.ideaText);
        const statusMatches = testCase.expectedStatuses.includes(
          decision.status,
        );
        const reasonMatches =
          testCase.expectedReasonCodes === undefined ||
          (decision.reason_code !== null &&
            testCase.expectedReasonCodes.includes(decision.reason_code));
        outcomes.push({
          caseId: testCase.id,
          variant: prompt.name,
          model,
          status: decision.status,
          reasonCode: decision.reason_code,
          passed: statusMatches && reasonMatches,
        });
      }
    }
  }

  const variants = Array.from(
    new Set(outcomes.map((outcome) => `${outcome.variant}/${outcome.model}`)),
  ).map((name) => {
    const items = outcomes.filter(
      (outcome) => `${outcome.variant}/${outcome.model}` === name,
    );
    return {
      variant: name,
      cases: items.length,
      expectedAgreement: items.filter((item) => item.passed).length,
      expectedAgreementRate: items.length
        ? Number(
            (items.filter((item) => item.passed).length / items.length).toFixed(
              4,
            ),
          )
        : 0,
    };
  });
  const consistency = cases.map((testCase) => {
    const decisions = outcomes.filter((item) => item.caseId === testCase.id);
    return {
      case: testCase.id,
      variants: decisions.length,
      statusAgreement: new Set(decisions.map((item) => item.status)).size === 1,
      reasonAgreement:
        new Set(decisions.map((item) => item.reasonCode)).size === 1,
    };
  });
  const report = {
    policyVersion: POLICY_VERSION,
    generatedAt: new Date().toISOString(),
    caseCount: cases.length,
    variants,
    consistency: {
      casesWithStatusAgreement: consistency.filter(
        (item) => item.statusAgreement,
      ).length,
      casesWithReasonAgreement: consistency.filter(
        (item) => item.reasonAgreement,
      ).length,
      caseCount: consistency.length,
    },
    privacy:
      "Only aggregate results are emitted; idea text and model explanations are omitted.",
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (variants.some((variant) => variant.expectedAgreementRate < 1))
    process.exitCode = 1;
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Benchmark failed.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
