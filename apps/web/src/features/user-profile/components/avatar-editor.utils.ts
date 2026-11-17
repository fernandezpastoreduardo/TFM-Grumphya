export const CROP_VIEWPORT_SIZE = 240;
export const PREVIEW_SIZE = 104;
export const AVATAR_OUTPUT_SIZE = 128;
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 3;
export const ZOOM_STEP = 0.05;
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
export const IMAGE_VALIDATION_ERROR =
  "Elige una imagen JPG, PNG o WebP de hasta 5 MB.";
export const CROP_ERROR =
  "No se ha podido preparar el recorte. Prueba con otra imagen.";

export function getImageScale(
  imageSize: { width: number; height: number },
  zoom: number,
): number {
  if (!imageSize.width || !imageSize.height) return 0;
  return (
    (CROP_VIEWPORT_SIZE / Math.min(imageSize.width, imageSize.height)) * zoom
  );
}

export function clampOffset(
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

export function getPanLimit(
  imageSize: { width: number; height: number },
  zoom: number,
  axis: "x" | "y",
): number {
  const scale = getImageScale(imageSize, zoom);
  const dimension = axis === "x" ? imageSize.width : imageSize.height;
  return Math.max(0, (dimension * scale - CROP_VIEWPORT_SIZE) / 2);
}

export async function createCroppedAvatar(
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

export function clampCropStart(
  start: number,
  dimension: number,
  size: number,
): number {
  return Math.min(dimension - size, Math.max(0, start));
}
import type { DragPoint } from "./avatar-editor.models";
