import { act, render, screen } from "@testing-library/react";
import { Suspense } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PasswordReset } from "./password-reset";

const GENERIC_NOTICE =
  "Si existe una cuenta activa con ese correo, recibirás instrucciones para cambiar la contraseña.";
const LOCATION_DESCRIPTOR = Object.getOwnPropertyDescriptor(window, "location");

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  if (LOCATION_DESCRIPTOR)
    Object.defineProperty(window, "location", LOCATION_DESCRIPTOR);
});

describe("PasswordReset", () => {
  it("keeps the reset token when a sibling delays the first render", async () => {
    const token = "c".repeat(64);
    window.history.replaceState({}, "", `/restablecer-contrasena#${token}`);
    let release: () => void = () => undefined;
    let ready = false;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    function DelayedSibling() {
      if (!ready) throw pending;
      return null;
    }
    render(
      <Suspense fallback={<p>Cargando</p>}>
        <PasswordReset />
        <DelayedSibling />
      </Suspense>,
    );
    expect(screen.getByText("Cargando")).toBeInTheDocument();
    ready = true;
    await act(async () => release());
    expect(screen.getByLabelText("Nueva contraseña")).toBeInTheDocument();
    expect(window.location.hash).toBe("");
  });

  it("submits an email and always displays the generic request message", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ message: GENERIC_NOTICE })),
    );
    render(<PasswordReset />);
    await user.type(
      screen.getByLabelText(/correo electrónico/i),
      "persona@example.com",
    );
    await user.click(
      screen.getByRole("button", { name: /enviar instrucciones/i }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(GENERIC_NOTICE);
    expect(fetch).toHaveBeenCalledWith(
      "/api/auth/password-reset/request",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("changes the password with a token and shows an accessible final screen", async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, hash: `#${"a".repeat(64)}` },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ message: "ok" })),
    );
    render(<PasswordReset />);
    await user.type(
      screen.getByLabelText("Nueva contraseña"),
      "NuevaClaveSegura42!",
    );
    await user.type(
      screen.getByLabelText("Repite la contraseña"),
      "NuevaClaveSegura42!",
    );
    await user.click(
      screen.getByRole("button", { name: /guardar contraseña/i }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      /se ha actualizado/i,
    );
    expect(
      screen.getByRole("link", { name: /volver a iniciar sesión/i }),
    ).toHaveAttribute("href", "/login");
    expect(fetch).toHaveBeenCalledWith(
      "/api/auth/password-reset/complete",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          token: "a".repeat(64),
          password: "NuevaClaveSegura42!",
        }),
      }),
    );
  });

  it("rejects mismatched password confirmation before sending", async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, hash: `#${"b".repeat(64)}` },
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<PasswordReset />);
    await user.type(
      screen.getByLabelText("Nueva contraseña"),
      "NuevaClaveSegura42!",
    );
    await user.type(
      screen.getByLabelText("Repite la contraseña"),
      "OtraClaveSegura42!",
    );
    await user.click(
      screen.getByRole("button", { name: /guardar contraseña/i }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/no coinciden/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
