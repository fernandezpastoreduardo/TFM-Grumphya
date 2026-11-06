import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UserProfile } from "./user-profile";

vi.mock("../../infrastructure/auth/session", () => ({
  authenticatedFetch: (input: RequestInfo | URL, init?: RequestInit) =>
    fetch(input, init),
}));

const ACCOUNT_PROFILE = {
  user: {
    role: "user",
    email: "persona@example.es",
    username: "persona-lista",
    emailVerified: false,
    createdAt: "2026-10-16T12:00:00.000Z",
    publicRankingsOptIn: false,
    avatarUrl: null,
  },
  plans: [
    {
      plan: "ILUMINADO",
      status: "active",
      startsAt: "2026-10-16T12:00:00.000Z",
      expiresAt: "2026-11-16T12:00:00.000Z",
      attemptsRemaining: { ideas: 11, roasts: 0 },
    },
    {
      plan: "FALTON",
      status: "inactive",
      startsAt: null,
      expiresAt: null,
      attemptsRemaining: { ideas: 0, roasts: 0 },
    },
  ],
};
const GOOD_IDEAS = {
  ideas: [
    {
      id: "00000000-0000-4000-8000-000000000001",
      title: "Agenda compartida para equipos pequeños",
      createdAt: "2026-10-14T12:00:00.000Z",
    },
    {
      id: "00000000-0000-4000-8000-000000000002",
      title: "Mapa de comercios accesibles del barrio",
      createdAt: "2026-10-09T12:00:00.000Z",
    },
  ],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function prepareAvatarCrop() {
  vi.stubGlobal("URL", {
    createObjectURL: vi.fn(() => "blob:profile-avatar"),
    revokeObjectURL: vi.fn(),
  });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
    (callback) => callback(new Blob(["cropped"], { type: "image/jpeg" })),
  );
}

function markCropImageReady() {
  const image = document.querySelector<HTMLImageElement>(".avatar-crop-source");
  if (!image) throw new Error("Avatar crop preview did not render.");
  Object.defineProperties(image, {
    naturalWidth: { configurable: true, value: 640 },
    naturalHeight: { configurable: true, value: 320 },
  });
  fireEvent.load(image);
}

describe("UserProfile", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) =>
        String(input) === "/api/account/good-ideas"
          ? jsonResponse(GOOD_IDEAS)
          : jsonResponse(ACCOUNT_PROFILE),
      ),
    );
  });

  it("loads account details, plan state, attempts and the pending email notice", async () => {
    render(<UserProfile />);

    expect(
      await screen.findByRole("heading", { name: "persona-lista" }),
    ).toBeInTheDocument();
    expect(screen.getByText("persona@example.es")).toBeInTheDocument();
    expect(screen.getByText(/correo sin verificar/i)).toBeInTheDocument();
    expect(
      screen.getByText(/tu cuenta y tus planes activos siguen disponibles/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/11 de 11 evaluaciones disponibles hoy/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/0 de 11 envíos disponibles hoy/i),
    ).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/account/profile", undefined);
    expect(fetch).toHaveBeenCalledWith("/api/account/good-ideas", undefined);
    expect(
      screen.getByRole("checkbox", {
        name: /quiero aparecer en los rankings públicos/i,
      }),
    ).not.toBeChecked();
    expect(
      screen.getByRole("row", {
        name: /agenda compartida para equipos pequeños/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("2 ideas")).toBeInTheDocument();
  });

  it("shows Jappy's own account profile without replacing it with the admin dashboard", async () => {
    const adminProfile = {
      ...ACCOUNT_PROFILE,
      user: {
        ...ACCOUNT_PROFILE.user,
        role: "admin",
        username: "jappy",
        publicRankingsOptIn: true,
      },
    };
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/account/profile")
        return jsonResponse(adminProfile);
      if (String(input) === "/api/account/good-ideas")
        return jsonResponse(GOOD_IDEAS);
      throw new Error(`Unexpected request: ${String(input)}`);
    });
    render(<UserProfile />);

    expect(await screen.findByRole("heading", { name: "jappy" })).toBeVisible();
    expect(screen.getByText("persona@example.es")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Tus planes" })).toBeVisible();
    expect(screen.getAllByText("Ilimitado")).toHaveLength(2);
    expect(
      screen.getAllByText("Acceso ilimitado para esta cuenta."),
    ).toHaveLength(2);
    expect(
      screen.queryByRole("button", { name: "Pagar un café" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", {
        name: /quiero aparecer en los rankings públicos/i,
      }),
    ).toBeChecked();
    expect(screen.queryByText("Hola, Jappy.")).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalledWith("/api/admin/dashboard", undefined);
    expect(fetch).not.toHaveBeenCalledWith(
      "/api/admin/contact-messages",
      undefined,
    );
  });

  it("records optional consent before including the account in public rankings", async () => {
    const optedInProfile = {
      ...ACCOUNT_PROFILE,
      user: { ...ACCOUNT_PROFILE.user, publicRankingsOptIn: true },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === "/api/account/good-ideas")
          return jsonResponse(GOOD_IDEAS);
        if (String(input) === "/api/account/privacy/rankings") {
          expect(init?.method).toBe("POST");
          expect(init?.body).toBe(JSON.stringify({ enabled: true }));
          return jsonResponse(optedInProfile);
        }
        return jsonResponse(ACCOUNT_PROFILE);
      }),
    );
    const user = userEvent.setup();
    render(<UserProfile />);

    const rankingConsent = await screen.findByRole("checkbox", {
      name: /quiero aparecer en los rankings públicos/i,
    });
    expect(rankingConsent).not.toBeChecked();
    await user.click(rankingConsent);

    expect(await screen.findByRole("checkbox")).toBeChecked();
  });

  it("shows an empty state instead of a sample table when there are no approved ideas", async () => {
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) =>
      String(input) === "/api/account/good-ideas"
        ? jsonResponse({ ideas: [] })
        : jsonResponse(ACCOUNT_PROFILE),
    );
    render(<UserProfile />);

    expect(
      await screen.findByText(
        /todavía no tienes ideas aprobadas guardadas en tu perfil/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("table", { name: /últimas ideas aprobadas/i }),
    ).not.toBeInTheDocument();
  });

  it("purchases only an inactive plan through the simulated payment dialog", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      if (String(input) === "/api/account/profile")
        return jsonResponse(ACCOUNT_PROFILE);
      if (String(input) === "/api/account/good-ideas")
        return jsonResponse(GOOD_IDEAS);
      expect(init?.method).toBe("POST");
      expect(String(input)).toBe("/api/account/subscriptions/purchase");
      expect(JSON.parse(String(init?.body))).toEqual({ plan: "FALTON" });
      expect(new Headers(init?.headers).get("Idempotency-Key")).toMatch(
        /^[0-9a-f-]{36}$/i,
      );
      return jsonResponse({
        ...ACCOUNT_PROFILE,
        plans: [
          ACCOUNT_PROFILE.plans[0],
          {
            ...ACCOUNT_PROFILE.plans[1],
            status: "active",
            startsAt: "2026-10-16T12:00:00.000Z",
            expiresAt: "2026-11-16T12:00:00.000Z",
            attemptsRemaining: { ideas: 0, roasts: 11 },
          },
        ],
      });
    });
    render(<UserProfile />);

    await screen.findByRole("heading", { name: "persona-lista" });
    expect(
      screen.getByRole("button", { name: "Pagar un café" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /baja.*iluminado/i }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Pagar un café" }));

    expect(await screen.findByRole("dialog")).toHaveTextContent(
      /activando tu plan faltón/i,
    );
    expect(
      screen.getByText(/11 de 11 envíos disponibles hoy/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Pagar un café" }),
    ).not.toBeInTheDocument();
  });

  it("uploads a profile avatar and shows the moderated server image", async () => {
    prepareAvatarCrop();
    const user = userEvent.setup();
    const avatarUrl = "/api/avatars/00000000-0000-4000-8000-000000000099.webp";
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      if (String(input) === "/api/account/avatar") {
        expect(init?.method).toBe("POST");
        expect(init?.body).toBeInstanceOf(FormData);
        return jsonResponse({ avatarUrl });
      }
      return String(input) === "/api/account/good-ideas"
        ? jsonResponse(GOOD_IDEAS)
        : jsonResponse(ACCOUNT_PROFILE);
    });
    render(<UserProfile />);
    await screen.findByRole("heading", { name: "persona-lista" });

    await user.click(screen.getByRole("button", { name: "Editar avatar" }));
    expect(
      screen.getByRole("dialog", { name: "Editar avatar" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /la imagen se envía a openai para una revisión automática/i,
      ),
    ).toBeInTheDocument();
    const file = new File(["image-bytes"], "profile.png", {
      type: "image/png",
    });
    await user.upload(screen.getByLabelText("Elegir imagen de avatar"), file);
    markCropImageReady();
    await user.click(screen.getByRole("button", { name: "Guardar avatar" }));

    expect(
      await screen.findByRole("img", { name: "Avatar de persona-lista" }),
    ).toHaveAttribute("src", avatarUrl);
    const formData = vi
      .mocked(fetch)
      .mock.calls.find(
        ([input]) => String(input) === "/api/account/avatar",
      )?.[1]?.body;
    expect(formData).toBeInstanceOf(FormData);
    expect((formData as FormData).get("avatar")).toMatchObject({
      name: "avatar-recortado.jpg",
      type: "image/jpeg",
    });
  });

  it("shows a friendly avatar error instead of exposing an internal server error", async () => {
    prepareAvatarCrop();
    const user = userEvent.setup();
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) =>
      String(input) === "/api/account/avatar"
        ? jsonResponse(
            {
              statusCode: 500,
              message: "Internal server error",
            },
            500,
          )
        : String(input) === "/api/account/good-ideas"
          ? jsonResponse(GOOD_IDEAS)
          : jsonResponse(ACCOUNT_PROFILE),
    );
    render(<UserProfile />);
    await screen.findByRole("heading", { name: "persona-lista" });

    await user.click(screen.getByRole("button", { name: "Editar avatar" }));
    await user.upload(
      screen.getByLabelText("Elegir imagen de avatar"),
      new File(["image-bytes"], "profile.png", { type: "image/png" }),
    );
    markCropImageReady();
    await user.click(screen.getByRole("button", { name: "Guardar avatar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /no se ha podido actualizar el avatar/i,
    );
    expect(
      screen.queryByText(/internal server error/i),
    ).not.toBeInTheDocument();
  });
});
