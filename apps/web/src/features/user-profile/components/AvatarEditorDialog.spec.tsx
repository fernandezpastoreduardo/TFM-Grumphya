import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AvatarEditorDialog } from "./AvatarEditorDialog";

const USERNAME = "persona-lista";
const AVATAR_URL = "/api/avatars/00000000-0000-4000-8000-000000000099.webp";
const ACCESSIBLE_CROP_DIALOG_TIMEOUT_MS = 10_000;

function makeImageFile() {
  return new File(["image-bytes"], "portrait.png", { type: "image/png" });
}

function loadCropImage(width: number, height: number) {
  const image = document.querySelector<HTMLImageElement>(".avatar-crop-source");
  if (!image) throw new Error("Crop source image did not render.");
  Object.defineProperties(image, {
    naturalWidth: { configurable: true, value: width },
    naturalHeight: { configurable: true, value: height },
  });
  fireEvent.load(image);
  return image;
}

describe("AvatarEditorDialog", () => {
  beforeEach(() => {
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:avatar-preview"),
      revokeObjectURL: vi.fn(),
    });
  });

  it(
    "presents an accessible circular preview and crop controls",
    async () => {
      const user = userEvent.setup();
      render(
        <AvatarEditorDialog
          avatarUrl={AVATAR_URL}
          username={USERNAME}
          uploading={false}
          uploadError=""
          onClose={vi.fn()}
          onUpload={vi.fn().mockResolvedValue(true)}
        />,
      );

      expect(
        screen.getByRole("dialog", { name: "Editar avatar" }),
      ).toHaveAttribute("aria-modal", "true");
      expect(
        screen.getByRole("img", { name: "Avatar actual de persona-lista" }),
      ).toHaveAttribute("src", AVATAR_URL);
      expect(screen.getByText("Así se verá")).toBeInTheDocument();
      expect(screen.getByRole("slider", { name: /^Zoom/ })).toBeDisabled();
      expect(
        screen.getByRole("slider", { name: /^Mover encuadre horizontal/ }),
      ).toBeDisabled();
      expect(
        screen.getByRole("slider", { name: /^Mover encuadre vertical/ }),
      ).toBeDisabled();

      await user.upload(
        screen.getByLabelText("Elegir imagen de avatar"),
        makeImageFile(),
      );
      loadCropImage(640, 320);

      expect(
        await screen.findByRole("application", {
          name: "Encuadre del avatar; arrastra para ajustar",
        }),
      ).toBeInTheDocument();
      expect(screen.getByRole("slider", { name: /^Zoom/ })).toBeEnabled();
      expect(
        screen.getByRole("slider", { name: /^Mover encuadre horizontal/ }),
      ).toBeEnabled();
      expect(
        screen.getByRole("slider", { name: /^Mover encuadre vertical/ }),
      ).toBeEnabled();
      expect(
        screen.getByRole("button", { name: "Guardar avatar" }),
      ).toBeEnabled();
      expect(
        screen.getByText(/revisión automática de contenido/i),
      ).toBeInTheDocument();
    },
    ACCESSIBLE_CROP_DIALOG_TIMEOUT_MS,
  );

  it("rejects unsupported images and keeps the edit dialog open", async () => {
    const user = userEvent.setup({ applyAccept: false });
    const onClose = vi.fn();
    const onUpload = vi.fn().mockResolvedValue(true);
    render(
      <AvatarEditorDialog
        avatarUrl={null}
        username={USERNAME}
        uploading={false}
        uploadError=""
        onClose={onClose}
        onUpload={onUpload}
      />,
    );

    await user.upload(
      screen.getByLabelText("Elegir imagen de avatar"),
      new File(["script"], "image.svg", { type: "image/svg+xml" }),
    );

    const validationError = await screen.findByRole("alert");
    expect(validationError).toHaveTextContent(
      "Elige una imagen JPG, PNG o WebP de hasta 5 MB.",
    );
    const submitButton = screen.getByRole("button", {
      name: "Guardar avatar",
    });
    expect(submitButton.parentElement).toHaveClass(
      "avatar-dialog-submit-group",
    );
    expect(submitButton.parentElement).toContainElement(validationError);
    expect(
      screen.getByRole("dialog", { name: "Editar avatar" }),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(onUpload).not.toHaveBeenCalled();
  });

  it("uses zoom and both framing sliders to upload a square 128px crop", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onUpload = vi.fn().mockResolvedValue(true);
    const drawImage = vi.fn();
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
    const toBlob = vi
      .spyOn(HTMLCanvasElement.prototype, "toBlob")
      .mockImplementation((callback) => {
        callback(new Blob(["cropped-avatar"], { type: "image/jpeg" }));
      });
    render(
      <AvatarEditorDialog
        avatarUrl={null}
        username={USERNAME}
        uploading={false}
        uploadError=""
        onClose={onClose}
        onUpload={onUpload}
      />,
    );

    await user.upload(
      screen.getByLabelText("Elegir imagen de avatar"),
      makeImageFile(),
    );
    loadCropImage(640, 320);
    await waitFor(() =>
      expect(screen.getByRole("slider", { name: /^Zoom/ })).toBeEnabled(),
    );
    fireEvent.change(screen.getByRole("slider", { name: /^Zoom/ }), {
      target: { value: "2" },
    });
    fireEvent.change(
      screen.getByRole("slider", { name: /^Mover encuadre horizontal/ }),
      { target: { value: "60" } },
    );
    fireEvent.change(
      screen.getByRole("slider", { name: /^Mover encuadre vertical/ }),
      { target: { value: "30" } },
    );

    await user.click(screen.getByRole("button", { name: "Guardar avatar" }));

    await waitFor(() => expect(onUpload).toHaveBeenCalledOnce());
    const croppedFile = vi.mocked(onUpload).mock.calls[0][0];
    expect(croppedFile).toBeInstanceOf(File);
    expect(croppedFile.name).toBe("avatar-recortado.jpg");
    expect(croppedFile.type).toBe("image/jpeg");
    expect(croppedFile.size).toBeGreaterThan(0);
    expect(drawImage).toHaveBeenCalledWith(
      expect.any(HTMLImageElement),
      200,
      60,
      160,
      160,
      0,
      0,
      128,
      128,
    );
    const canvas = getContext.mock.contexts[0] as HTMLCanvasElement;
    expect(canvas.width).toBe(128);
    expect(canvas.height).toBe(128);
    expect(toBlob).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes on cancel without uploading and preserves the current avatar", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onUpload = vi.fn();
    render(
      <AvatarEditorDialog
        avatarUrl={AVATAR_URL}
        username={USERNAME}
        uploading={false}
        uploadError=""
        onClose={onClose}
        onUpload={onUpload}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(onUpload).not.toHaveBeenCalled();
  });
});
