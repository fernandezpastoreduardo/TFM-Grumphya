import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UserDelete } from "./user-delete";

const { authenticatedFetch, clearAccessToken } = vi.hoisted(() => ({
  authenticatedFetch: vi.fn(),
  clearAccessToken: vi.fn(),
}));
vi.mock("../../infrastructure/auth/session", () => ({
  authenticatedFetch,
  clearAccessToken,
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("UserDelete", () => {
  beforeEach(() => {
    authenticatedFetch.mockReset();
    clearAccessToken.mockReset();
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.setAttribute("open", "");
      },
    });
    Object.defineProperty(HTMLDialogElement.prototype, "close", {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.removeAttribute("open");
      },
    });
  });

  it("explains immediate physical deletion and lets the user cancel", async () => {
    const user = userEvent.setup();
    render(<UserDelete />);

    await user.click(
      screen.getByRole("button", { name: "Darme de baja y BORRAR MI CUENTA" }),
    );

    const dialog = screen.getByRole("dialog", {
      name: "Esta acción no se puede deshacer",
    });
    expect(dialog).toHaveTextContent(/la baja es inmediata/i);
    expect(dialog).toHaveTextContent(
      /usuario, tus ideas aprobadas y los intentos restantes/i,
    );
    expect(dialog).toHaveTextContent(/borrado es físico/i);
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(authenticatedFetch).not.toHaveBeenCalled();
  });

  it("sends the explicit confirmation request and reports successful deletion", async () => {
    const user = userEvent.setup();
    const onDeleted = vi.fn();
    authenticatedFetch.mockResolvedValue(jsonResponse({ deleted: true }));
    render(<UserDelete onDeleted={onDeleted} />);

    await user.click(
      screen.getByRole("button", { name: "Darme de baja y BORRAR MI CUENTA" }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "Confirmo que quiero darme de baja",
      }),
    );

    expect(authenticatedFetch).toHaveBeenCalledWith("/api/account", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(onDeleted).toHaveBeenCalledOnce();
    expect(clearAccessToken).toHaveBeenCalledOnce();
  });

  it("keeps the dialog open and shows an error if the server rejects deletion", async () => {
    const user = userEvent.setup();
    authenticatedFetch.mockResolvedValue(jsonResponse({}, 503));
    render(<UserDelete />);

    await user.click(
      screen.getByRole("button", { name: "Darme de baja y BORRAR MI CUENTA" }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "Confirmo que quiero darme de baja",
      }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /tu cuenta sigue activa/i,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
