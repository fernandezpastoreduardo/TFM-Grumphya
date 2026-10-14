import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenAiSemanticIdeaFingerprintPort } from "./openai-semantic-idea-fingerprint.port";

const API_KEY = "test-openai-key";
const IDEA_TEXT = "Una web tipo tinder pero para grillos";
const FINGERPRINT = "Servicio de citas para que los grillos encuentren pareja.";
const RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses";

function createResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createFingerprintResponse(value: unknown): Response {
  return createResponse({
    output: [
      {
        type: "message",
        content: [
          {
            type: "output_text",
            text: JSON.stringify({ semanticFingerprint: value }),
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

describe("OpenAiSemanticIdeaFingerprintPort", () => {
  it("requests a short canonical meaning and disables provider storage", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createFingerprintResponse(FINGERPRINT));
    vi.stubGlobal("fetch", fetchMock);
    const port = new OpenAiSemanticIdeaFingerprintPort({ apiKey: API_KEY });

    await expect(port.createFingerprint(IDEA_TEXT)).resolves.toBe(FINGERPRINT);

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
  });

  it.each([
    ["too short", "corta"],
    ["too long", "x".repeat(401)],
    ["control character", "Aplicación de citas\npara grillos"],
  ])("rejects a %s fingerprint", async (_case, fingerprint) => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createFingerprintResponse(fingerprint));
    vi.stubGlobal("fetch", fetchMock);
    const port = new OpenAiSemanticIdeaFingerprintPort({ apiKey: API_KEY });

    await expect(port.createFingerprint(IDEA_TEXT)).rejects.toThrow(
      "OpenAI idea normalization response is invalid.",
    );
  });

  it("does not include provider response content or the key in errors", async () => {
    const privateData = `${API_KEY} ${IDEA_TEXT}`;
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        createResponse({ error: { message: privateData } }, 401),
      );
    vi.stubGlobal("fetch", fetchMock);
    const port = new OpenAiSemanticIdeaFingerprintPort({ apiKey: API_KEY });

    await expect(port.createFingerprint(IDEA_TEXT)).rejects.toThrow(
      "OpenAI idea normalization failed.",
    );
  });
});
