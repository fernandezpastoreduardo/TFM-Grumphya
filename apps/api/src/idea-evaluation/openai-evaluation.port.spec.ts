import { afterEach, describe, expect, it, vi } from "vitest";
import { validateModelDecision } from "./evaluation-decision";
import { OpenAiEvaluationPort } from "./openai-evaluation.port";

const API_KEY = "test-openai-key";
const MODEL_NAME = "gpt-5.4-mini";
const IDEA_TEXT = "Una app para coordinar voluntarios en el barrio";
const CRITICAL_OMISSION_IDEA =
  "Sería una app para que la gente informe de un hueco libre de aparcamiento de forma automática con unos sensores que llevaría encima. Los usuarios de pago verían en un mapa donde están y donde están las plazas libres más cercanas";
const POLICY_VERSION = "grumphya-concept-v4";
const OPENAI_RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses";
const MODEL_DECISION = {
  status: "IDEA_INSUFICIENTE",
  evaluated: [],
  stop_at: null,
  reason_code: null,
  basis: null,
  message:
    "Esto todavía no describe una idea evaluable; hay más misterio que producto y eso no ayuda a puntuarlo.",
};
const PARKING_IDEA =
  "Sería una app para que la gente informe de un hueco libre de aparcamiento de forma automática con unos sensores que llevaría encima. Los usuarios de pago verían en un mapa donde están y donde están las plazas libres más cercanas";
const PARKING_REJECTION = {
  status: "RECHAZADA",
  evaluated: [
    { id: "C01", state: "PUNTUADO", score: 79 },
    { id: "C02", state: "PUNTUADO", score: 79 },
    { id: "C03", state: "PUNTUADO", score: 79 },
    { id: "C04", state: "PUNTUADO", score: 28 },
    { id: "C05", state: "PUNTUADO", score: 79 },
    { id: "C06", state: "PUNTUADO", score: 79 },
    { id: "C07", state: "PUNTUADO", score: 10 },
  ],
  stop_at: "C07",
  reason_code: "UTILIDAD_ANULADA",
  basis: '"plazas libres más cercanas"',
  message:
    "Sin un método fiable para detectar y caducar plazas libres, el mapa vende humo y llega tarde.",
};

function createResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createOpenAiResponse(decision: unknown): Response {
  return createResponse({
    output: [
      {
        type: "message",
        content: [{ type: "output_text", text: JSON.stringify(decision) }],
      },
    ],
  });
}

function createInput(signal = new AbortController().signal) {
  return { ideaText: IDEA_TEXT, policyVersion: POLICY_VERSION, signal };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OpenAiEvaluationPort", () => {
  it("requests a strict structured decision without sending UI tone", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createOpenAiResponse(MODEL_DECISION));
    vi.stubGlobal("fetch", fetchMock);
    const port = new OpenAiEvaluationPort({
      apiKey: API_KEY,
      model: MODEL_NAME,
    });

    await expect(port.evaluate(createInput())).resolves.toEqual(MODEL_DECISION);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(OPENAI_RESPONSES_ENDPOINT);
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("error");
    expect(new Headers(init.headers).get("authorization")).toBe(
      `Bearer ${API_KEY}`,
    );
    expect(init.signal).toBeInstanceOf(AbortSignal);

    const requestBody: unknown = JSON.parse(String(init.body));
    expect(requestBody).toMatchObject({
      model: MODEL_NAME,
      reasoning: { effort: "medium" },
      store: false,
      text: {
        format: {
          type: "json_schema",
          name: "grumphya_evaluation_decision",
          strict: true,
        },
      },
    });
    expect(JSON.stringify(requestBody)).toContain(IDEA_TEXT);
    expect(JSON.stringify(requestBody)).toContain(POLICY_VERSION);
    expect(JSON.stringify(requestBody)).not.toContain('"tone"');
  });

  it("treats missing core mechanisms as rejection grounds without asking follow-up questions", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createOpenAiResponse(MODEL_DECISION));
    vi.stubGlobal("fetch", fetchMock);
    const port = new OpenAiEvaluationPort({
      apiKey: API_KEY,
      model: MODEL_NAME,
    });

    await port.evaluate({
      ...createInput(),
      ideaText: CRITICAL_OMISSION_IDEA,
    });

    const request = JSON.stringify(fetchMock.mock.calls[0]?.[1]);
    expect(request).toContain(CRITICAL_OMISSION_IDEA);
    expect(request).toContain(
      "Rechaza también si falta un mecanismo conceptual imprescindible para que la promesa central funcione de forma fiable",
    );
    expect(request).toContain("No preguntes al usuario cómo resolverlo");
    expect(request).toContain("cuando alguien ocupa la plaza");
    expect(request).toContain(
      "sin comillas alrededor, escapes ni caracteres añadidos",
    );
    expect(request).toContain(
      "El mensaje constata que no hay propuesta evaluable",
    );
    expect(request).toContain("No inventes incentivos");
    expect(request).toContain("clara, mordaz y factual");
  });

  it("normalizes only quote-wrapped basis text that occurs literally in the idea", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createOpenAiResponse(PARKING_REJECTION));
    vi.stubGlobal("fetch", fetchMock);
    const port = new OpenAiEvaluationPort({
      apiKey: API_KEY,
      model: MODEL_NAME,
    });

    const result = await port.evaluate({
      ...createInput(),
      ideaText: PARKING_IDEA,
    });

    expect(validateModelDecision(result, PARKING_IDEA)).toMatchObject({
      status: "RECHAZADA",
      stop_at: "C07",
      basis: "plazas libres más cercanas",
    });
  });

  it("passes the evaluation cancellation signal to the provider request", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createOpenAiResponse(MODEL_DECISION));
    vi.stubGlobal("fetch", fetchMock);
    const port = new OpenAiEvaluationPort({
      apiKey: API_KEY,
      model: MODEL_NAME,
    });
    const controller = new AbortController();

    await port.evaluate(createInput(controller.signal));

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      signal: controller.signal,
    });
  });

  it("rejects provider failures without exposing response details", async () => {
    const providerSecret = `private ${IDEA_TEXT}`;
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        createResponse({ error: { message: providerSecret } }, 401),
      );
    vi.stubGlobal("fetch", fetchMock);
    const port = new OpenAiEvaluationPort({
      apiKey: API_KEY,
      model: MODEL_NAME,
    });

    let caught: unknown;
    try {
      await port.evaluate(createInput());
    } catch (error) {
      caught = error;
    }

    if (!(caught instanceof Error)) {
      throw new Error("Expected a sanitized provider error.");
    }
    expect(caught.message).toBe("OpenAI evaluation request failed.");
    expect(caught.message).not.toContain(providerSecret);
  });

  it("rejects a successful response that contains no output text", async () => {
    const fetchMock = vi.fn().mockResolvedValue(createResponse({ output: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const port = new OpenAiEvaluationPort({
      apiKey: API_KEY,
      model: MODEL_NAME,
    });

    await expect(port.evaluate(createInput())).rejects.toThrow(
      "OpenAI evaluation response is invalid.",
    );
  });
});
