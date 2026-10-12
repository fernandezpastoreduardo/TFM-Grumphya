import { afterEach, describe, expect, it, vi } from "vitest";
import { validateModelDecision } from "./evaluation-decision";
import { OpenAiEvaluationPort } from "./openai-evaluation.port";

const API_KEY = "test-openai-key";
const MODEL_NAME = "gpt-5.4-mini";
const IDEA_TEXT = "Una app para coordinar voluntarios en el barrio";
const TIME_SENSITIVE_PROMISE_IDEA =
  "El servicio promete mostrar resultados actuales a sus usuarios.";
const POLICY_VERSION = "grumphya-concept-v5";
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
const QUOTED_BASIS_DECISION = {
  status: "RECHAZADA",
  evaluated: [
    { id: "C01", state: "PUNTUADO", score: 79 },
    { id: "C02", state: "PUNTUADO", score: 79 },
    { id: "C03", state: "PUNTUADO", score: 79 },
    { id: "C04", state: "PUNTUADO", score: 79 },
    { id: "C05", state: "PUNTUADO", score: 79 },
    { id: "C06", state: "PUNTUADO", score: 79 },
    { id: "C07", state: "PUNTUADO", score: 10 },
  ],
  stop_at: "C07",
  reason_code: "UTILIDAD_ANULADA",
  basis: '"resultados actuales"',
  message:
    "Prometer resultados actuales sin mantenerlos fiables deja al usuario pagando por información caducada.",
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

  it("applies pessimistic threat modeling without inventing exotic risks", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createOpenAiResponse(MODEL_DECISION));
    vi.stubGlobal("fetch", fetchMock);
    const port = new OpenAiEvaluationPort({
      apiKey: API_KEY,
      model: MODEL_NAME,
    });

    await port.evaluate(createInput());

    const request = JSON.stringify(fetchMock.mock.calls[0]?.[1]);
    expect(request).toContain(
      "Rechaza también si falta un mecanismo conceptual imprescindible para que la promesa central funcione de forma fiable",
    );
    expect(request).toContain(
      "Analiza el escenario pesimista como un modelo de amenazas",
    );
    expect(request).toContain(
      "no presupongas honestidad, buena intención ni cooperación",
    );
    expect(request).toContain("encuentros presenciales entre desconocidos");
    expect(request).toContain(
      "verificación, detección, contención y reparación",
    );
    expect(request).toContain(
      "C05 dependencia central de afirmaciones de usuarios que pueden falsearse",
    );
    expect(request).toContain(
      "C06 conflicto grave entre personas sin vía de comprobación, contención o reparación",
    );
    expect(request).toContain("C09 dependencia perfecta del happy path");
    expect(request).toContain(
      "no son por sí mismos controles de fraude, seguridad o resolución de incidentes",
    );
    expect(request).toContain(
      "No conviertas riesgos exóticos o meramente imaginables en vetos",
    );
    expect(request).toContain("No preguntes al usuario cómo resolverlo");
    expect(request).toContain(
      "fragmento literal breve de la idea que sostenga el defecto",
    );
    expect(request).toContain(
      "El mensaje constata que no hay propuesta evaluable",
    );
    expect(request).toContain("No inventes incentivos");
    expect(request).toContain(
      "No uses las palabras bloqueo ni bloqueante en el mensaje visible",
    );
    expect(request).toContain(
      "Si criterios previos tienen score de 15 a 34 y refuerzan el defecto decisivo, resume como máximo dos",
    );
    expect(request).toContain("clara, mordaz y factual");
  });

  it("normalizes quote-wrapped basis only when its contents occur literally", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createOpenAiResponse(QUOTED_BASIS_DECISION));
    vi.stubGlobal("fetch", fetchMock);
    const port = new OpenAiEvaluationPort({
      apiKey: API_KEY,
      model: MODEL_NAME,
    });

    const result = await port.evaluate({
      ...createInput(),
      ideaText: TIME_SENSITIVE_PROMISE_IDEA,
    });

    expect(
      validateModelDecision(result, TIME_SENSITIVE_PROMISE_IDEA),
    ).toMatchObject({
      status: "RECHAZADA",
      stop_at: "C07",
      basis: "resultados actuales",
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
