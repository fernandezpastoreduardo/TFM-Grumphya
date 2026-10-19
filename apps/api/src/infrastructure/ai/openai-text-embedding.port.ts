import {
  readTokenUsage,
  recordAiUsageSafely,
  type AiUsageRecorder,
} from "./ai-usage";
import {
  readAiTokenUsage,
  recordAiOperation,
  type AiTokenUsage,
} from "../observability/ai-operation.telemetry";

const OPENAI_EMBEDDINGS_ENDPOINT = "https://api.openai.com/v1/embeddings";
const OPENAI_EMBEDDING_MODEL = "text-embedding-3-small";
const OPERATION_NAME = "idea_embedding";
const EMBEDDING_DIMENSIONS = 1536;
const DEFAULT_TIMEOUT_MS = 10_000;
const OPENAI_REQUEST_ERROR = "OpenAI embedding request failed.";
const OPENAI_RESPONSE_ERROR = "OpenAI embedding response is invalid.";

export type OpenAiTextEmbeddingPortOptions = {
  apiKey: string;
  timeoutMs?: number;
  usageRecorder?: AiUsageRecorder;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseEmbeddingResponse(value: unknown): number[] {
  if (!isRecord(value) || value.model !== OPENAI_EMBEDDING_MODEL) {
    throw new Error(OPENAI_RESPONSE_ERROR);
  }
  if (!Array.isArray(value.data) || value.data.length !== 1) {
    throw new Error(OPENAI_RESPONSE_ERROR);
  }

  const item: unknown = value.data[0];
  if (!isRecord(item) || item.index !== 0 || !Array.isArray(item.embedding)) {
    throw new Error(OPENAI_RESPONSE_ERROR);
  }

  const embedding: unknown[] = item.embedding;
  if (
    embedding.length !== EMBEDDING_DIMENSIONS ||
    !embedding.every(
      (coordinate: unknown) =>
        typeof coordinate === "number" && Number.isFinite(coordinate),
    )
  ) {
    throw new Error(OPENAI_RESPONSE_ERROR);
  }
  return embedding as number[];
}

export class OpenAiTextEmbeddingPort {
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly usageRecorder?: AiUsageRecorder;

  constructor(options: OpenAiTextEmbeddingPortOptions) {
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.usageRecorder = options.usageRecorder;
  }

  async createEmbedding(ideaText: string, userId?: string): Promise<unknown> {
    const startedAt = performance.now();
    let outcome: "success" | "error" = "error";
    let usage: AiTokenUsage = {};
    try {
      const result = await this.performEmbedding(ideaText, userId);
      outcome = "success";
      usage = result.usage;
      return result.embedding;
    } finally {
      recordAiOperation(
        OPERATION_NAME,
        OPENAI_EMBEDDING_MODEL,
        startedAt,
        outcome,
        usage,
      );
    }
  }

  private async performEmbedding(
    ideaText: string,
    userId?: string,
  ): Promise<{ embedding: number[]; usage: AiTokenUsage }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      let response: Response;
      try {
        response = await fetch(OPENAI_EMBEDDINGS_ENDPOINT, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: OPENAI_EMBEDDING_MODEL,
            input: ideaText,
            dimensions: EMBEDDING_DIMENSIONS,
            encoding_format: "float",
          }),
          redirect: "error",
          signal: controller.signal,
        });
      } catch {
        throw new Error(OPENAI_REQUEST_ERROR);
      }

      if (!response.ok) throw new Error(OPENAI_REQUEST_ERROR);

      let responseBody: unknown;
      try {
        responseBody = await response.json();
      } catch {
        throw new Error(OPENAI_RESPONSE_ERROR);
      }
      const tokenUsage = readTokenUsage(responseBody);
      if (tokenUsage) {
        recordAiUsageSafely(this.usageRecorder, {
          userId,
          operation: "idea_embedding",
          model: OPENAI_EMBEDDING_MODEL,
          ...tokenUsage,
        });
      }
      return {
        embedding: parseEmbeddingResponse(responseBody),
        usage: readAiTokenUsage(responseBody, true),
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
