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
  issuedAt: "2026-10-28T09:38:54.000Z",
  validatedAt: "2026-10-28T11:30:00.000Z",
  validationMethod: "Revisión técnica interna de código y pruebas",
  expiresAt: null,
  scope: "Prototipo académico de buenas prácticas",
  criteria: ["Revisión de controles documentados"],
  assurances: [
    {
      id: "privacy",
      title: "Privacidad con controles documentados",
      description: "Política y mecanismos de control de datos",
      evidence: "Revisión de código y pruebas automatizadas",
      limitation: "Revisión jurídica y operativa pendiente",
    },
  ],
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
    expect(within(article).getAllByText("28 de octubre de 2026")).toHaveLength(
      2,
    );
    expect(
      within(article).getByText("Privacidad con controles documentados"),
    ).toBeVisible();
    expect(
      within(article).getByText("Revisión jurídica y operativa pendiente"),
    ).toBeVisible();
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
    ["missing validation", { ...record, validatedAt: undefined }],
    [
      "malformed assurance",
      { ...record, assurances: [{ id: "privacy", title: "Claim" }] },
    ],
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
