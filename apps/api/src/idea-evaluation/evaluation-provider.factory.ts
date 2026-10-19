import {
  DEFAULT_OPENAI_MODEL,
  OpenAiEvaluationPort,
  type OpenAiReasoningEffort,
} from "./openai-evaluation.port";
import type { EvaluationPort } from "./evaluation-port";
import type { AiUsageRecorder } from "../infrastructure/ai/ai-usage";

const EVALUATION_PROVIDER_ENV = "EVALUATION_PROVIDER";
const OPENAI_API_KEY_ENV = "OPENAI_API_KEY";
const OPENAI_MODEL_ENV = "OPENAI_MODEL";
const OPENAI_REASONING_EFFORT_ENV = "OPENAI_REASONING_EFFORT";
const SUPPORTED_PROVIDER = "openai";
const SUPPORTED_REASONING_EFFORTS: OpenAiReasoningEffort[] = [
  "low",
  "medium",
  "high",
];

function isReasoningEffort(value: string): value is OpenAiReasoningEffort {
  return SUPPORTED_REASONING_EFFORTS.some((effort) => effort === value);
}

function getReasoningEffort(): OpenAiReasoningEffort {
  const configuredEffort = process.env[OPENAI_REASONING_EFFORT_ENV];
  if (!configuredEffort) return "medium";
  if (isReasoningEffort(configuredEffort)) return configuredEffort;
  throw new Error("OPENAI_REASONING_EFFORT is not supported.");
}

export function createEvaluationProvider(
  usageRecorder?: AiUsageRecorder,
): EvaluationPort | undefined {
  const selectedProvider = process.env[EVALUATION_PROVIDER_ENV];
  if (!selectedProvider) return undefined;
  if (selectedProvider !== SUPPORTED_PROVIDER) {
    throw new Error("EVALUATION_PROVIDER is not supported.");
  }

  const apiKey = process.env[OPENAI_API_KEY_ENV]?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for the selected provider.");
  }

  const configuredModel = process.env[OPENAI_MODEL_ENV]?.trim();
  return new OpenAiEvaluationPort({
    apiKey,
    model: configuredModel || DEFAULT_OPENAI_MODEL,
    reasoningEffort: getReasoningEffort(),
    usageRecorder,
  });
}
