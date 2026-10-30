import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RoastFailureDialog } from "./RoastFailureDialog";

describe("RoastFailureDialog", () => {
  it("explains the failed reply and closes from either action", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<RoastFailureDialog open onClose={onClose} />);

    const dialog = screen.getByRole("dialog", {
      name: "Se nos ha derramado el café",
    });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleDescription(
      /no se te ha descontado el envío/i,
    );
    expect(
      screen.getByRole("img", {
        name: "Grumphya triste junto a una taza de café derramada",
      }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cerrar aviso" }));
    expect(onClose).toHaveBeenCalledOnce();

    await user.click(
      screen.getByRole("button", { name: "Seguir intentándolo" }),
    );
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
