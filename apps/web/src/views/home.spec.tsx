import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Home } from "./home";

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

  it("accepts a valid captured idea and shows the next-step state without echoing its text", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => undefined)),
    );
    render(<Home />);

    await user.type(
      screen.getByRole("textbox", { name: /qué aplicación tienes en mente/i }),
      "Una app para coordinar voluntarios en el barrio",
    );
    await user.click(
      screen.getByRole("button", { name: /^a ver qué tienes/i }),
    );

    expect(
      screen.getByRole("region", { name: /resultado de la evaluación/i }),
    ).toHaveTextContent(/el análisis aún no está conectado/i);
    expect(
      screen.getByRole("region", { name: /resultado de la evaluación/i }),
    ).not.toHaveTextContent(/coordinar voluntarios/i);
  });
});
