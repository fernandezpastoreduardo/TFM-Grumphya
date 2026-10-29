import { render, screen, waitFor, within } from "@testing-library/react";
import { StrictMode } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearAccessToken,
  setAccessToken,
} from "../infrastructure/auth/session";
import { Home } from "./home";

const TEST_IDEA_TEXT = "Una app para coordinar voluntarios en el barrio";
const SHORT_INSULT_IDEA_TEXT = "idiota";
const IDEA_INPUT_NAME = /(escribe, pega o dicta|escribe o pega) tu idea/i;
const NEXT_STEP_BUTTON_NAME = /^adelante$/i;
const SUBMIT_BUTTON_NAME = /^evaluar idea/i;
const HOME_HERO_IMAGE_URL = "/assets/grumphya/home-grumpy-judge.webp";
const LOADING_BUTTON_NAME = /evaluando/i;
const SIMILAR_HEADLINE = "La idea vuelve con el mismo equipaje.";
const EVALUATION_RESPONSE = {
  status: "SIN_BLOQUEO_EVIDENTE",
  score: 7.15,
  headline: "Sigue en pie. No es para celebrarlo.",
  message:
    "No hay motivo para celebrar todavía: Con lo que cuentas no veo un fallo de bulto, aunque eso todavía no demuestra que alguien vaya a usarlo.",
};
const INITIAL_IDEA_QUOTA_COPY =
  "Te quedan 3 de 3 evaluaciones gratuitas en este navegador.";
const REDUCED_IDEA_QUOTA_COPY =
  "Te quedan 2 de 3 evaluaciones gratuitas en este navegador.";
const ANONYMOUS_USAGE_RESPONSE = {
  ideas: { limit: 3, used: 0, remaining: 3 },
  roasts: { limit: 3, used: 0, remaining: 3 },
};

async function continueToToneStep(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: NEXT_STEP_BUTTON_NAME }));
}

function respondToUsageInitialization(url: unknown) {
  if (url === "/api/auth/refresh") {
    return Promise.resolve({ ok: false, status: 401, json: async () => null });
  }
  if (url !== "/api/anonymous-usage") return null;
  return Promise.resolve({
    ok: true,
    json: async () => ANONYMOUS_USAGE_RESPONSE,
  });
}

describe("Home", () => {
  beforeEach(() => {
    localStorage.clear();
    clearAccessToken();
  });

  afterEach(() => vi.unstubAllGlobals());

  it("links to the public verification from the home footer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: unknown) =>
        url === "/api/accreditations/DS-GRUMPHYA-2026-001"
          ? Promise.resolve(
              Response.json({
                id: "DS-GRUMPHYA-2026-001",
                issuer: "Desarrollo Seguro",
                application: "Grumphya",
                authorizedDomains: ["grumphya.com"],
                status: "demonstration",
                issuedAt: null,
                validatedAt: null,
                validationMethod: "No indicada",
                expiresAt: null,
                assurances: [],
                scope: "Prototipo académico",
                criteria: [],
                disclaimer: "Sin certificación oficial.",
              }),
            )
          : new Promise(() => undefined),
      ),
    );
    render(<Home />);

    const seal = screen
      .getByRole("contentinfo")
      .querySelector("a[href^='/acreditaciones/']");
    const sealImage = await screen.findByAltText(
      "Sello ilustrado de Desarrollo Seguro",
    );
    expect(sealImage).toHaveAttribute(
      "src",
      "/assets/desarrollo-seguro/sello-s4.webp",
    );
    expect(sealImage).toHaveAttribute("width", "256");
    expect(seal).toHaveTextContent("Demostración académica");
    expect(seal).toHaveAccessibleName(
      /sello ilustrado de desarrollo seguro.*demostración académica.*sin certificación oficial.*ver ficha/i,
    );
  });

  it("preloads the hero illustration at high priority", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => undefined)),
    );
    render(<Home />);

    const imagePreload = document.head.querySelector(
      `link[rel="preload"][as="image"][href="${HOME_HERO_IMAGE_URL}"]`,
    );
    const heroImages = document.querySelectorAll("img.home-creature-image");

    expect(imagePreload).toHaveAttribute("fetchpriority", "high");
    expect(heroImages.length).toBeGreaterThan(0);
    heroImages.forEach((image) => {
      expect(image).toHaveAttribute("src", HOME_HERO_IMAGE_URL);
      expect(image).toHaveAttribute("fetchpriority", "high");
      expect(image).toHaveAttribute("alt", "");
    });
  });

  it("shows the admin control panel in the home navigation", async () => {
    setAccessToken("test-admin-token");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (input === "/api/account/profile") {
          return new Response(
            JSON.stringify({ user: { role: "admin" }, plans: [] }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (input === "/api/anonymous-usage") {
          return new Response(JSON.stringify(ANONYMOUS_USAGE_RESPONSE), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response("{}", { status: 503 });
      }),
    );
    render(<Home />);

    const navigation = screen.getByRole("navigation", {
      name: "Secciones principales",
    });
    expect(
      await within(navigation).findByRole("link", {
        name: "Panel de control",
      }),
    ).toHaveAttribute("href", "/panel-control");
  });

  it("shows the 429 page when the API temporarily blocks browser profile creation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: unknown) => {
        if (url === "/api/auth/refresh") {
          return Promise.resolve({
            ok: false,
            status: 401,
            json: async () => null,
          });
        }
        if (url === "/api/anonymous-usage") {
          return Promise.resolve({
            ok: false,
            status: 429,
            headers: { get: () => "120" },
            json: async () => ({ code: "ANONYMOUS_PROFILE_RATE_LIMITED" }),
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      }),
    );
    render(<Home />);

    expect(
      await screen.findByRole("heading", { level: 1, name: "429" }),
    ).toBeVisible();
    expect(screen.getByText(/dentro de 2 min/i)).toBeVisible();
  });

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
      screen.getByRole("textbox", { name: IDEA_INPUT_NAME }),
    ).toBeVisible();
    expect(
      screen.getByRole("region", { name: /resultado de la evaluación/i }),
    ).toBeEmptyDOMElement();
    expect(
      screen.queryByText(/servicios listos|conectando con los servicios/i),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Será por malas ideas.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: NEXT_STEP_BUTTON_NAME }),
    ).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: SUBMIT_BUTTON_NAME }),
    ).not.toBeInTheDocument();
  });

  it("keeps the long idea-processing notice out of the Home form", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => undefined)),
    );
    const { container } = render(<Home />);

    const ideaForm = container.querySelector(".idea-form");
    expect(ideaForm).not.toBeNull();
    if (!ideaForm) throw new Error("Idea form is missing from Home.");
    expect(ideaForm).not.toHaveTextContent(
      /el texto se procesa para evaluar la idea/i,
    );
    expect(ideaForm).not.toHaveTextContent(
      /una cookie recuerda tus tres usos gratuitos/i,
    );
  });

  it("switches between light and dark themes using an accessible control", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => undefined)),
    );
    const { container, unmount } = render(<Home />);
    const page = container.querySelector(".home-page");

    expect(page).toHaveClass("theme-light");
    await user.click(
      screen.getByRole("switch", { name: /activar modo oscuro/i }),
    );
    expect(page).toHaveClass("theme-dark");
    expect(
      screen.getByRole("switch", { name: /activar modo claro/i }),
    ).toBeVisible();
    expect(localStorage.getItem("grumphya-theme")).toBe("dark");
    unmount();
    render(<Home />);
    expect(document.querySelector(".home-page")).toHaveClass("theme-dark");
  });

  it("opens the café dialog after exhausted anonymous users submit and shows it again after closing", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((url: unknown, _init?: RequestInit) => {
      void _init;
      if (url === "/api/auth/refresh")
        return Promise.resolve({
          ok: false,
          status: 401,
          json: async () => null,
        });
      if (url === "/api/anonymous-usage")
        return Promise.resolve({
          ok: true,
          json: async () => ({
            ideas: { limit: 3, used: 3, remaining: 0 },
            roasts: { limit: 3, used: 0, remaining: 3 },
          }),
        });
      return new Promise(() => undefined);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<Home />);

    await user.type(
      screen.getByRole("textbox", { name: IDEA_INPUT_NAME }),
      TEST_IDEA_TEXT,
    );
    await continueToToneStep(user);
    const submitButton = screen.getByRole("button", {
      name: SUBMIT_BUTTON_NAME,
    });
    await user.click(submitButton);

    const quotaDialog = await screen.findByRole("dialog", {
      name: /ya conoces el método/i,
    });
    expect(quotaDialog).toHaveTextContent(/funciono a base de café/i);
    expect(quotaDialog).toHaveTextContent(/tres evaluaciones de por vida/i);
    expect(quotaDialog.textContent).not.toMatch(/por hoy/i);
    expect(
      screen.getByRole("link", { name: /a ver lo que cuesta un café/i }),
    ).toHaveAttribute("href", "/precios");
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/evaluation-process",
      expect.anything(),
    );

    await user.click(
      screen.getByRole("button", {
        name: /cerrar aviso de usos gratuitos agotados/i,
      }),
    );
    await user.click(submitButton);
    expect(
      await screen.findByRole("dialog", { name: /ya conoces el método/i }),
    ).toBeVisible();
  });

  it("waits for session status before applying an exhausted anonymous quota", async () => {
    const user = userEvent.setup();
    let resolveRefresh: ((response: Response) => void) | undefined;
    const refreshResponse = new Promise<Response>((resolve) => {
      resolveRefresh = resolve;
    });
    const fetchMock = vi.fn((url: unknown, _init?: RequestInit) => {
      void _init;
      if (url === "/api/auth/refresh") return refreshResponse;
      if (url === "/api/anonymous-usage") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            ideas: { limit: 3, used: 3, remaining: 0 },
            roasts: { limit: 3, used: 0, remaining: 3 },
          }),
        });
      }
      if (url === "/api/account/profile") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            plans: [
              {
                plan: "ILUMINADO",
                status: "active",
                attemptsRemaining: { ideas: 11, roasts: 0 },
              },
            ],
          }),
        });
      }
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
    render(
      <StrictMode>
        <Home />
      </StrictMode>,
    );

    await user.type(
      screen.getByRole("textbox", { name: IDEA_INPUT_NAME }),
      TEST_IDEA_TEXT,
    );
    await continueToToneStep(user);
    const submitButton = screen.getByRole("button", {
      name: SUBMIT_BUTTON_NAME,
    });
    expect(submitButton).toBeDisabled();
    expect(
      screen.queryByRole("dialog", { name: /ya conoces el método/i }),
    ).not.toBeInTheDocument();

    resolveRefresh?.(
      new Response(JSON.stringify({ accessToken: "session-access-token" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await waitFor(() => expect(submitButton).toBeEnabled());
    await user.click(submitButton);

    expect(await screen.findByText("7,15/10")).toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: /ya conoces el método/i }),
    ).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/evaluation-process",
      expect.anything(),
    );
  });

  it("keeps free idea attempts for a signed-in user with only Faltón", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: unknown) => {
        if (url === "/api/auth/refresh") {
          return Promise.resolve(
            new Response(
              JSON.stringify({ accessToken: "session-access-token" }),
              {
                status: 200,
                headers: { "Content-Type": "application/json" },
              },
            ),
          );
        }
        if (url === "/api/account/profile") {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              plans: [
                {
                  plan: "FALTON",
                  status: "active",
                  attemptsRemaining: { ideas: 0, roasts: 11 },
                },
              ],
            }),
          });
        }
        if (url === "/api/anonymous-usage") {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              ideas: { limit: 3, used: 1, remaining: 2 },
              roasts: { limit: 3, used: 0, remaining: 3 },
            }),
          });
        }
        return new Promise(() => undefined);
      }),
    );
    render(<Home />);

    expect(
      await screen.findByText(REDUCED_IDEA_QUOTA_COPY),
    ).toBeInTheDocument();
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
      screen.getByRole("textbox", { name: IDEA_INPUT_NAME }),
      "Una app para cuidar erizos en hoteles",
    );

    expect(heroHeading).toBeInTheDocument();
    expect(heroDescription).toBeInTheDocument();
  });

  it("refreshes the browser quota after each evaluation request", async () => {
    const user = userEvent.setup();
    let usageRequestCount = 0;
    const evaluationResponses = [
      {
        status: "similar_idea_match",
        headline: SIMILAR_HEADLINE,
        safeTitle: "Una red social para mascotas",
        submissionCount: 4,
      },
      { status: "evaluated", result: EVALUATION_RESPONSE },
    ];
    const fetchMock = vi.fn((url: unknown) => {
      if (url === "/api/auth/refresh") {
        return Promise.resolve({
          ok: false,
          status: 401,
          json: async () => null,
        });
      }
      if (url === "/api/anonymous-usage") {
        usageRequestCount += 1;
        const usage =
          usageRequestCount === 1
            ? ANONYMOUS_USAGE_RESPONSE
            : {
                ideas: { limit: 3, used: 1, remaining: 2 },
                roasts: { limit: 3, used: 0, remaining: 3 },
              };
        return Promise.resolve({ ok: true, json: async () => usage });
      }
      if (url === "/api/evaluation-process") {
        return Promise.resolve({
          ok: true,
          json: async () => evaluationResponses.shift(),
        });
      }
      return new Promise(() => undefined);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<Home />);

    expect(
      await screen.findByText(INITIAL_IDEA_QUOTA_COPY),
    ).toBeInTheDocument();
    await user.type(
      screen.getByRole("textbox", { name: IDEA_INPUT_NAME }),
      TEST_IDEA_TEXT,
    );
    await continueToToneStep(user);
    await user.click(screen.getByRole("button", { name: SUBMIT_BUTTON_NAME }));

    expect(
      await screen.findByRole("heading", { name: SIMILAR_HEADLINE }),
    ).toBeInTheDocument();
    await waitFor(() => expect(usageRequestCount).toBe(2));
    expect(screen.getByText(REDUCED_IDEA_QUOTA_COPY)).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /evaluar igualmente/i }),
    );
    expect(await screen.findByText("7,15/10")).toBeInTheDocument();
    await waitFor(() => expect(usageRequestCount).toBe(3));
    expect(
      await screen.findByText(REDUCED_IDEA_QUOTA_COPY),
    ).toBeInTheDocument();
    expect(usageRequestCount).toBe(3);
  });

  it("shows the shared daily quota dialog when the idea plan rejects an exhausted evaluation", async () => {
    const user = userEvent.setup();
    setAccessToken("test-illuminado-token");
    const fetchMock = vi.fn((url: unknown) => {
      if (url === "/api/account/profile") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              user: { role: "user" },
              plans: [
                {
                  plan: "ILUMINADO",
                  status: "active",
                  attemptsRemaining: { ideas: 1, roasts: 0 },
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }
      if (url === "/api/anonymous-usage") {
        return Promise.resolve({
          ok: true,
          json: async () => ANONYMOUS_USAGE_RESPONSE,
        });
      }
      if (url === "/api/evaluation-process") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              code: "PLAN_QUOTA_EXHAUSTED",
              scope: "ideas",
            }),
            { status: 429, headers: { "Content-Type": "application/json" } },
          ),
        );
      }
      return new Promise(() => undefined);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<Home />);

    expect(
      await screen.findByText(
        "Te quedan 1 de 11 evaluaciones disponibles hoy en Iluminado.",
      ),
    ).toBeInTheDocument();
    await user.type(
      screen.getByRole("textbox", { name: IDEA_INPUT_NAME }),
      TEST_IDEA_TEXT,
    );
    await continueToToneStep(user);
    await user.click(screen.getByRole("button", { name: SUBMIT_BUTTON_NAME }));

    const quotaDialog = await screen.findByRole("dialog", {
      name: /se acabaron los intentos/i,
    });
    expect(quotaDialog).toHaveTextContent(
      /11 evaluaciones de hoy en iluminado/i,
    );
    expect(quotaDialog).toHaveTextContent(/vuelve mañana/i);
  });

  it("shows the shared quota dialog after refreshing the final Iluminado attempt", async () => {
    const user = userEvent.setup();
    let profileRequestCount = 0;
    setAccessToken("test-illuminado-token");
    const fetchMock = vi.fn((url: unknown) => {
      if (url === "/api/account/profile") {
        profileRequestCount += 1;
        const ideasRemaining = profileRequestCount === 1 ? 1 : 0;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              user: { role: "user" },
              plans: [
                {
                  plan: "ILUMINADO",
                  status: "active",
                  attemptsRemaining: { ideas: ideasRemaining, roasts: 0 },
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }
      if (url === "/api/anonymous-usage") {
        return Promise.resolve({
          ok: true,
          json: async () => ANONYMOUS_USAGE_RESPONSE,
        });
      }
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

    expect(
      await screen.findByText(
        "Te quedan 1 de 11 evaluaciones disponibles hoy en Iluminado.",
      ),
    ).toBeInTheDocument();
    await user.type(
      screen.getByRole("textbox", { name: IDEA_INPUT_NAME }),
      TEST_IDEA_TEXT,
    );
    await continueToToneStep(user);
    await user.click(screen.getByRole("button", { name: SUBMIT_BUTTON_NAME }));

    const quotaDialog = await screen.findByRole("dialog", {
      name: /se acabaron los intentos/i,
    });
    expect(quotaDialog).toHaveTextContent(
      /11 evaluaciones de hoy en iluminado/i,
    );
    await waitFor(() => expect(profileRequestCount).toBe(2));
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

  it("renders the validated evaluation in a closable dialog without echoing the idea", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((url: unknown, _init?: RequestInit) => {
      void _init;
      const usageResponse = respondToUsageInitialization(url);
      if (usageResponse) return usageResponse;
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
      screen.getByRole("textbox", { name: IDEA_INPUT_NAME }),
      TEST_IDEA_TEXT,
    );
    await continueToToneStep(user);
    await user.click(
      screen.getByRole("radio", { name: /dame tu mejor golpe/i }),
    );
    await user.click(screen.getByRole("button", { name: SUBMIT_BUTTON_NAME }));

    expect(await screen.findByText("7,15/10")).toBeInTheDocument();
    const dialog = screen.getByRole("dialog", {
      name: /resultado de la evaluación/i,
    });
    expect(dialog).toBeVisible();
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
    expect(dialog).toContainElement(
      screen.getByText(EVALUATION_RESPONSE.message),
    );
    expect(dialog.textContent).not.toContain(TEST_IDEA_TEXT);

    await user.click(screen.getByRole("button", { name: /cerrar resultado/i }));
    expect(dialog).not.toBeVisible();
    expect(
      screen.queryByRole("radio", { name: /tengo la piel fina/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: IDEA_INPUT_NAME })).toHaveValue(
      TEST_IDEA_TEXT,
    );
    await user.click(
      screen.getByRole("button", { name: /volver a ver la evaluación/i }),
    );
    expect(
      screen.getByRole("dialog", { name: /resultado de la evaluación/i }),
    ).toBeVisible();
  });

  it("shows the special insult response without rendering an evaluation", async () => {
    const user = userEvent.setup();
    const specialCaseResponse = {
      status: "special_case",
      caseId: "insult",
      title: "Ese insulto pide una respuesta a la altura",
      message: "Si te apetece, puedes descargar la tensión aquí.",
      action: { label: "Me atrevo", href: "/descargate" },
    };
    const fetchMock = vi.fn((url: unknown) => {
      const usageResponse = respondToUsageInitialization(url);
      if (usageResponse) return usageResponse;
      if (url === "/api/evaluation-process") {
        return Promise.resolve({
          ok: true,
          json: async () => specialCaseResponse,
        });
      }
      return new Promise(() => undefined);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<Home />);

    await user.type(
      screen.getByRole("textbox", { name: IDEA_INPUT_NAME }),
      SHORT_INSULT_IDEA_TEXT,
    );
    await continueToToneStep(user);
    await user.click(screen.getByRole("button", { name: SUBMIT_BUTTON_NAME }));

    const specialCaseTitle = await screen.findByRole("heading", {
      level: 2,
      name: specialCaseResponse.title,
    });
    expect(specialCaseTitle).toBeVisible();
    expect(screen.getByText(specialCaseResponse.message)).toBeVisible();
    expect(
      screen.getByRole("img", {
        name: "Grumphya toma café con zapatillas de andar por casa con corazones",
      }),
    ).toHaveAttribute(
      "src",
      "/assets/grumphya/special-idea-coffee-slippers.png",
    );
    expect(screen.getByRole("link", { name: "Me atrevo" })).toHaveAttribute(
      "href",
      "/descargate",
    );
    expect(screen.queryByText("7,15/10")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", {
        level: 2,
        name: EVALUATION_RESPONSE.headline,
      }),
    ).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/evaluation-process",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          ideaText: SHORT_INSULT_IDEA_TEXT,
          tone: "soft",
        }),
      }),
    );
  });

  it("reuses the idempotency key when retrying an uncertain submission unchanged", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((url: unknown, _init?: RequestInit) => {
      void _init;
      const usageResponse = respondToUsageInitialization(url);
      if (usageResponse) return usageResponse;
      if (url === "/api/evaluation-process") {
        if (
          fetchMock.mock.calls.filter(
            ([callUrl]) => callUrl === "/api/evaluation-process",
          ).length === 1
        ) {
          return Promise.reject(new Error("Connection lost"));
        }
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
      screen.getByRole("textbox", { name: IDEA_INPUT_NAME }),
      TEST_IDEA_TEXT,
    );
    await continueToToneStep(user);
    await user.click(screen.getByRole("button", { name: SUBMIT_BUTTON_NAME }));
    expect(
      await screen.findByText(
        /no hemos podido confirmar si la evaluación terminó/i,
      ),
    ).toBeVisible();

    await user.click(screen.getByRole("button", { name: /cerrar resultado/i }));
    await continueToToneStep(user);
    await user.click(screen.getByRole("button", { name: SUBMIT_BUTTON_NAME }));
    expect(await screen.findByText("7,15/10")).toBeInTheDocument();

    const evaluationCalls = fetchMock.mock.calls.filter(
      ([url]) => url === "/api/evaluation-process",
    );
    expect(evaluationCalls).toHaveLength(2);
    expect(evaluationCalls[1][1]?.headers).toEqual(
      evaluationCalls[0][1]?.headers,
    );
  });

  it("does not start scoring when the idea fails form validation", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((url: unknown) => {
      const usageResponse = respondToUsageInitialization(url);
      return usageResponse ?? new Promise(() => undefined);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<Home />);

    await user.click(
      screen.getByRole("button", { name: NEXT_STEP_BUTTON_NAME }),
    );

    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/evaluation-process",
      expect.anything(),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/hay aire/i);
  });

  it("shows an uncertain outcome after a transport failure", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((url: unknown) => {
      const usageResponse = respondToUsageInitialization(url);
      if (usageResponse) return usageResponse;
      if (url === "/api/evaluation-process") {
        return Promise.reject(new Error(TEST_IDEA_TEXT));
      }
      return new Promise(() => undefined);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<Home />);
    await user.type(
      screen.getByRole("textbox", { name: IDEA_INPUT_NAME }),
      TEST_IDEA_TEXT,
    );
    await continueToToneStep(user);
    await user.click(screen.getByRole("button", { name: SUBMIT_BUTTON_NAME }));

    const errorAlert = await screen.findByRole("alert");
    expect(errorAlert).toHaveTextContent(
      /no hemos podido confirmar si la evaluación terminó/i,
    );
    expect(errorAlert).not.toHaveTextContent(/descontado/i);
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.filter(([url]) => url === "/api/anonymous-usage"),
      ).toHaveLength(2);
    });
    expect(screen.getByText(INITIAL_IDEA_QUOTA_COPY)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /cerrar resultado/i }));
    expect(
      screen.queryByRole("radio", { name: /tengo la piel fina/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: IDEA_INPUT_NAME })).toHaveValue(
      TEST_IDEA_TEXT,
    );
    expect(
      screen.getByRole("button", { name: NEXT_STEP_BUTTON_NAME }),
    ).toBeEnabled();
    expect(errorAlert.textContent).not.toContain(TEST_IDEA_TEXT);
  });

  it("explains that a confirmed server failure did not consume an attempt", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((url: unknown) => {
      const usageResponse = respondToUsageInitialization(url);
      if (usageResponse) return usageResponse;
      if (url === "/api/evaluation-process") {
        return Promise.resolve(
          new Response(JSON.stringify({ message: TEST_IDEA_TEXT }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      return new Promise(() => undefined);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<Home />);

    await user.type(
      screen.getByRole("textbox", { name: IDEA_INPUT_NAME }),
      TEST_IDEA_TEXT,
    );
    await continueToToneStep(user);
    await user.click(screen.getByRole("button", { name: SUBMIT_BUTTON_NAME }));

    const errorAlert = await screen.findByRole("alert");
    expect(errorAlert).toHaveTextContent(/la evaluación se ha torcido/i);
    expect(errorAlert).toHaveTextContent(
      /no se te ha descontado este intento/i,
    );
    const failureIllustration = screen.getByRole("img", {
      name: "Grumphya triste junto a una taza de café derramada",
    });
    expect(failureIllustration).toHaveAttribute(
      "src",
      "/assets/grumphya/evaluation-error-spilled-coffee.png",
    );
    expect(errorAlert).toContainElement(failureIllustration);
    expect(errorAlert.textContent).not.toContain(TEST_IDEA_TEXT);
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.filter(([url]) => url === "/api/anonymous-usage"),
      ).toHaveLength(2);
    });
    expect(screen.getByText(INITIAL_IDEA_QUOTA_COPY)).toBeInTheDocument();
  });

  it("explains when the evaluator exceeded its time limit", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn((url: unknown) => {
        const usageResponse = respondToUsageInitialization(url);
        if (usageResponse) return usageResponse;
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
      screen.getByRole("textbox", { name: IDEA_INPUT_NAME }),
      TEST_IDEA_TEXT,
    );
    await continueToToneStep(user);
    await user.click(screen.getByRole("button", { name: SUBMIT_BUTTON_NAME }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/no se te ha descontado este intento/i);
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
      const usageResponse = respondToUsageInitialization(url);
      if (usageResponse) return usageResponse;
      if (url === "/api/evaluation-process") return pendingEvaluation;
      return new Promise(() => undefined);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<Home />);

    await user.type(
      screen.getByRole("textbox", { name: IDEA_INPUT_NAME }),
      TEST_IDEA_TEXT,
    );
    await continueToToneStep(user);
    await user.click(screen.getByRole("button", { name: SUBMIT_BUTTON_NAME }));

    const loadingButton = screen.getByRole("button", {
      name: LOADING_BUTTON_NAME,
    });
    expect(loadingButton).toBeDisabled();
    expect(screen.getByRole("dialog")).toHaveTextContent(
      /la espera no mejora el resultado/i,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      /buscando dónde puede romperse/i,
    );
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
        headline: SIMILAR_HEADLINE,
        safeTitle: "Una red social para mascotas",
        submissionCount: 24,
      },
      { status: "evaluated", result: EVALUATION_RESPONSE },
    ];
    const fetchMock = vi.fn((url: unknown, _init?: RequestInit) => {
      void _init;
      const usageResponse = respondToUsageInitialization(url);
      if (usageResponse) return usageResponse;
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
      screen.getByRole("textbox", { name: IDEA_INPUT_NAME }),
      TEST_IDEA_TEXT,
    );
    await continueToToneStep(user);
    await user.click(
      screen.getByRole("radio", { name: /dame tu mejor golpe/i }),
    );
    await user.click(screen.getByRole("button", { name: SUBMIT_BUTTON_NAME }));

    expect(
      await screen.findByRole("heading", { name: SIMILAR_HEADLINE }),
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
