import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenAiIdeaEquivalencePort } from "./openai-idea-equivalence.port";

const API_KEY = "test-openai-key";
const IDEA_TEXT = "Crear una aplicación de citas para saltamontes";
const FINGERPRINT =
  "Aplicación de citas para que los saltamontes encuentren pareja.";
const SAFE_TITLE = "Tinder para saltamontes";
const RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses";

function createResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createJudgeResponse(decisions: readonly unknown[]): Response {
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
  it("compares a semantic fingerprint with safe titles without storing provider state", async () => {
    const fetchMock = vi.fn().mockResolvedValue(createJudgeResponse([true]));
    vi.stubGlobal("fetch", fetchMock);
    const port = new OpenAiIdeaEquivalencePort({ apiKey: API_KEY });

    await expect(
      port.classifyIdeas(IDEA_TEXT, FINGERPRINT, [SAFE_TITLE]),
    ).resolves.toEqual([true]);

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
});
