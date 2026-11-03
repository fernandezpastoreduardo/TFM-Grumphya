import { afterEach, describe, expect, it, vi } from "vitest";
import { createEvaluationProvider } from "./evaluation-provider.factory";
import { OpenAiEvaluationPort } from "./openai-evaluation.port";

const PROVIDER_ENV = "EVALUATION_PROVIDER";
const API_KEY_ENV = "OPENAI_API_KEY";
const MODEL_ENV = "OPENAI_MODEL";
const REASONING_EFFORT_ENV = "OPENAI_REASONING_EFFORT";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("createEvaluationProvider", () => {
  it("leaves evaluation disabled unless a provider is explicitly selected", () => {
    vi.stubEnv(PROVIDER_ENV, "");
    vi.stubEnv(API_KEY_ENV, "test-key");

    expect(createEvaluationProvider()).toBeUndefined();
  });

  it("requires an API key for the explicitly selected OpenAI provider", () => {
    vi.stubEnv(PROVIDER_ENV, "openai");
    vi.stubEnv(API_KEY_ENV, " ");

    expect(() => createEvaluationProvider()).toThrow(
      "OPENAI_API_KEY is required for the selected provider.",
    );
  });

  it("rejects provider names outside the allowlist", () => {
    vi.stubEnv(PROVIDER_ENV, "unknown-provider");

    expect(() => createEvaluationProvider()).toThrow(
      "EVALUATION_PROVIDER is not supported.",
    );
  });

  it("creates the OpenAI adapter with the selected model and effort", async () => {
    vi.stubEnv(PROVIDER_ENV, "openai");
    vi.stubEnv(API_KEY_ENV, "test-key");
    vi.stubEnv(MODEL_ENV, "test-model");
    vi.stubEnv(REASONING_EFFORT_ENV, "medium");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          output: [
            {
              content: [{ type: "output_text", text: "{}" }],
            },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = createEvaluationProvider();
    expect(provider).toBeInstanceOf(OpenAiEvaluationPort);
    if (!provider) throw new Error("Expected configured OpenAI provider.");

    await provider.evaluate({
      ideaText: "Una idea de prueba suficientemente larga",
      tone: "hard",
      policyVersion: "grumphya-concept-v5",
      signal: new AbortController().signal,
    });

    const call = fetchMock.mock.calls[0];
    if (!call || typeof call[1]?.body !== "string") {
      throw new Error("Expected an OpenAI API request.");
    }
    expect(JSON.parse(call[1].body)).toMatchObject({
      model: "test-model",
      reasoning: { effort: "medium" },
    });
  });

  it("defaults OpenAI reasoning effort to low for faster evaluations", () => {
    vi.stubEnv(PROVIDER_ENV, "openai");
    vi.stubEnv(API_KEY_ENV, "test-key");
    vi.stubEnv(REASONING_EFFORT_ENV, "");

    const provider = createEvaluationProvider();

    expect(provider).toBeInstanceOf(OpenAiEvaluationPort);
    expect(provider).toMatchObject({ reasoningEffort: "low" });
  });

  it("rejects unsupported reasoning effort configuration", () => {
    vi.stubEnv(PROVIDER_ENV, "openai");
    vi.stubEnv(API_KEY_ENV, "test-key");
    vi.stubEnv(REASONING_EFFORT_ENV, "extreme");

    expect(() => createEvaluationProvider()).toThrow(
      "OPENAI_REASONING_EFFORT is not supported.",
    );
  });
});
