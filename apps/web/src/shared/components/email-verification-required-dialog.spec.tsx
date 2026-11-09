import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EmailVerificationRequiredDialog } from "./email-verification-required-dialog";

describe("EmailVerificationRequiredDialog", () => {
  it("shows the exact verification instruction and spilled coffee asset", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<EmailVerificationRequiredDialog open onClose={onClose} />);

    const dialog = screen.getByRole("dialog", {
      name: "Por seguridad tienes que confirmar tu correo",
    });
    expect(dialog).toHaveAccessibleDescription(
      "Te hemos enviado un email con un enlace para que puedas confirmarlo.",
    );
    expect(
      screen.getByRole("img", {
        name: "Grumphya triste junto a una taza de café derramada",
      }),
    ).toHaveAttribute(
      "src",
      "/assets/grumphya/evaluation-error-spilled-coffee.svg",
    );

    await user.click(screen.getByRole("button", { name: "Entendido" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
