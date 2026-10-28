import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccreditationVerification } from "./accreditation-verification";
import { ACCREDITATION_ID } from "../../shared/accreditation-verification";

const record = {
  id: ACCREDITATION_ID,
  issuer: "Desarrollo Seguro",
  application: "Grumphya",
  authorizedDomains: ["grumphya.com"],
  status: "demonstration",
  issuedAt: null,
  expiresAt: null,
  scope: "Prototipo académico de buenas prácticas",
  criteria: ["Revisión de controles documentados"],
  disclaimer:
    "Demostración académica; sin certificación oficial ni auditoría independiente.",
};

afterEach(() => vi.unstubAllGlobals());

describe("AccreditationVerification", () => {
  it("loads the server record and displays domains and academic limits", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(record));
    vi.stubGlobal("fetch", fetchMock);

    render(<AccreditationVerification />);

    const article = await screen.findByRole("article", {
      name: "Ficha de verificación de Desarrollo Seguro",
    });
    expect(within(article).getByText("Grumphya")).toBeVisible();
    expect(
      within(article).getByRole("img", {
        name: "Logotipo de Desarrollo Seguro",
      }),
    ).toHaveAttribute("src", "/assets/desarrollo-seguro/logo-l4.webp");
    expect(within(article).getByText("grumphya.com")).toBeVisible();
    expect(within(article).getByText("Prototipo académico")).toBeVisible();
    expect(
      within(article).getByText(/sin certificación oficial/i),
    ).toBeVisible();
    expect(within(article).getByText(/compara este dominio/i)).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/accreditations/${ACCREDITATION_ID}`,
      { credentials: "omit", cache: "no-store" },
    );
  });

  it.each([
    ["suspended", "Suspendida"],
    ["revoked", "Revocada"],
    ["expired", "Caducada"],
    ["unknown", "Estado desconocido"],
  ])(
    "displays a %s record without claiming validity",
    async (status, label) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(Response.json({ ...record, status })),
      );

      render(<AccreditationVerification />);

      expect(await screen.findByText(label)).toBeVisible();
      expect(screen.queryByText("Vigente")).not.toBeInTheDocument();
    },
  );

  it.each([
    ["unknown id", { ...record, id: "DS-OTHER" }],
    [
      "invalid domain",
      { ...record, authorizedDomains: ["https://evil.example/"] },
    ],
    ["unknown status", { ...record, status: "valid" }],
  ])("fails closed for %s", async (_case, body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body)));

    render(<AccreditationVerification />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /no se puede verificar/i,
    );
    expect(screen.queryByText("Prototipo académico")).not.toBeInTheDocument();
  });

  it("shows unavailable state when the server returns 404", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 404 })),
    );

    render(<AccreditationVerification />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /no se puede verificar/i,
    );
  });

  it("shows unavailable state when the network fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    render(<AccreditationVerification />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /no se puede verificar/i,
    );
  });
});
