import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Home } from "./home";

const TEST_IDEA_TEXT = "Una app para coordinar voluntarios en el barrio";
const DEMO_EVALUATION_RESPONSE = {
  score: 50,
  verdict: "review",
  unknownCriteriaCount: 6,
  isSimulated: true,
  rubricVersion: "v1",
};
const DEMO_ALERT_TEXT =
  "Puntuación de demostración: 50/100 — revisar. El evaluador real aún no está conectado; hay 6 criterios desconocidos.";

describe("Home", () => {
  it("starts with the idea capture area and an empty evaluation region", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => undefined)),
    );
    render(<Home />);

    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(document.querySelector(".home-creature")).toHaveAttribute(
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
      screen.getByRole("button", { name: /activar modo oscuro/i }),
    );
    expect(page).toHaveClass("theme-dark");
    expect(
      screen.getByRole("button", { name: /activar modo claro/i }),
    ).toBeVisible();
  });

  it("previews a short synthesis of the idea beside the mascot", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => undefined)),
    );
    const { container } = render(<Home />);

    expect(
      screen.getByText(/una app para hacer un tinder de saltamontes/i),
    ).toBeInTheDocument();
    await user.type(
      screen.getByRole("textbox", { name: /qué aplicación tienes en mente/i }),
      "Una app para cuidar erizos en hoteles",
    );

    expect(container.querySelector(".home-idea-synthesis")).toHaveTextContent(
      /una app para cuidar erizos en hoteles/i,
    );
    expect(container.querySelector(".home-heading")).not.toHaveTextContent(
      /porque poder hacerlo/i,
    );
    expect(screen.getByText(/porque poder hacerlo/i)).toBeInTheDocument();
  });

  it("previews unfinished sections and login without pretending they are live", async () => {
    const user = userEvent.setup();
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
    await user.click(screen.getByRole("button", { name: /peores ideas/i }));
    expect(screen.getByRole("status")).toHaveTextContent(
      /todavía no está conectada/i,
    );
    await user.click(screen.getByRole("button", { name: /entrar/i }));
    expect(screen.getByRole("status")).toHaveTextContent(
      /login todavía no está conectado/i,
    );
  });

  it("shows a demo scoring alert for a valid idea without echoing its text", async () => {
    const user = userEvent.setup();
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    const fetchMock = vi.fn((url: unknown) => {
      if (url === "/api/evaluation-process") {
        return Promise.resolve({
          ok: true,
          json: async () => DEMO_EVALUATION_RESPONSE,
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
      screen.getByRole("button", { name: /^a ver qué tienes/i }),
    );

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith(DEMO_ALERT_TEXT));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/evaluation-process",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ ideaText: TEST_IDEA_TEXT }),
      }),
    );
    expect(
      screen.getByRole("region", { name: /resultado de la evaluación/i }),
    ).toBeEmptyDOMElement();
    expect(alertSpy.mock.calls.flat().join(" ")).not.toContain(TEST_IDEA_TEXT);
  });

  it("does not start scoring when the idea fails form validation", async () => {
    const user = userEvent.setup();
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => undefined)),
    );
    render(<Home />);

    await user.click(
      screen.getByRole("button", { name: /^a ver qué tienes/i }),
    );

    expect(alertSpy).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/hay aire/i);
  });

  it("shows a safe alert when evaluation API cannot be reached", async () => {
    const user = userEvent.setup();
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
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

    await user.click(
      screen.getByRole("button", { name: /^a ver qué tienes/i }),
    );

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith(
        expect.stringMatching(/no se pudo completar el scoring/i),
      ),
    );
    expect(alertSpy.mock.calls.flat().join(" ")).not.toContain(TEST_IDEA_TEXT);
  });
});
