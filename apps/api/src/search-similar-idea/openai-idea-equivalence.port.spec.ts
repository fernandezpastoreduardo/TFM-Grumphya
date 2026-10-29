import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenAiIdeaEquivalencePort } from "./openai-idea-equivalence.port";

const API_KEY = "test-openai-key";
const IDEA_TEXT = "Crear una aplicación de citas para saltamontes";
const FINGERPRINT =
  "Aplicación de citas para que los saltamontes encuentren pareja.";
const SAFE_TITLE = "Tinder para saltamontes";
const RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses";
const DEFAULT_EQUIVALENCE_TIMEOUT_MS = 30_000;
const GENERATED_HEADLINE = "La idea vuelve con el mismo equipaje.";

function createResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createJudgeResponse(
  decisions: readonly unknown[],
  headline: unknown = decisions.some(Boolean) ? GENERATED_HEADLINE : null,
): Response {
  return createResponse({
    output: [
      {
        type: "message",
        content: [
          {
            type: "output_text",
            text: JSON.stringify({
              decisions: decisions.map((sameIdea, candidateIndex) => ({
                candidateIndex,
                sameIdea,
              })),
              headline,
            }),
          },
        ],
      },
    ],
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("OpenAiIdeaEquivalencePort", () => {
  it("records cached input tokens from the provider usage response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createResponse({
        usage: {
          input_tokens: 90,
          input_tokens_details: { cached_tokens: 45 },
          output_tokens: 15,
        },
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  decisions: [{ candidateIndex: 0, sameIdea: true }],
                  headline: GENERATED_HEADLINE,
                }),
              },
            ],
          },
        ],
      }),
    );
    const record = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("fetch", fetchMock);
    const port = new OpenAiIdeaEquivalencePort({
      apiKey: API_KEY,
      usageRecorder: { record },
    });

    await port.classifyIdeas(
      IDEA_TEXT,
      FINGERPRINT,
      [SAFE_TITLE],
      "registered-user",
    );

    expect(record).toHaveBeenCalledWith({
      userId: "registered-user",
      operation: "idea_similarity",
      model: "gpt-5.4-mini",
      inputTokens: 90,
      cachedInputTokens: 45,
      outputTokens: 15,
    });
  });

  it("compares a semantic fingerprint with safe titles without storing provider state", async () => {
    const fetchMock = vi.fn().mockResolvedValue(createJudgeResponse([true]));
    vi.stubGlobal("fetch", fetchMock);
    const port = new OpenAiIdeaEquivalencePort({ apiKey: API_KEY });

    await expect(
      port.classifyIdeas(IDEA_TEXT, FINGERPRINT, [SAFE_TITLE]),
    ).resolves.toEqual({
      decisions: [true],
      headline: GENERATED_HEADLINE,
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(RESPONSES_ENDPOINT);
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("error");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(new Headers(init.headers).get("authorization")).toBe(
      `Bearer ${API_KEY}`,
    );
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).toMatchObject({ model: "gpt-5.4-mini", store: false });
    expect(JSON.stringify(body)).toContain(IDEA_TEXT);
    expect(JSON.stringify(body)).toContain(FINGERPRINT);
    expect(JSON.stringify(body)).toContain(SAFE_TITLE);
    expect(JSON.stringify(body)).toContain("headline");
    expect(JSON.stringify(body)).toContain("tone");
  });

  it("rejects malformed provider data and provider failures without exposing content or credentials", async () => {
    const privateData = `${API_KEY} ${IDEA_TEXT}`;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJudgeResponse(["yes"]))
      .mockResolvedValueOnce(
        createResponse({ error: { message: privateData } }, 401),
      );
    vi.stubGlobal("fetch", fetchMock);
    const port = new OpenAiIdeaEquivalencePort({ apiKey: API_KEY });

    await expect(
      port.classifyIdeas(IDEA_TEXT, FINGERPRINT, [SAFE_TITLE]),
    ).rejects.toThrow("OpenAI semantic comparison response is invalid.");
    await expect(
      port.classifyIdeas(IDEA_TEXT, FINGERPRINT, [SAFE_TITLE]),
    ).rejects.toThrow("OpenAI semantic comparison failed.");
  });

  it.each([
    ["soft", "¡Con mucho cariño, esta idea nos vuelve a sonar!"],
    ["hard", "La idea ha vuelto; el problema también."],
  ] as const)(
    "uses the %s tone fallback when a matched idea has an unsafe generated headline",
    async (tone, expectedHeadline) => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          createJudgeResponse([true], "Mira https://example.com"),
        );
      vi.stubGlobal("fetch", fetchMock);
      const port = new OpenAiIdeaEquivalencePort({ apiKey: API_KEY });

      await expect(
        port.classifyIdeas(
          IDEA_TEXT,
          FINGERPRINT,
          [SAFE_TITLE],
          undefined,
          tone,
        ),
      ).resolves.toEqual({ decisions: [true], headline: expectedHeadline });
    },
  );

  it("does not return a generated headline when no candidate matches", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJudgeResponse([false], GENERATED_HEADLINE));
    vi.stubGlobal("fetch", fetchMock);
    const port = new OpenAiIdeaEquivalencePort({ apiKey: API_KEY });

    await expect(
      port.classifyIdeas(IDEA_TEXT, FINGERPRINT, [SAFE_TITLE]),
    ).resolves.toEqual({ decisions: [false], headline: null });
  });

  it.each([
    { safeTitles: [] },
    { safeTitles: Array.from({ length: 21 }, (_, index) => `Título ${index}`) },
  ])(
    "rejects candidate batches outside the supported range before calling the provider",
    async ({ safeTitles }) => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const port = new OpenAiIdeaEquivalencePort({ apiKey: API_KEY });

      await expect(
        port.classifyIdeas(IDEA_TEXT, FINGERPRINT, safeTitles),
      ).rejects.toThrow("OpenAI semantic comparison response is invalid.");
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("accepts the maximum supported candidate batch", async () => {
    const safeTitles = Array.from(
      { length: 20 },
      (_, index) => `Título ${index}`,
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJudgeResponse(Array(20).fill(false)));
    vi.stubGlobal("fetch", fetchMock);
    const port = new OpenAiIdeaEquivalencePort({ apiKey: API_KEY });

    await expect(
      port.classifyIdeas(IDEA_TEXT, FINGERPRINT, safeTitles),
    ).resolves.toEqual({ decisions: Array(20).fill(false), headline: null });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("aborts provider requests after the configured timeout", async () => {
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
    const port = new OpenAiIdeaEquivalencePort({
      apiKey: API_KEY,
      timeoutMs: 25,
    });
    const result = port.classifyIdeas(IDEA_TEXT, FINGERPRINT, [SAFE_TITLE]);
    const rejection = expect(result).rejects.toThrow(
      "OpenAI semantic comparison failed.",
    );

    await vi.advanceTimersByTimeAsync(25);
    await rejection;
  });

  it("allows up to 30 seconds to compare long idea descriptions", async () => {
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
    const port = new OpenAiIdeaEquivalencePort({ apiKey: API_KEY });
    const result = port.classifyIdeas(IDEA_TEXT, FINGERPRINT, [SAFE_TITLE]);
    const rejection = expect(result).rejects.toThrow(
      "OpenAI semantic comparison failed.",
    );

    await vi.advanceTimersByTimeAsync(DEFAULT_EQUIVALENCE_TIMEOUT_MS - 1);
    expect(fetchMock).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    await rejection;
  });
});
