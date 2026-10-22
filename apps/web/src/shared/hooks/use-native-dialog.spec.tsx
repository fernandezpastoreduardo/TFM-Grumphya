import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useNativeDialog } from "./use-native-dialog";

const DIALOG_NAME = "Diálogo de prueba";

function NativeDialogHarness({ open }: { open: boolean }) {
  const dialogRef = useNativeDialog(open);

  return (
    <dialog ref={dialogRef} aria-label={DIALOG_NAME}>
      Contenido
    </dialog>
  );
}

describe("useNativeDialog", () => {
  it("opens and closes through the native modal API when available", () => {
    const { container, rerender } = render(
      <NativeDialogHarness open={false} />,
    );
    const dialog = container.querySelector("dialog");
    if (!dialog) throw new Error("Dialog did not render.");
    const showModal = vi.fn(() => dialog.setAttribute("open", ""));
    const close = vi.fn(() => dialog.removeAttribute("open"));
    Object.defineProperty(dialog, "showModal", {
      configurable: true,
      value: showModal,
    });
    Object.defineProperty(dialog, "close", {
      configurable: true,
      value: close,
    });

    rerender(<NativeDialogHarness open />);

    expect(showModal).toHaveBeenCalledOnce();
    expect(dialog).toHaveAttribute("open");

    rerender(<NativeDialogHarness open={false} />);

    expect(close).toHaveBeenCalledOnce();
    expect(dialog).not.toHaveAttribute("open");
  });

  it("uses the open attribute fallback when the native modal API is unavailable", () => {
    const { container, rerender } = render(<NativeDialogHarness open />);
    const dialog = container.querySelector("dialog");
    if (!dialog) throw new Error("Dialog did not render.");

    expect(dialog).toHaveAttribute("open");

    rerender(<NativeDialogHarness open={false} />);

    expect(dialog).not.toHaveAttribute("open");
  });
});
