import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Home } from "./home";

const TEST_IDEA_TEXT = "Una app para coordinar voluntarios en el barrio";
const SUBMIT_BUTTON_NAME = /^evaluar idea/i;
const LOADING_BUTTON_NAME = /evaluando/i;
const EVALUATION_RESPONSE = {
  status: "SIN_BLOQUEO_EVIDENTE",
  score: 7.15,
  headline: "Bueno, no se ha desmontado a la primera. No te emociones.",
  message:
    "Con lo que cuentas no veo un fallo de bulto, aunque eso todavía no demuestra que alguien vaya a usarlo.",
};

describe("Home", () => {
  it("starts with the idea capture area and an empty evaluation region", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => undefined)),
    );
    render(<Home />);

    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(document.querySelector(".home-hero-stage")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(
      screen.getByRole("textbox", { name: /qué aplicación tienes en mente/i }),
    ).toBeVisible();
    expect(
      screen.getByRole("region", { name: /resultado de la evaluación/i }),
    ).toBeEmptyDOMElement();
    expect(
      screen.getByText(/conectando con los servicios/i),
    ).toBeInTheDocument();
  });

  it("switches between light and dark themes using an accessible control", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => undefined)),
    );
    const { container } = render(<Home />);
    const page = container.querySelector(".home-page");

    expect(page).toHaveClass("theme-light");
    await user.click(
      screen.getByRole("switch", { name: /activar modo oscuro/i }),
    );
    expect(page).toHaveClass("theme-dark");
    expect(
      screen.getByRole("switch", { name: /activar modo claro/i }),
    ).toBeVisible();
  });

  it("keeps the editable hero copy separate from the idea input", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => undefined)),
    );
    render(<Home />);
    const heroHeading = screen.getByRole("heading", {
      level: 1,
      name: /antes de construirla.*mira dónde puede romperse/i,
    });
    const heroDescription = screen.getByText(/grumphya revisa viabilidad/i);
    await user.type(
      screen.getByRole("textbox", { name: /qué aplicación tienes en mente/i }),
      "Una app para cuidar erizos en hoteles",
    );

    expect(heroHeading).toBeInTheDocument();
    expect(heroDescription).toBeInTheDocument();
  });

  it("links to separate section pages and account routes", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => undefined)),
    );
    render(<Home />);

    const sections = screen.getByRole("navigation", {
      name: /secciones principales/i,
    });
    expect(sections).toContainElement(
      within(sections).getByRole("link", { name: /inicio/i }),
    );
    expect(screen.getByRole("link", { name: /peores ideas/i })).toHaveAttribute(
      "href",
      "/lo-peor-de-lo-peor",
    );
    expect(screen.getByRole("link", { name: /entrar/i })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(screen.getByRole("link", { name: /crear cuenta/i })).toHaveAttribute(
      "href",
      "/precios",
    );
  });

  it("renders the validated evaluation inline without echoing the submitted idea", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((url: unknown, _init?: RequestInit) => {
      void _init;
      if (url === "/api/evaluation-process") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            status: "evaluated",
            result: EVALUATION_RESPONSE,
          }),
        });
      }
      return new Promise(() => undefined);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<Home />);

    await user.type(
      screen.getByRole("textbox", { name: /qué aplicación tienes en mente/i }),
      TEST_IDEA_TEXT,
    );
    await user.click(
      screen.getByRole("radio", { name: /dame tu mejor golpe/i }),
    );
    await user.click(screen.getByRole("button", { name: SUBMIT_BUTTON_NAME }));

    expect(await screen.findByText("7,15/10")).toBeInTheDocument();
    expect(screen.getByText(/sigue en pie, por ahora/i)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: EVALUATION_RESPONSE.headline,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(EVALUATION_RESPONSE.message)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/evaluation-process",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ ideaText: TEST_IDEA_TEXT, tone: "hard" }),
      }),
    );
    expect(
      fetchMock.mock.calls.find(
        ([url]) => url === "/api/evaluation-process",
      )?.[1],
    ).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({
          "Idempotency-Key": expect.any(String),
        }),
      }),
    );
    expect(
      screen.getByRole("region", { name: /resultado de la evaluación/i }),
    ).toContainElement(screen.getByText(EVALUATION_RESPONSE.message));
    expect(
      screen.getByRole("region", { name: /resultado de la evaluación/i })
        .textContent,
    ).not.toContain(TEST_IDEA_TEXT);
  });

  it("does not start scoring when the idea fails form validation", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(() => new Promise(() => undefined));
    vi.stubGlobal("fetch", fetchMock);
    render(<Home />);

    await user.click(screen.getByRole("button", { name: SUBMIT_BUTTON_NAME }));

    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/evaluation-process",
      expect.anything(),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/hay aire/i);
  });

  it("shows a safe inline error and keeps the idea available for retry", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn((url: unknown) => {
        if (url === "/api/evaluation-process") {
          return Promise.reject(new Error(TEST_IDEA_TEXT));
        }
        return new Promise(() => undefined);
      }),
    );
    render(<Home />);
    await user.type(
      screen.getByRole("textbox", { name: /qué aplicación tienes en mente/i }),
      TEST_IDEA_TEXT,
    );

    await user.click(screen.getByRole("button", { name: SUBMIT_BUTTON_NAME }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /no se pudo completar el scoring/i,
    );
    expect(
      screen.getByRole("textbox", { name: /qué aplicación tienes en mente/i }),
    ).toHaveValue(TEST_IDEA_TEXT);
    expect(
      screen.getByRole("button", { name: SUBMIT_BUTTON_NAME }),
    ).toBeEnabled();
    expect(screen.getByRole("alert").textContent).not.toContain(TEST_IDEA_TEXT);
  });

  it("explains when the evaluator exceeded its time limit", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn((url: unknown) => {
        if (url === "/api/evaluation-process") {
          return Promise.resolve({
            ok: false,
            status: 504,
            json: async () => ({
              code: "EVALUATION_TIMEOUT",
              message: TEST_IDEA_TEXT,
            }),
          });
        }
        return new Promise(() => undefined);
      }),
    );
    render(<Home />);
    await user.type(
      screen.getByRole("textbox", { name: /qué aplicación tienes en mente/i }),
      TEST_IDEA_TEXT,
    );
    await user.click(screen.getByRole("button", { name: SUBMIT_BUTTON_NAME }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/está tardando más de lo previsto/i);
    expect(alert.textContent).not.toContain(TEST_IDEA_TEXT);
  });

  it("shows loading state and ignores another submit while a request is pending", async () => {
    const user = userEvent.setup();
    let resolveEvaluation!: (response: {
      ok: boolean;
      json: () => Promise<{
        status: string;
        result: typeof EVALUATION_RESPONSE;
      }>;
    }) => void;
    const pendingEvaluation = new Promise<{
      ok: boolean;
      json: () => Promise<{
        status: string;
        result: typeof EVALUATION_RESPONSE;
      }>;
    }>((resolve) => {
      resolveEvaluation = resolve;
    });
    const fetchMock = vi.fn((url: unknown, _init?: RequestInit) => {
      void _init;
      if (url === "/api/evaluation-process") return pendingEvaluation;
      return new Promise(() => undefined);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<Home />);

    await user.type(
      screen.getByRole("textbox", { name: /qué aplicación tienes en mente/i }),
      TEST_IDEA_TEXT,
    );
    await user.click(screen.getByRole("button", { name: SUBMIT_BUTTON_NAME }));

    const loadingButton = screen.getByRole("button", {
      name: LOADING_BUTTON_NAME,
    });
    expect(loadingButton).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(/evaluando/i);
    await user.click(loadingButton);
    expect(
      fetchMock.mock.calls.filter(([url]) => url === "/api/evaluation-process"),
    ).toHaveLength(1);

    resolveEvaluation({
      ok: true,
      json: async () => ({ status: "evaluated", result: EVALUATION_RESPONSE }),
    });
    expect(await screen.findByText("7,15/10")).toBeInTheDocument();
  });

  it("shows the safe title and count, then evaluates with the same idempotency key only after confirmation", async () => {
    const user = userEvent.setup();
    const responses = [
      {
        status: "similar_idea_match",
        safeTitle: "Una red social para mascotas",
        submissionCount: 24,
      },
      { status: "evaluated", result: EVALUATION_RESPONSE },
    ];
    const fetchMock = vi.fn((url: unknown, _init?: RequestInit) => {
      void _init;
      if (url === "/api/evaluation-process") {
        return Promise.resolve({
          ok: true,
          json: async () => responses.shift(),
        });
      }
      return new Promise(() => undefined);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<Home />);
    await user.type(
      screen.getByRole("textbox", { name: /qué aplicación tienes en mente/i }),
      TEST_IDEA_TEXT,
    );
    await user.click(
      screen.getByRole("radio", { name: /dame tu mejor golpe/i }),
    );
    await user.click(screen.getByRole("button", { name: SUBMIT_BUTTON_NAME }));

    expect(
      await screen.findByRole("heading", { name: /esta idea ya nos suena/i }),
    ).toBeVisible();
    expect(
      screen.getByText(/una red social para mascotas/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/24 veces/i)).toBeInTheDocument();
    expect(
      screen.getByText(/esta idea ya se llevó un golpe y ha vuelto/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/enviaremos esta idea a una nueva evaluación/i),
    ).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.filter(([url]) => url === "/api/evaluation-process"),
    ).toHaveLength(1);

    await user.click(
      screen.getByRole("button", { name: /evaluar igualmente/i }),
    );
    expect(await screen.findByText("7,15/10")).toBeInTheDocument();
    const evaluationCalls = fetchMock.mock.calls.filter(
      ([url]) => url === "/api/evaluation-process",
    );
    expect(evaluationCalls).toHaveLength(2);
    expect(evaluationCalls[1][1]?.headers).toEqual(
      evaluationCalls[0][1]?.headers,
    );
    expect(evaluationCalls[1][1]?.body).toContain('"continueAnyway":true');
  });
});
