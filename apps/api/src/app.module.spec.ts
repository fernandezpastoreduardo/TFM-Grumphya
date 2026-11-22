import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createIdeaEquivalenceProvider,
  createRoastReplyProvider,
  createSemanticIdeaFingerprintProvider,
  createTextEmbeddingProvider,
} from "./app.module";
import {
  readBackendProcessorRegistry,
  resetBackendProcessorRegistryForTests,
} from "./infrastructure/observability/backend-processors-registry";

const OPENAI_API_KEY_ENV = "OPENAI_API_KEY";
const OPENAI_API_KEY = "configured-test-key";
const REGISTRATION_IDS = [
  "openai-roast",
  "openai-embedding",
  "openai-idea-equivalence",
  "openai-idea-fingerprint",
] as const;
const repository = { recordAiUsage: vi.fn() };

afterEach(() => {
  vi.unstubAllEnvs();
  resetBackendProcessorRegistryForTests();
  repository.recordAiUsage.mockClear();
});

describe("active OpenAI adapter registration", () => {
  it("records each provider only when its factory creates the adapter", () => {
    vi.stubEnv(OPENAI_API_KEY_ENV, "");
    expect(createRoastReplyProvider(repository as never)).toBeUndefined();
    expect(createTextEmbeddingProvider(repository as never)).toBeUndefined();
    expect(createIdeaEquivalenceProvider(repository as never)).toBeUndefined();
    expect(
      createSemanticIdeaFingerprintProvider(repository as never),
    ).toBeUndefined();
    expect(
      readBackendProcessorRegistry()
        .registrations.filter(({ registrationId }) =>
          REGISTRATION_IDS.includes(
            registrationId as (typeof REGISTRATION_IDS)[number],
          ),
        )
        .map(({ processor }) => processor),
    ).toEqual([null, null, null, null]);
  });

  it("records the active adapter products without including configuration values", () => {
    vi.stubEnv(OPENAI_API_KEY_ENV, OPENAI_API_KEY);
    expect(createRoastReplyProvider(repository as never)).toBeDefined();
    expect(createTextEmbeddingProvider(repository as never)).toBeDefined();
    expect(createIdeaEquivalenceProvider(repository as never)).toBeDefined();
    expect(
      createSemanticIdeaFingerprintProvider(repository as never),
    ).toBeDefined();

    const active = readBackendProcessorRegistry()
      .registrations.filter(({ processor }) => processor !== null)
      .map(({ processor }) => processor);
    expect(active).toHaveLength(REGISTRATION_IDS.length);
    expect(active.map((processor) => processor?.providerId)).toEqual([
      "openai",
      "openai",
      "openai",
      "openai",
    ]);
    expect(JSON.stringify(active)).not.toContain(OPENAI_API_KEY);
    expect(JSON.stringify(active)).not.toContain(OPENAI_API_KEY_ENV);
  });
});
