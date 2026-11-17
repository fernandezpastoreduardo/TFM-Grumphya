import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SectionPageFrame } from "./section-page-frame";

vi.mock("../hooks/use-navigation-overflow", () => ({
  useNavigationOverflow: () => false,
}));

vi.mock("../../infrastructure/auth/use-session-status", () => ({
  useSessionStatus: () => ({
    isAuthenticated: false,
    accountAttempts: null,
    avatarUrl: null,
    isSigningOut: false,
    signOut: vi.fn(),
  }),
}));

vi.mock("./accreditation-seal", () => ({
  AccreditationSeal: () => null,
}));

describe("SectionPageFrame mobile mascot", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("loads its local mascot image lazily and asynchronously", () => {
    const { container } = render(
      <SectionPageFrame
        page={{
          title: "Peores ideas",
          intro: "Un ranking sin autores.",
          theme: "mint",
          mascot: "worst-ideas",
        }}
      >
        <p>Contenido de la sección</p>
      </SectionPageFrame>,
    );

    const image = container.querySelector(".section-mobile-mascot img");

    expect(image).toHaveAttribute(
      "src",
      "/assets/grumphya/worst-ideas-wall.webp",
    );
    expect(image).toHaveAttribute("loading", "lazy");
    expect(image).toHaveAttribute("decoding", "async");
    expect(image).toHaveAttribute("alt", "");
  });

  it.each(["judge", "profile", "register"] as const)(
    "uses the optimized crossed-arms mascot for %s sections",
    (mascot) => {
      const { container } = render(
        <SectionPageFrame
          page={{
            title: "Evaluación",
            intro: "Revisa tu idea.",
            theme: "mint",
            mascot,
          }}
        >
          <p>Contenido de la sección</p>
        </SectionPageFrame>,
      );

      expect(
        container.querySelector(".section-mobile-mascot img"),
      ).toHaveAttribute("src", "/assets/grumphya/mascot-crossed-arms.webp");
    },
  );
});

describe("SectionPageFrame desktop mascot", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("uses one contained, non-repeating mascot asset in the desktop hero", () => {
    const { container } = render(
      <SectionPageFrame
        page={{
          title: "Panel de control",
          intro: "Ingresos simulados y señales operativas.",
          theme: "mint",
          mascot: "admin",
        }}
      >
        <p>Contenido de la sección</p>
      </SectionPageFrame>,
    );
    const desktopMascots = container.querySelectorAll(
      ".section-hero .section-hero-mascot",
    );

    expect(desktopMascots).toHaveLength(1);
    expect(desktopMascots[0]).toHaveAttribute("role", "img");
    expect(desktopMascots[0]?.querySelector("img")).toBeNull();
  });
});

describe("SectionPageFrame mobile navigation", () => {
  it("marks the plan link current on the plan selection route and restores focus on Escape", async () => {
    const user = userEvent.setup();
    render(
      <SectionPageFrame
        page={{ title: "Planes", intro: "Elige un plan.", theme: "blue" }}
        currentPath="/crear-cuenta/planes"
      >
        <p>Contenido de la sección</p>
      </SectionPageFrame>,
    );

    const trigger = screen.getByRole("button", {
      name: "Abrir menú de secciones",
    });
    await user.click(trigger);
    const menu = screen.getByRole("dialog", { name: "Menú de navegación" });
    expect(within(menu).getByRole("link", { name: "Planes" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    await user.keyboard("{Escape}");
    expect(
      screen.queryByRole("dialog", { name: "Menú de navegación" }),
    ).toBeNull();
    expect(trigger).toHaveFocus();
  });
});
