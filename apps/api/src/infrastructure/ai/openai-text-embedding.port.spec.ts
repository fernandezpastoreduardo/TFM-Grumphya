import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenAiTextEmbeddingPort } from "./openai-text-embedding.port";

const API_KEY = "test-openai-key";
const IDEA_TEXT = "Una app para coordinar voluntarios en el barrio";
const MODEL = "text-embedding-3-small";
const DIMENSIONS = 1536;
const EMBEDDINGS_ENDPOINT = "https://api.openai.com/v1/embeddings";
const EMBEDDING = Array.from(
  { length: DIMENSIONS },
  (_, index) => index / DIMENSIONS,
);

function createResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createEmbeddingResponse(embedding: unknown, model = MODEL): Response {
  return createResponse({
    model,
    data: [{ object: "embedding", index: 0, embedding }],
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("OpenAiTextEmbeddingPort", () => {
  it("records cached input tokens from the provider usage response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createResponse({
        model: MODEL,
        data: [{ object: "embedding", index: 0, embedding: EMBEDDING }],
        usage: {
          input_tokens: 40,
          input_tokens_details: { cached_tokens: 12 },
          output_tokens: 0,
        },
      }),
    );
    const record = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("fetch", fetchMock);
    const port = new OpenAiTextEmbeddingPort({
      apiKey: API_KEY,
      usageRecorder: { record },
    });

    await port.createEmbedding(IDEA_TEXT, "registered-user");

    expect(record).toHaveBeenCalledWith({
      userId: "registered-user",
      operation: "idea_embedding",
      model: MODEL,
      inputTokens: 40,
      cachedInputTokens: 12,
      outputTokens: 0,
    });
  });

  it("posts the configured idea with the fixed model and explicit dimensions", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createEmbeddingResponse(EMBEDDING));
    vi.stubGlobal("fetch", fetchMock);
    const port = new OpenAiTextEmbeddingPort({ apiKey: API_KEY });

    await expect(port.createEmbedding(IDEA_TEXT)).resolves.toEqual(EMBEDDING);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(EMBEDDINGS_ENDPOINT);
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("error");
    expect(new Headers(init.headers).get("authorization")).toBe(
      `Bearer ${API_KEY}`,
    );
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(String(init.body))).toEqual({
      model: MODEL,
      input: IDEA_TEXT,
      dimensions: DIMENSIONS,
      encoding_format: "float",
    });
  });

  it("rejects provider failures without exposing response details, idea text, or credentials", async () => {
    const secretDetails = `${API_KEY} ${IDEA_TEXT}`;
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        createResponse({ error: { message: secretDetails } }, 401),
      );
    vi.stubGlobal("fetch", fetchMock);
    const port = new OpenAiTextEmbeddingPort({ apiKey: API_KEY });

    await expect(port.createEmbedding(IDEA_TEXT)).rejects.toThrow(
      "OpenAI embedding request failed.",
    );
    await expect(port.createEmbedding(IDEA_TEXT)).rejects.not.toThrow(
      secretDetails,
    );
  });

  it("rejects invalid JSON and unexpected response models", async () => {
    const invalidJson = new Response("not json", { status: 200 });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(invalidJson)
      .mockResolvedValueOnce(
        createEmbeddingResponse(EMBEDDING, "different-model"),
      );
    vi.stubGlobal("fetch", fetchMock);
    const port = new OpenAiTextEmbeddingPort({ apiKey: API_KEY });

    await expect(port.createEmbedding(IDEA_TEXT)).rejects.toThrow(
      "OpenAI embedding response is invalid.",
    );
    await expect(port.createEmbedding(IDEA_TEXT)).rejects.toThrow(
      "OpenAI embedding response is invalid.",
    );
  });

  it.each([
    ["missing embedding data", { model: MODEL, data: [] }],
    ["wrong vector length", { model: MODEL, data: [{ embedding: [0.1] }] }],
    [
      "non-finite values",
      {
        model: MODEL,
        data: [{ embedding: [...EMBEDDING.slice(0, -1), Number.NaN] }],
      },
    ],
    [
      "non-numeric values",
      {
        model: MODEL,
        data: [{ embedding: [...EMBEDDING.slice(0, -1), "0.1"] }],
      },
    ],
  ])("rejects %s", async (_description, responseBody) => {
    const fetchMock = vi.fn().mockResolvedValue(createResponse(responseBody));
    vi.stubGlobal("fetch", fetchMock);
    const port = new OpenAiTextEmbeddingPort({ apiKey: API_KEY });

    await expect(port.createEmbedding(IDEA_TEXT)).rejects.toThrow(
      "OpenAI embedding response is invalid.",
    );
  });

  it("aborts provider requests when the configured timeout elapses", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new Error("aborted")),
          );
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const port = new OpenAiTextEmbeddingPort({
      apiKey: API_KEY,
      timeoutMs: 25,
    });
    const result = port.createEmbedding(IDEA_TEXT);
    const rejection = expect(result).rejects.toThrow(
      "OpenAI embedding request failed.",
    );

    await vi.advanceTimersByTimeAsync(25);
    await rejection;
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      signal: expect.any(AbortSignal),
    });
  });
});
