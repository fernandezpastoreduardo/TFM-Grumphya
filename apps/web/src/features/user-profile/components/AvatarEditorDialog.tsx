import { useEffect, useRef, useState } from "react";
import type { FormEvent, PointerEvent } from "react";
import { createPortal } from "react-dom";
import { usePersistentTheme } from "../../../shared/hooks/use-persistent-theme";

const CROP_VIEWPORT_SIZE = 240;
const PREVIEW_SIZE = 104;
const AVATAR_OUTPUT_SIZE = 128;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.05;
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const IMAGE_VALIDATION_ERROR =
  "Elige una imagen JPG, PNG o WebP de hasta 5 MB.";
const CROP_ERROR =
  "No se ha podido preparar el recorte. Prueba con otra imagen.";

type AvatarEditorDialogProps = {
  avatarUrl: string | null | undefined;
  username: string;
  uploading: boolean;
  uploadError: string;
  onClose: () => void;
  onUpload: (file: File) => Promise<boolean>;
};

type DragPoint = { x: number; y: number };

export function AvatarEditorDialog({
  avatarUrl,
  username,
  uploading,
  uploadError,
  onClose,
  onUpload,
}: AvatarEditorDialogProps) {
  const { theme } = usePersistentTheme();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [offset, setOffset] = useState<DragPoint>({ x: 0, y: 0 });
  const [validationError, setValidationError] = useState("");
  const imageRef = useRef<HTMLImageElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const dragStartRef = useRef<{ pointer: DragPoint; offset: DragPoint } | null>(
    null,
  );

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLElement>("button")?.focus();
    return () => previousFocusRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !uploading) {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), [tabindex="0"]',
        ),
      );
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, uploading]);

  function chooseFile(nextFile: File | undefined) {
    setValidationError("");
    if (!nextFile) return;
    if (
      !ACCEPTED_IMAGE_TYPES.has(nextFile.type) ||
      nextFile.size > MAX_UPLOAD_BYTES
    ) {
      setValidationError(IMAGE_VALIDATION_ERROR);
      return;
    }
    setFile(nextFile);
    setZoom(MIN_ZOOM);
    setOffset({ x: 0, y: 0 });
  }

  function handleImageLoaded(image: HTMLImageElement) {
    setImageSize({ width: image.naturalWidth, height: image.naturalHeight });
  }

  function changeZoom(nextZoom: number) {
    setZoom(nextZoom);
    setOffset((current) => clampOffset(current, imageSize, nextZoom));
  }

  function updateHorizontalOffset(nextOffset: number) {
    setOffset((current) => ({ ...current, x: nextOffset }));
  }

  function updateVerticalOffset(nextOffset: number) {
    setOffset((current) => ({ ...current, y: nextOffset }));
  }

  function startDragging(event: PointerEvent<HTMLDivElement>) {
    if (!file) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStartRef.current = {
      pointer: { x: event.clientX, y: event.clientY },
      offset,
    };
  }

  function dragImage(event: PointerEvent<HTMLDivElement>) {
    const dragStart = dragStartRef.current;
    if (!dragStart) return;
    setOffset(
      clampOffset(
        {
          x: dragStart.offset.x + event.clientX - dragStart.pointer.x,
          y: dragStart.offset.y + event.clientY - dragStart.pointer.y,
        },
        imageSize,
        zoom,
      ),
    );
  }

  async function submitCrop(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const image = imageRef.current;
    if (!file || !image || imageSize.width === 0 || uploading) return;
    setValidationError("");
    try {
      if (await onUpload(await createCroppedAvatar(image, zoom, offset))) {
        onClose();
      }
    } catch {
      setValidationError(CROP_ERROR);
    }
  }

  const scale = getImageScale(imageSize, zoom);
  const imageTransform = `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`;
  const previewScale = PREVIEW_SIZE / CROP_VIEWPORT_SIZE;
  const previewTransform = `translate(calc(-50% + ${offset.x * previewScale}px), calc(-50% + ${offset.y * previewScale}px))`;

  return createPortal(
    <div className={`avatar-dialog-backdrop theme-${theme}`}>
      <section
        ref={dialogRef}
        className="avatar-editor-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="avatar-dialog-title"
      >
        <button
          className="avatar-dialog-close"
          type="button"
          aria-label="Cerrar edición del avatar"
          disabled={uploading}
          onClick={onClose}
        >
          <span aria-hidden="true">×</span>
        </button>
        <span className="eyebrow">Un retrato, sin salirte del círculo</span>
        <h2 id="avatar-dialog-title">Editar avatar</h2>
        <p className="avatar-dialog-copy">
          Elige una imagen, ajusta el encuadre y comprueba cómo quedará antes de
          subirla. La revisaremos automáticamente para uso público.
        </p>
        <form onSubmit={(event) => void submitCrop(event)}>
          <label className="avatar-file-picker button-secondary">
            {file ? "Cambiar imagen" : "Elegir imagen"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label="Elegir imagen de avatar"
              disabled={uploading}
              onChange={(event) => chooseFile(event.currentTarget.files?.[0])}
            />
          </label>
          <div className="avatar-crop-workspace">
            <div
              className={`avatar-crop-window${file ? " is-editable" : ""}`}
              role={file ? "application" : undefined}
              aria-label={
                file ? "Encuadre del avatar; arrastra para ajustar" : undefined
              }
              onPointerDown={startDragging}
              onPointerMove={dragImage}
              onPointerUp={() => {
                dragStartRef.current = null;
              }}
              onPointerCancel={() => {
                dragStartRef.current = null;
              }}
            >
              {previewUrl ? (
                <img
                  ref={imageRef}
                  className="avatar-crop-source"
                  src={previewUrl}
                  alt=""
                  draggable={false}
                  style={{
                    width: imageSize.width * scale,
                    height: imageSize.height * scale,
                    transform: imageTransform,
                  }}
                  onLoad={(event) => handleImageLoaded(event.currentTarget)}
                />
              ) : avatarUrl ? (
                <img src={avatarUrl} alt={`Avatar actual de ${username}`} />
              ) : (
                <span aria-hidden="true">
                  {username.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <div className="avatar-preview-column">
              <span>Así se verá</span>
              <div className="avatar-crop-preview" aria-hidden="true">
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt=""
                    draggable={false}
                    style={{
                      width: imageSize.width * scale * previewScale,
                      height: imageSize.height * scale * previewScale,
                      transform: previewTransform,
                    }}
                  />
                ) : avatarUrl ? (
                  <img src={avatarUrl} alt="" />
                ) : (
                  username.charAt(0).toUpperCase()
                )}
              </div>
              <small>Vista circular en tu perfil y rankings</small>
            </div>
          </div>
          <label className="avatar-zoom-control" htmlFor="avatar-zoom">
            <span>Zoom</span>
            <input
              id="avatar-zoom"
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={ZOOM_STEP}
              value={zoom}
              disabled={!file || uploading}
              onChange={(event) =>
                changeZoom(Number(event.currentTarget.value))
              }
            />
            <output htmlFor="avatar-zoom">{zoom.toFixed(1)}×</output>
          </label>
          <label className="avatar-zoom-control" htmlFor="avatar-pan-x">
            <span>Mover encuadre horizontal</span>
            <input
              id="avatar-pan-x"
              type="range"
              min={-getPanLimit(imageSize, zoom, "x")}
              max={getPanLimit(imageSize, zoom, "x")}
              step="any"
              value={offset.x}
              disabled={!file || uploading}
              onChange={(event) =>
                updateHorizontalOffset(Number(event.currentTarget.value))
              }
            />
            <output htmlFor="avatar-pan-x">{Math.round(offset.x)} px</output>
          </label>
          <label className="avatar-zoom-control" htmlFor="avatar-pan-y">
            <span>Mover encuadre vertical</span>
            <input
              id="avatar-pan-y"
              type="range"
              min={-getPanLimit(imageSize, zoom, "y")}
              max={getPanLimit(imageSize, zoom, "y")}
              step="any"
              value={offset.y}
              disabled={!file || uploading}
              onChange={(event) =>
                updateVerticalOffset(Number(event.currentTarget.value))
              }
            />
            <output htmlFor="avatar-pan-y">{Math.round(offset.y)} px</output>
          </label>
          <p className="avatar-moderation-copy">
            La imagen se envía a OpenAI para una revisión automática de
            contenido. El archivo publicado se normaliza y se guarda en el
            servidor.
          </p>
          <div className="avatar-dialog-actions">
            <button
              className="button-secondary"
              type="button"
              disabled={uploading}
              onClick={onClose}
            >
              Cancelar
            </button>
            <div className="avatar-dialog-submit-group">
              <button
                className="button-primary"
                type="submit"
                disabled={!file || imageSize.width === 0 || uploading}
              >
                {uploading ? "Revisando imagen…" : "Guardar avatar"}
              </button>
              {validationError || uploadError ? (
                <p className="avatar-dialog-error" role="alert">
                  {validationError || uploadError}
                </p>
              ) : null}
            </div>
          </div>
        </form>
      </section>
    </div>,
    document.body,
  );
}

function getImageScale(
  imageSize: { width: number; height: number },
  zoom: number,
): number {
  if (!imageSize.width || !imageSize.height) return 0;
  return (
    (CROP_VIEWPORT_SIZE / Math.min(imageSize.width, imageSize.height)) * zoom
  );
}

function clampOffset(
  offset: DragPoint,
  imageSize: { width: number; height: number },
  zoom: number,
): DragPoint {
  const scale = getImageScale(imageSize, zoom);
  const horizontalLimit = Math.max(
    0,
    (imageSize.width * scale - CROP_VIEWPORT_SIZE) / 2,
  );
  const verticalLimit = Math.max(
    0,
    (imageSize.height * scale - CROP_VIEWPORT_SIZE) / 2,
  );
  return {
    x: Math.min(horizontalLimit, Math.max(-horizontalLimit, offset.x)),
    y: Math.min(verticalLimit, Math.max(-verticalLimit, offset.y)),
  };
}

function getPanLimit(
  imageSize: { width: number; height: number },
  zoom: number,
  axis: "x" | "y",
): number {
  const scale = getImageScale(imageSize, zoom);
  const dimension = axis === "x" ? imageSize.width : imageSize.height;
  return Math.max(0, (dimension * scale - CROP_VIEWPORT_SIZE) / 2);
}

async function createCroppedAvatar(
  image: HTMLImageElement,
  zoom: number,
  offset: DragPoint,
): Promise<File> {
  const scale = getImageScale(
    { width: image.naturalWidth, height: image.naturalHeight },
    zoom,
  );
  const sourceSize = CROP_VIEWPORT_SIZE / scale;
  const sourceX = clampCropStart(
    (image.naturalWidth - sourceSize) / 2 - offset.x / scale,
    image.naturalWidth,
    sourceSize,
  );
  const sourceY = clampCropStart(
    (image.naturalHeight - sourceSize) / 2 - offset.y / scale,
    image.naturalHeight,
    sourceSize,
  );
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_OUTPUT_SIZE;
  canvas.height = AVATAR_OUTPUT_SIZE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Avatar canvas unavailable.");
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceSize,
    sourceSize,
    0,
    0,
    AVATAR_OUTPUT_SIZE,
    AVATAR_OUTPUT_SIZE,
  );
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) =>
        result ? resolve(result) : reject(new Error("Crop failed.")),
      "image/jpeg",
      0.92,
    );
  });
  return new File([blob], "avatar-recortado.jpg", { type: "image/jpeg" });
}

function clampCropStart(
  start: number,
  dimension: number,
  size: number,
): number {
  return Math.min(dimension - size, Math.max(0, start));
}
