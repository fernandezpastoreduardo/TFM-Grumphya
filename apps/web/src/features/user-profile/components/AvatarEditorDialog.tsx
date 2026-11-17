import { useEffect, useRef, useState } from "react";
import type { FormEvent, PointerEvent } from "react";
import { createPortal } from "react-dom";
import { usePersistentTheme } from "../../../shared/hooks/use-persistent-theme";
import type {
  AvatarEditorDialogProps,
  DragPoint,
} from "./avatar-editor.models";
import {
  ACCEPTED_IMAGE_TYPES,
  CROP_ERROR,
  CROP_VIEWPORT_SIZE,
  IMAGE_VALIDATION_ERROR,
  MAX_UPLOAD_BYTES,
  MAX_ZOOM,
  MIN_ZOOM,
  PREVIEW_SIZE,
  ZOOM_STEP,
  clampOffset,
  createCroppedAvatar,
  getImageScale,
  getPanLimit,
} from "./avatar-editor.utils";

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
