import { OpenAiRoastReplyPort } from "../../roast/openai-roast-reply.port";
import { EvaluationProcessService } from "../../idea-evaluation/evaluation-process.service";
import { createEvaluationProvider } from "../../idea-evaluation/evaluation-provider.factory";
import { runEvaluationSmokeWithRetry } from "./production-ai-smoke-retry";

const OPENAI_API_KEY_ENV = "OPENAI_API_KEY";
const ROAST_SMOKE_MESSAGE = "Hoy he terminado mi tarea antes de la hora.";
const IDEA_SMOKE_INPUT = {
  ideaText: "Quiero crear una app sin detalles.",
  tone: "soft" as const,
};
const SMOKE_FAILURES = {
  evaluation: "Production AI smoke failed: idea evaluation.",
  roast: "Production AI smoke failed: roast reply.",
};

function requireApiKey(): string {
  const apiKey = process.env[OPENAI_API_KEY_ENV]?.trim();
  if (!apiKey) throw new Error("Production AI credentials are unavailable.");
  return apiKey;
}

async function verifyIdeaEvaluation(): Promise<boolean> {
  try {
    const provider = createEvaluationProvider();
    if (!provider) return false;
    await runEvaluationSmokeWithRetry(() =>
      new EvaluationProcessService(provider).evaluate(IDEA_SMOKE_INPUT),
    );
    return true;
  } catch {
    console.error(SMOKE_FAILURES.evaluation);
    return false;
  }
}

async function verifyRoastReply(): Promise<boolean> {
  try {
    const provider = new OpenAiRoastReplyPort({ apiKey: requireApiKey() });
    await provider.reply(ROAST_SMOKE_MESSAGE);
    return true;
  } catch {
    console.error(SMOKE_FAILURES.roast);
    return false;
  }
}

async function main(): Promise<void> {
  const evaluationOk = await verifyIdeaEvaluation();
  const roastOk = await verifyRoastReply();

  if (!evaluationOk || !roastOk) {
    process.exitCode = 1;
    return;
  }

  console.log("Production AI smoke passed: idea evaluation and roast reply.");
}

void main();
