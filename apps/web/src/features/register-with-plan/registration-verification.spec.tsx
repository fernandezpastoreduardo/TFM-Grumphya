import { render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { RegistrationVerification } from "./registration-verification";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("RegistrationVerification", () => {
  beforeEach(() => {
    window.history.replaceState(
      {},
      "",
      "/verificar-cuenta#token-de-un-solo-uso",
    );
  });

  it("waits for an explicit email confirmation before consuming the token", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse({ status: "email_verified", plan: "FALTON" }),
        )
        .mockResolvedValueOnce(
          jsonResponse({ status: "active", plan: "FALTON" }),
        ),
    );
    render(
      <StrictMode>
        <RegistrationVerification />
      </StrictMode>,
    );

    expect(
      await screen.findByRole("heading", { name: /confirma tu correo/i }),
    ).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /confirmar correo/i }));
    expect(
      await screen.findByRole("heading", { name: /correo verificado/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /confirmar contratación simulada/i }),
    ).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "/api/registrations/verify",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ token: "token-de-un-solo-uso" }),
      }),
    );
    expect(window.location.hash).toBe("");

    await userEvent.setup().click(
      screen.getByRole("button", {
        name: /confirmar contratación simulada/i,
      }),
    );

    expect(
      await screen.findByRole("heading", {
        name: /contratación simulada completada/i,
      }),
    ).toBeInTheDocument();
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/api/registrations/confirm",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("does not confirm the plan when verification fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 400)));
    render(<RegistrationVerification />);

    await userEvent
      .setup()
      .click(await screen.findByRole("button", { name: /confirmar correo/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /no se ha podido verificar/i,
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("prevents duplicate verification requests while the first request is pending", async () => {
    let resolveVerification!: (response: Response) => void;
    const pendingVerification = new Promise<Response>((resolve) => {
      resolveVerification = resolve;
    });
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(pendingVerification));
    const user = userEvent.setup();
    render(<RegistrationVerification />);

    await user.click(
      await screen.findByRole("button", { name: /confirmar correo/i }),
    );
    const verifyingButton = await screen.findByRole("button", {
      name: /verificando/i,
    });

    expect(verifyingButton).toBeDisabled();
    await user.click(verifyingButton);
    expect(fetch).toHaveBeenCalledTimes(1);

    resolveVerification(
      jsonResponse({ status: "email_verified", plan: "FALTON" }),
    );
    expect(
      await screen.findByRole("heading", { name: /correo verificado/i }),
    ).toBeInTheDocument();
  });

  it("offers a generic resend from an expired or invalid verification link", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({}, 400))
        .mockResolvedValueOnce(
          jsonResponse({ status: "verification_pending" }),
        ),
    );
    const user = userEvent.setup();
    render(<RegistrationVerification />);

    await user.click(
      await screen.findByRole("button", { name: /confirmar correo/i }),
    );

    await user.type(
      await screen.findByLabelText(/correo electrónico usado en el alta/i),
      "persona@example.es",
    );
    await user.click(
      screen.getByRole("button", { name: /solicitar otro enlace/i }),
    );

    expect(await screen.findByRole("status")).toHaveTextContent(
      /si hay una verificación pendiente/i,
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/api/registrations/resend-verification",
      expect.objectContaining({
        body: JSON.stringify({ email: "persona@example.es" }),
      }),
    );
  });

  it("keeps verified email and offers a retry when plan confirmation fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse({ status: "email_verified", plan: "ILUMINADO" }),
        )
        .mockResolvedValueOnce(jsonResponse({}, 503)),
    );
    const user = userEvent.setup();
    render(<RegistrationVerification />);

    await user.click(
      await screen.findByRole("button", { name: /confirmar correo/i }),
    );

    await user.click(
      await screen.findByRole("button", {
        name: /confirmar contratación simulada/i,
      }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /correo ya está verificado/i,
    );
    expect(
      screen.getByRole("button", { name: /reintentar confirmación/i }),
    ).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
